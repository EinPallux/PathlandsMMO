# Deploying the Pathlands Game Server (Phase 6)

This runs the **authoritative multiplayer server** on an Ubuntu VPS (e.g. Hostinger),
behind nginx with TLS so browsers can reach it over `wss://`. The **client** stays a
static build (Vercel or the same VPS — see `docs/DEPLOY.md`); it only connects to a
server when built with `VITE_PATHLANDS_SERVER` set.

> Scope: as of Phase 6 Parts 1–2 the server is authoritative over **player movement**
> (two players see each other move, reconciled + interest-managed). Accounts/persistence
> (PostgreSQL) and server-side combat land in later parts — this deploy is what you need
> for the first multiplayer movement test.

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

## 4. Start the server + nginx

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

## 5. Build the client to point at your server

The client is a **static build**; the server URL is baked in at build time. It must be
`wss://` (an `https://` page cannot open an insecure `ws://` socket):

```bash
VITE_PATHLANDS_SERVER=wss://play.yourdomain.com pnpm build
```

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
- The server holds world state in memory only — until the persistence phase, a restart
  resets connected sessions (players simply reconnect and re-spawn).
