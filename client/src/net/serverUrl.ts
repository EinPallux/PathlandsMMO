// Resolves the game server URL. Pathlands is MMO-only: the client always connects to an
// authoritative server (there is no standalone single-player build). In production the
// static client is served by the VPS nginx that also reverse-proxies the WebSocket on the
// SAME host, so the default is simply the page's own origin with a ws(s) scheme — a
// zero-config deploy. For local dev, point VITE_PATHLANDS_SERVER at the dev server
// (e.g. `ws://localhost:8080`, matching `pnpm dev:server`).

/** The configured server URL, or same-origin `wss://host` / `ws://host` when unset. */
export function resolveServerUrl(): string {
  const env = import.meta.env.VITE_PATHLANDS_SERVER as string | undefined;
  if (env !== undefined && env.length > 0) return env;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}
