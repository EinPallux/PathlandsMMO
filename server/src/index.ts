// Server entry point. Wires the deterministic world, the authoritative sim, and the
// WebSocket gateway together, then starts the tick clock. This is the integration
// edge: process env and wall-clock live here; everything below advances on fixed ticks.

import { config } from './config.js';
import { createServerWorld } from './world.js';
import { ServerSim } from './sim.js';
import { GameServer } from './gateway.js';

async function main(): Promise<void> {
  const world = createServerWorld();
  const sim = new ServerSim(world);
  const server = new GameServer(sim, {
    port: config.port,
    host: config.host,
    tickDurationMs: config.tickDurationMs,
    broadcastEveryTicks: config.broadcastEveryTicks,
    maxPayloadBytes: config.maxPayloadBytes,
    maxConnections: config.maxConnections,
    helloTimeoutMs: config.helloTimeoutMs,
    heartbeatMs: config.heartbeatMs,
    maxMsgsPerSec: config.maxMsgsPerSec,
  });

  await server.listen();
  console.log(
    `[pathlands] server listening on ws://${config.host}:${server.address()} ` +
      `(${config.tickRate} Hz sim, broadcast every ${config.broadcastEveryTicks} ticks)`,
  );

  const shutdown = (): void => {
    console.log('[pathlands] shutting down…');
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch((err: unknown) => {
  console.error('[pathlands] fatal:', err);
  process.exit(1);
});
