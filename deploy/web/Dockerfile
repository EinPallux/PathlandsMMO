# Pathlands web tier: builds the static client and serves it with nginx, which ALSO reverse-
# proxies the game server's WebSocket (wss) + HTTP account API on the same origin (see
# deploy/nginx/pathlands.conf). Multi-stage so the VPS needs only Docker — no host Node/pnpm:
# `docker compose up -d --build` builds the client here.
#
# Build from the REPO ROOT:  docker build -f deploy/web/Dockerfile -t pathlands-web .

# --- stage 1: build the client (full workspace — three/react/vite) ---
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
# Copy the whole repo (the .dockerignore drops node_modules/dist/.git). A full install is
# needed because the client build pulls in its own heavy deps.
COPY . .
RUN pnpm install --frozen-lockfile
# Vite build → repo-root dist/ (scripts/mirror-dist.mjs). VITE_PATHLANDS_SERVER is left UNSET
# so the client defaults its server URL to its own origin — the single-origin topology below.
RUN pnpm build

# --- stage 2: serve it ---
FROM nginx:1.27-alpine
# The built SPA. The site config (deploy/nginx/pathlands.conf) is bind-mounted by compose so
# you can edit the domain without rebuilding this image.
COPY --from=build /app/dist /usr/share/nginx/html
