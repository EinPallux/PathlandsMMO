// The HTTP health/status endpoints share the WebSocket port so nginx can health-check
// the upstream and ops can scrape a status JSON (ARCH §8). These prove the routes
// respond and reflect live sim state.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NET_PROTOCOL_VERSION, WORLD_SEED } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { TestClient, gatewayOptions, until } from './support.js';

describe('http health + status', () => {
  let sim: ServerSim;
  let server: GameServer;
  let base: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    server = new GameServer(sim, gatewayOptions());
    await server.listen();
    base = `http://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /healthz returns 200 ok', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('GET /status reflects live sim state', async () => {
    const res = await fetch(`${base}/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      protocol: number;
      seed: number;
      players: number;
      connections: number;
      uptimeMs: number;
    };
    expect(body.status).toBe('ok');
    expect(body.protocol).toBe(NET_PROTOCOL_VERSION);
    expect(body.seed).toBe(WORLD_SEED);
    expect(body.players).toBe(0);
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);

    // A connected player shows up in the counts.
    const client = new TestClient(`ws://127.0.0.1:${server.address()}`);
    await client.opened();
    client.hello('Alia', 'ranger', 5);
    await until(() => client.you !== null, 3000, 'welcomed');
    const after = (await (await fetch(`${base}/status`)).json()) as { players: number };
    expect(after.players).toBe(1);
    client.close();
  });

  it('unknown routes 404', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
