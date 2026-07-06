# Deploying the Pathlands Game Server (Phase 6)

This runs the **authoritative multiplayer server** on an Ubuntu VPS (e.g. Hostinger),
behind nginx with TLS so browsers can reach it over `wss://`. The **client** stays a
static build (Vercel or the same VPS — see `docs/DEPLOY.md`); it only connects to a
server when built with `VITE_PATHLANDS_SERVER` set.

> Scope: as of Phase 6 Parts 1–4 the server is authoritative over **player movement**
> (two players see each other move, reconciled + interest-managed) and has **accounts +
> durable character persistence** (register/login, cloud-saved characters). Server-side
> combat and the client login UI land in later parts — this deploy is what you need for the
> first multiplayer movement test.

---

## 0. Prerequisites

- An Ubuntu VPS with a public IP, ports **80** and **443** open.
- A domain or subdomain pointed at the VPS — an **A record** like
  `play.yourdomain.com → <VPS IP>`.
- Docker Engine + Compose plugin, and certbot on the host:

  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo apt-get update && sudo apt-get install -y certbot
  ```

## 1. Get the code

```bash
git clone https://github.com/EinPallux/PathlandsMMO.git
cd PathlandsMMO
```

## 2. Point nginx at your domain

Edit `deploy/nginx/pathlands.conf` and replace every `play.example.com` with your real
hostname (three places: the port-80 `server_name`, the port-443 `server_name`, and the two
`ssl_certificate*` paths).

## 3. Issue a TLS certificate

Certbot runs on the host in **standalone** mode (it binds port 80 briefly), writing certs
to `/etc/letsencrypt`, which the compose file mounts read-only into nginx:

```bash
sudo certbot certonly --standalone -d play.yourdomain.com
```

## 4. Set the auth secret

Accounts sign session tokens with a server secret. It is **required** — compose refuses to
start without it. Create a `.env` file next to `docker-compose.yml` with a strong random
value (changing it later logs everyone out):

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" > .env
```

Accounts and characters persist in the `gamedata` Docker volume (the server's `FileStore`,
`/data/pathlands.json`), so they survive restarts and redeploys. Back it up with
`docker run --rm -v pathlandsmmo_gamedata:/d -v "$PWD":/b alpine tar czf /b/gamedata.tgz -C /d .`.

## 5. Start the server + nginx

```bash
sudo docker compose up -d --build
```

Verify the server is healthy end-to-end:

```bash
curl https://play.yourdomain.com/healthz     # → ok
curl https://play.yourdomain.com/status      # → {"status":"ok","players":0,...}
```

`docker compose logs -f game` should show
`[pathlands] server listening on ws://0.0.0.0:8080 (20 Hz sim ...)`.

## 6. Build the client to point at your server

The client is a **static build**; the server URL is baked in at build time. It must be
`wss://` (an `https://` page cannot open an insecure `ws://` socket):

```bash
VITE_PATHLANDS_SERVER=wss://play.yourdomain.com pnpm build
```

> Accounts are live on the server — `POST /auth/register` and `/auth/login` return a token,
> and `GET`/`PUT /character` is the bearer-authenticated cloud save. The **client login UI**
> that uses them ships in the next part; until then the client connects as a guest, and you
> can exercise accounts directly against the REST API
> (e.g. `curl -X POST https://play.yourdomain.com/auth/register -d '{"email":"…","password":"…"}'`).

Deploy the resulting `dist/` however you like (Vercel, or the VPS nginx — see
`docs/DEPLOY.md`). Open it in two browsers, create a character in each, and walk around —
each should see the other move.

Leave `VITE_PATHLANDS_SERVER` **unset** to build the standalone single-player client (no
server dependency), exactly as Phases 1–5.

---

## Operating it

- **Status / metrics:** `curl https://play.yourdomain.com/status` — server tick, player
  count, connections, uptime, protocol version, world seed.
- **Logs:** `docker compose logs -f game`
- **Update to a new version:**

  ```bash
  git pull
  sudo docker compose up -d --build
  ```

- **Tuning** (optional env in `docker-compose.yml` under `game:`): `MAX_CONNECTIONS`,
  `MAX_MSGS_PER_SEC`, `HEARTBEAT_MS`, `PORT`. Defaults live in `server/src/config.ts`.

### TLS renewal

certbot standalone needs port 80 free, so stop nginx for the renewal and restart it after.
Add a host cron (as root):

```cron
0 3 * * 1 cd /path/to/PathlandsMMO && docker compose stop nginx && certbot renew --standalone && docker compose start nginx
```

(nginx is down for a few seconds once a week during renewal — acceptable for a game server;
switch to the webroot challenge later if you want zero-downtime renewal.)

### PostgreSQL (accounts phase, later)

The compose file declares a `db` service behind the `db` profile. The server does **not**
use it yet. When the accounts phase lands, start it with:

```bash
sudo POSTGRES_PASSWORD=<strong-password> docker compose --profile db up -d
```

---

## Notes & limitations

- The image runs the TypeScript entry directly with `tsx` (no build step); `shared/` is
  imported unchanged, matching the local `pnpm start:server`. The Docker image installs
  only the `server` + `shared` workspaces — the client's `three`/`react`/`vite` are never
  pulled in.
- Single game process target is ~200 CCU (ARCH §7). Zone-sharding is the documented escape
  hatch, not built until load tests demand it.
- Accounts + characters are durable (the `gamedata` volume); live in-world state (who is
  connected, exact positions between saves) is in memory, so a restart drops sessions and
  players reconnect — an authenticated character resumes at its last saved position.
