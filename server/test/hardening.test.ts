// Server hardening: the per-connection inbound frame-rate limiter drops frames past the
// cap before they reach the decoder, so a flood can't burn parse/validate CPU. (The
// other backstops — maxPayload, hello-timeout, connection cap, heartbeat — are structural
// and exercised implicitly by every other suite.)

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

describe('gateway rate limiting', () => {
  let sim: ServerSim;
  let server: GameServer;
  let url: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    // Tight cap so a modest burst trips the limiter within one 1s window.
    server = new GameServer(sim, { ...gatewayOptions(), maxMsgsPerSec: 10 });
    await server.listen();
    url = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('drops intents past the per-connection frame-rate cap', async () => {
    const client = new TestClient(url);
    await client.opened();
    client.hello('Flooder', 'warrior', 5);
    await until(() => client.you !== null, 3000, 'welcomed');
    const id = client.you as string;

    // Blast 30 move intents synchronously — all inside one 1s window (hello was frame 1).
    for (let i = 0; i < 30; i++) client.move(1, 0);
    await sleep(150);

    // With a cap of 10, only a handful of the 30 were accepted; the server's receive gate
    // (lastRecvSeq = highest accepted seq) sits far below the 30 sent, and the connection
    // survives (30 frames is under the terminate threshold).
    const p = sim.players.get(id);
    expect(p).toBeDefined();
    expect(p!.lastRecvSeq).toBeGreaterThanOrEqual(0);
    expect(p!.lastRecvSeq).toBeLessThan(15);

    client.close();
  });
});
