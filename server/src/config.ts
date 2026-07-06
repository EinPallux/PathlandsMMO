// Server runtime configuration. Wall-clock and process env are read HERE, at the
// integration edge — never inside the simulation, which advances on fixed ticks only
// (ARCH §3). Environment variables let the VPS deployment (Phase 6 Ops) tune the
// listen address without a rebuild.

import { TICK_DURATION_MS, TICK_RATE } from '@pathlands/shared';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  /** TCP port the WebSocket server listens on. */
  port: envInt('PORT', 8080),
  /** Bind host; 127.0.0.1 by default so nginx (Phase 6) fronts wss in production. */
  host: process.env.HOST ?? '127.0.0.1',
  /** Authoritative simulation rate — the shared constant, echoed for local clarity. */
  tickRate: TICK_RATE,
  tickDurationMs: TICK_DURATION_MS,
  /**
   * Wire cadence: broadcast state every Nth sim tick (ARCH §7 — 20 Hz sim, 10 Hz on
   * the wire). Deltas between broadcasts are folded into the next one.
   */
  broadcastEveryTicks: 2,
  /**
   * Max accepted WebSocket frame. A legitimate client frame (a Move intent) is a few
   * hundred bytes; 16 KiB is generous. ws rejects larger frames before they reach
   * JSON.parse, so a hostile giant frame can't block the event loop or OOM the process.
   */
  maxPayloadBytes: envInt('MAX_PAYLOAD_BYTES', 16 * 1024),
  /** Hard cap on concurrent connections (authenticated or not) — a DoS backstop. */
  maxConnections: envInt('MAX_CONNECTIONS', 512),
  /** A socket that hasn't said hello within this window is terminated (anti-idle-DoS). */
  helloTimeoutMs: envInt('HELLO_TIMEOUT_MS', 10_000),
  /**
   * WebSocket-level heartbeat: ping every connection this often and terminate any that
   * failed to answer the previous round. Reaps half-open sockets (client sleeps / wifi
   * drops with no TCP FIN) so their player doesn't linger as a frozen ghost.
   */
  heartbeatMs: envInt('HEARTBEAT_MS', 30_000),
  /**
   * Per-connection inbound frame cap (frames/second). A legitimate client sends one
   * intent per tick (20/s) plus a ping/second; 60 leaves generous headroom. Excess frames
   * are dropped BEFORE decode, so a flood can't burn JSON.parse/validate CPU and starve
   * the tick loop — the rate backstop the size cap (maxPayload) can't provide.
   */
  maxMsgsPerSec: envInt('MAX_MSGS_PER_SEC', 60),

  // --- accounts & persistence ---
  /**
   * Secret for signing session JWTs. MUST be set in production (a stable, random value);
   * an unset secret uses a dev default and logs a warning — tokens don't survive a
   * secret change, so rotating it logs everyone out.
   */
  authSecret: process.env.AUTH_SECRET ?? '',
  /** Where the FileStore persists accounts + characters (a mounted volume in Docker). */
  dataFile: process.env.DATA_FILE ?? './data/pathlands.json',
  /** Per-IP auth attempts allowed per minute (brute-force backstop). */
  authRatePerMin: envInt('AUTH_RATE_PER_MIN', 20),
  /** Max body for an auth request (email+password is tiny). */
  maxAuthBodyBytes: envInt('MAX_AUTH_BODY_BYTES', 4 * 1024),
  /** Max body for a character upload (inventories/quests can be sizeable). */
  maxCharacterBodyBytes: envInt('MAX_CHARACTER_BODY_BYTES', 512 * 1024),
  /** How often authenticated players' positions flush to the store. */
  saveIntervalMs: envInt('SAVE_INTERVAL_MS', 30_000),
} as const;
