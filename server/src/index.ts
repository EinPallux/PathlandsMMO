// Server entry point. Wires the deterministic world, the authoritative sim, account
// persistence, and the WebSocket gateway together, then starts the tick clock. This is
// the integration edge: process env and wall-clock live here; everything below advances
// on fixed ticks.

import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import { createServerWorld } from './world.js';
import { ServerSim } from './sim.js';
import { GameServer } from './gateway.js';
import pg from 'pg';
import { Auth } from './auth.js';
import { FileStore, type Store } from './store.js';
import { PgStore, type Queryable } from './db/pgStore.js';
import { ContentStore } from './db/contentStore.js';

async function main(): Promise<void> {
  const world = createServerWorld();
  const sim = new ServerSim(world);

  // Auth secret: required in production. Without one, mint an ephemeral secret so the
  // server still runs, but warn — tokens won't survive a restart (everyone re-logs in).
  let secret = config.authSecret;
  if (secret === '') {
    secret = randomBytes(32).toString('base64url');
    console.warn(
      '[pathlands] AUTH_SECRET is not set — using an ephemeral secret. Sessions will ' +
        'not survive a restart. Set AUTH_SECRET in production.',
    );
  }
  const auth = new Auth(secret);
  // Postgres is the production store: all player data, plus the game content (enemies/quests/
  // NPCs/recipes) seeded from shared/data on first boot so a future admin editor edits DB rows.
  // Falls back to the durable FileStore when DATABASE_URL is unset (local dev without a database).
  let store: Store;
  let storeLabel: string;
  if (config.databaseUrl !== '') {
    const pool = new pg.Pool({ connectionString: config.databaseUrl }) as unknown as Queryable;
    store = await PgStore.fromPool(pool); // applies the schema (incl. the content table)
    const seeded = await new ContentStore(pool).seedFromShared();
    const total = Object.values(seeded).reduce((a, b) => a + b, 0);
    if (total > 0)
      console.log(`[pathlands] seeded content into Postgres: ${JSON.stringify(seeded)}`);
    storeLabel = 'postgres';
  } else {
    store = await FileStore.open(config.dataFile);
    storeLabel = config.dataFile;
  }

  const server = new GameServer(
    sim,
    {
      port: config.port,
      host: config.host,
      tickDurationMs: config.tickDurationMs,
      broadcastEveryTicks: config.broadcastEveryTicks,
      maxPayloadBytes: config.maxPayloadBytes,
      maxConnections: config.maxConnections,
      helloTimeoutMs: config.helloTimeoutMs,
      heartbeatMs: config.heartbeatMs,
      maxMsgsPerSec: config.maxMsgsPerSec,
      authRatePerMin: config.authRatePerMin,
      maxAuthBodyBytes: config.maxAuthBodyBytes,
      maxCharacterBodyBytes: config.maxCharacterBodyBytes,
      saveIntervalMs: config.saveIntervalMs,
      gmEmails: config.gmEmails,
    },
    { auth, store },
  );

  await server.listen();
  console.log(
    `[pathlands] server listening on ws://${config.host}:${server.address()} ` +
      `(${config.tickRate} Hz sim, broadcast every ${config.broadcastEveryTicks} ticks; ` +
      `data: ${storeLabel})`,
  );

  const shutdown = (): void => {
    console.log('[pathlands] shutting down…');
    void server
      .close()
      .then(() => store.close())
      .then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch((err: unknown) => {
  console.error('[pathlands] fatal:', err);
  process.exit(1);
});
