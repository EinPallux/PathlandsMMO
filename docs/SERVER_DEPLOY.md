# Deploying Pathlands (Phase 6)

This runs the whole game on an Ubuntu VPS (e.g. Hostinger): the **authoritative multiplayer
server** plus **nginx with TLS** that serves the static client **and** reverse-proxies the
WebSocket + account API on the **same origin**. One `docker compose up` builds and starts
everything — the VPS needs only Docker (the client is built inside the image, no host Node).

Pathlands is **MMO-only** — the client always connects to a server. Because the same nginx
serves the client and proxies the WebSocket, the client defaults its server URL to its own
origin, so **no build config is needed**. You only set `VITE_PATHLANDS_SERVER` when the client
is hosted **separately** (e.g. on Vercel, pointed at `wss://play.yourdomain.com`).

> Scope: the server is authoritative over **movement + combat** (enemies, casts, XP, loot,
> death/respawn), has **accounts + durable character persistence** (register/login, cloud-saved
> characters), and a full **social layer** (chat, emotes, parties, whispers, `/who`). This deploy
> is the current multiplayer build.

---

## 0. Prerequisites

- An Ubuntu VPS with a public IP, ports **80** and **443** open, and ideally **≥ 2 GB RAM**
  (the client build runs Vite in the image; on a 1 GB box add swap — see the note in step 5).
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

## 5. Build + start everything

One command builds the client (inside the `web` image), starts the game server, and starts
nginx:

```bash
sudo AUTH_SECRET=$(cat .env | cut -d= -f2-) docker compose up -d --build
# (or just `sudo docker compose up -d --build` — compose reads .env automatically)
```

The first build compiles the client with Vite and can take a few minutes. On a **1 GB** VPS
that step may run out of memory — add a swap file first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

Verify it's healthy end-to-end:

```bash
curl https://play.yourdomain.com/healthz     # → ok
curl https://play.yourdomain.com/status      # → {"status":"ok","players":0,...}
```

`docker compose logs -f game` should show
`[pathlands] server listening on ws://0.0.0.0:8080 (20 Hz sim ...)`.

## 6. Play

Open **`https://play.yourdomain.com`** in a browser — the login screen appears. Register an
account, create a character, and you're in the world. Open a second browser (or an incognito
window / another device), register a second account, and the two of you should see each other
move, fight, party (`/invite <name>`), whisper (`/w <name> …`), and chat.

That's the whole test — no separate client build or upload. The client is served by the same
nginx on the same origin, so it connects back to `wss://play.yourdomain.com` automatically.

> **Hosting the client elsewhere (optional).** If you'd rather serve the client from Vercel/CDN
> and use the VPS only for the server, build the client with the server URL baked in — it must
> be `wss://` (an `https://` page cannot open an insecure `ws://`) — and deploy the `dist/`:
>
> ```bash
> VITE_PATHLANDS_SERVER=wss://play.yourdomain.com pnpm build   # → dist/  (see docs/DEPLOY.md)
> ```
>
> Pathlands is **MMO-only**: there is no standalone single-player build. The client always
> requires a reachable server and an account login.

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

certbot standalone needs port 80 free, so stop the `web` container for the renewal and restart
it after. Add a host cron (as root):

```cron
0 3 * * 1 cd /path/to/PathlandsMMO && docker compose stop web && certbot renew --standalone && docker compose start web
```

(the site is down for a few seconds once a week during renewal — acceptable for a game server;
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
