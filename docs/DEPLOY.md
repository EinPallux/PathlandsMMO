# DEPLOY.md — Hosting Pathlands

Pathlands (Phases 1–5) is a **static site**: one `index.html`, JS/CSS bundles, a web
worker, and the 2D art under `assets/`. Saves live in the browser (IndexedDB) — there
is **no backend** until Phase 6. So "deploying" is just building and serving a folder.

Two supported targets (both must keep working — see ARCHITECTURE §Deployment):

- **Vercel** — zero-config via the checked-in `vercel.json` (build → repo-root `dist/`).
- **Your own VPS + nginx** — the guide below (Ubuntu, e.g. Hostinger).

Phase 6 adds the MMORPG server (Node + PostgreSQL + wss) via Docker Compose; that's a
separate topology documented later. The static client below is unaffected by it.

---

## Build the static site

On any machine with Node 22 + pnpm (or on the VPS itself):

```bash
pnpm install
pnpm build          # → repo-root dist/  (index.html + assets/ + workers)
```

`dist/` is fully self-contained. You can host it on any static server; the rest of this
guide covers nginx on an Ubuntu VPS.

---

## Ubuntu VPS + nginx

### 1. One-time server setup

```bash
sudo apt update && sudo apt install -y nginx
# Node 22 + pnpm only needed if you build ON the VPS (see §3, option B):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs && sudo npm i -g pnpm
```

Point your domain's DNS **A record** (e.g. `play.yourdomain.com`) at the VPS IP.

### 2. Where the files live

```bash
sudo mkdir -p /var/www/pathlands
sudo chown -R "$USER":www-data /var/www/pathlands
```

### 3. Ship the build

**Option A — build locally, upload `dist/`:**

```bash
pnpm build
rsync -avz --delete dist/ user@your-vps-ip:/var/www/pathlands/
```

**Option B — build on the VPS:**

```bash
git clone https://github.com/EinPallux/PathlandsMMO.git && cd PathlandsMMO
pnpm install && pnpm build
sudo rsync -a --delete dist/ /var/www/pathlands/
```

`--delete` keeps the served folder identical to a fresh build (no stale hashed bundles).

### 4. nginx server block

Create `/etc/nginx/sites-available/pathlands`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name play.yourdomain.com;

    root /var/www/pathlands;
    index index.html;

    # gzip the text payloads (Vite already minifies; nginx compresses on the wire).
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Hashed build assets are immutable — cache them hard.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Everything else falls back to index.html (safe: the app has no server routes,
    # and this future-proofs any client-side routing).
    location / {
        try_files $uri $uri/ /index.html;
    }

    # index.html must never be cached, or players get stale bundle references.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/pathlands /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The game is now live at `http://play.yourdomain.com`.

### 5. HTTPS (recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d play.yourdomain.com
```

Certbot edits the server block to add TLS and sets up auto-renewal. Done.

### 6. Updating after code changes

Re-run the ship step — no downtime, no service to restart:

```bash
pnpm build && rsync -avz --delete dist/ user@your-vps-ip:/var/www/pathlands/
# (or Option B's git pull + build + rsync on the VPS)
```

Because asset filenames are content-hashed, returning players fetch only the changed
bundles; `index.html` (no-cache) always points at the current ones.

---

## Notes & gotchas

- **Saves are per-browser (IndexedDB).** Hosting on a new domain starts players fresh;
  Settings → **Download backup / Restore from file** moves a save between machines or
  domains (Phase-5 resilience feature).
- **No SharedArrayBuffer / COOP-COEP headers needed** — the chunk mesher uses a plain
  module Web Worker with transferable buffers, not threads.
- **Correct MIME types matter for ES-module workers.** Stock nginx `mime.types` already
  serves `.js` as `application/javascript`; don't override it.
- **Audio is optional.** `public/assets/audio/bgm.mp3` + `loginscreen.mp3` are the only
  runtime-optional files; if absent the game runs silently (never errors). Drop your own
  in before building to ship music.
- **Budgets:** the initial JS is ≈ 280 KB gzipped (≪ the 3 MB budget); a small VPS
  serves it comfortably.
