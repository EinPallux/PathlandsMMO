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
} as const;
