# Pathlands game server (Phase 6). Node 22 + pnpm. The server imports shared/ as source
# and runs it with tsx — no build step — so the image is the monorepo's server + shared
# packages only. The client's heavy deps (three/react/vite) are never installed.
#
# Build from the REPO ROOT:  docker build -f server/Dockerfile -t pathlands-server .

FROM node:22-slim

# pnpm via corepack, pinned to the repo's packageManager field.
RUN corepack enable
WORKDIR /app

# --- deps layer (cached until a manifest or the lockfile changes) ---
# Copy every workspace manifest so pnpm can resolve the workspace graph, then install
# ONLY the server package and its workspace dependencies (`...`). shared/ has no runtime
# deps; the client is not in the filter, so its dependencies are never fetched.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN pnpm install --frozen-lockfile --filter "@pathlands/server..."

# --- source layer ---
COPY tsconfig.base.json ./tsconfig.base.json
COPY shared/ shared/
COPY server/ server/

# Run unprivileged (the base image ships a `node` user).
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

# Container-level liveness: hit the server's own /healthz.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsx runs the TypeScript entry directly (shared/ imported unchanged).
CMD ["pnpm", "--filter", "@pathlands/server", "start"]
