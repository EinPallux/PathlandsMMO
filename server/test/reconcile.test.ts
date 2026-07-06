// Client-side prediction reconciliation, proven headlessly. The client and server run
// the SAME shared movement function on the SAME intents, so (1) an unperturbed stream
// lands them byte-for-byte together — that is why reconciliation produces no visible
// pop — and (2) an injected misprediction is erased the moment the authoritative self-
// state is applied. A WebSocket check confirms the `self` ack channel is wired.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyNetSelf,
  makeMoveIntent,
  stepPlayerMovement,
  TICK_DT,
  TICK_DURATION_MS,
  type MoveIntent,
  type PlayerPhysics,
} from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

function fresh(): { sim: ServerSim; world: ReturnType<typeof createServerWorld>; id: string } {
  const world = createServerWorld();
  const sim = new ServerSim(world);
  const player = sim.join('Tester', 'warrior', 5);
  return { sim, world, id: player.id };
}

describe('reconciliation (headless)', () => {
  it('client prediction and server authority stay byte-identical on a clean stream', () => {
    const { sim, world, id } = fresh();
    const server = sim.players.get(id)!;
    const clientPhys: PlayerPhysics = { ...server.phys };

    // Client predicts each tick; server applies the same intent on the same tick.
    for (let t = 1; t <= 40; t++) {
      const intent: MoveIntent = makeMoveIntent(1, 0.3, false, false, 0.2);
      stepPlayerMovement(world.sampler, clientPhys, intent, TICK_DT); // prediction
      sim.applyMove(id, intent, t);
      sim.step(); // authority
    }

    expect(server.inputs.length).toBe(0); // every input drained
    expect(clientPhys.x).toBeCloseTo(server.phys.x, 8);
    expect(clientPhys.y).toBeCloseTo(server.phys.y, 8);
    expect(clientPhys.z).toBeCloseTo(server.phys.z, 8);
    // A clean stream ⇒ the reconcile offset the client would inject is ~0 (no snap).
    expect(Math.abs(clientPhys.x - server.phys.x)).toBeLessThan(1e-6);
  });

  it('erases an injected misprediction on the next reconcile', () => {
    const { sim, world, id } = fresh();
    const server = sim.players.get(id)!;
    const clientPhys: PlayerPhysics = { ...server.phys };

    // Settle on the ground in lockstep.
    for (let t = 1; t <= 10; t++) {
      const intent = makeMoveIntent(0, 0, false, false, 0);
      stepPlayerMovement(world.sampler, clientPhys, intent, TICK_DT);
      sim.applyMove(id, intent, t);
      sim.step();
    }

    // Inject a 5 m mispredict (dropped packet / divergence).
    clientPhys.x += 5;
    expect(Math.abs(clientPhys.x - server.phys.x)).toBeGreaterThan(4);

    // One more tick, then reconcile: reset to authority + replay unacked (none here).
    const intent = makeMoveIntent(0, 0, false, false, 0);
    stepPlayerMovement(world.sampler, clientPhys, intent, TICK_DT);
    sim.applyMove(id, intent, 11);
    sim.step();

    const self = sim.selfOf(server);
    applyNetSelf(clientPhys, self.phys);
    expect(self.ackedSeq).toBe(11);
    // Authoritative reset erased the divergence (the residual smooths cosmetically).
    expect(Math.abs(clientPhys.x - server.phys.x)).toBeLessThan(1e-6);
  });

  it('replays unacked inputs so a client ahead of the server still converges', () => {
    const { sim, world, id } = fresh();
    const server = sim.players.get(id)!;
    const clientPhys: PlayerPhysics = { ...server.phys };
    const history: { seq: number; intent: MoveIntent }[] = [];

    // Client runs 6 ticks ahead; server has only applied the first 3.
    for (let t = 1; t <= 6; t++) {
      const intent = makeMoveIntent(1, 0, false, false, 0);
      stepPlayerMovement(world.sampler, clientPhys, intent, TICK_DT);
      history.push({ seq: t, intent });
    }
    for (let t = 1; t <= 3; t++) {
      sim.applyMove(id, history[t - 1]!.intent, t);
      sim.step();
    }

    // Reconcile: reset to server (applied 1..3), replay unacked 4..6.
    const self = sim.selfOf(server);
    expect(self.ackedSeq).toBe(3);
    applyNetSelf(clientPhys, self.phys);
    const unacked = history.filter((h) => h.seq > self.ackedSeq).map((h) => h.intent);
    expect(unacked.length).toBe(3);
    for (const intent of unacked) stepPlayerMovement(world.sampler, clientPhys, intent, TICK_DT);

    // Now advance the server the remaining 3 inputs and compare — identical path.
    for (let t = 4; t <= 6; t++) {
      sim.applyMove(id, history[t - 1]!.intent, t);
      sim.step();
    }
    expect(clientPhys.x).toBeCloseTo(server.phys.x, 8);
    expect(clientPhys.z).toBeCloseTo(server.phys.z, 8);
  });
});

describe('reconciliation (WebSocket ack channel)', () => {
  let sim: ServerSim;
  let server: GameServer;
  let url: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    server = new GameServer(sim, gatewayOptions());
    await server.listen();
    url = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('sends self frames whose ack advances toward the highest sent input', async () => {
    const client = new TestClient(url);
    await client.opened();
    client.hello('Alia', 'ranger', 5);
    await until(() => client.you !== null, 3000, 'welcomed');

    for (let i = 0; i < 15; i++) {
      client.move(1, 0);
      await sleep(TICK_DURATION_MS);
    }

    await until(
      () => client.lastSelf !== null && client.lastSelf.ackedSeq >= 8,
      3000,
      'acks advance',
    );
    const highestSent = client.sent[client.sent.length - 1]!.seq;
    expect(client.lastSelf!.ackedSeq).toBeGreaterThan(0);
    expect(client.lastSelf!.ackedSeq).toBeLessThanOrEqual(highestSent);

    // The self-state matches the server's authoritative position for this client.
    const authoritative = sim.players.get(client.you as string)!.phys.x;
    expect(Math.abs(client.lastSelf!.phys.x - authoritative)).toBeLessThan(2.0);

    client.close();
  });
});
