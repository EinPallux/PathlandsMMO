// The Phase-6 two-player milestone, proven headlessly: two independent WebSocket
// clients connect to the authoritative server, one moves, and the OTHER sees that
// movement — replicated from the server's authoritative sim, not from the mover's
// client. This is acceptance criterion #1's movement core (ROADMAP §Phase 6), the
// thing that makes Pathlands an MMO rather than a single-player game.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  decodeServer,
  encodeClient,
  makeMoveIntent,
  NET_PROTOCOL_VERSION,
  SPAWN_X,
  SPAWN_Z,
  TICK_DURATION_MS,
  WORLD_SEED,
  type ClientMessage,
  type NetPlayer,
} from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';

/** Poll `cond` until it is true or `ms` elapses; rejects with `label` on timeout. */
function until(cond: () => boolean, ms: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 15);
    };
    tick();
  });
}

/** A minimal test client that mirrors what the browser NetClient will do. */
class TestClient {
  readonly ws: WebSocket;
  you: string | null = null;
  seed: number | null = null;
  readonly players = new Map<string, NetPlayer>();
  private seq = 0;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => this.onMessage(data.toString()));
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  private onMessage(raw: string): void {
    const msg = decodeServer(raw);
    if (msg === null) return;
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.seed = msg.seed;
        break;
      case 'snapshot':
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        break;
      case 'delta':
        for (const p of msg.players) this.players.set(p.id, p);
        for (const id of msg.gone) this.players.delete(id);
        break;
      default:
        break;
    }
  }

  private send(msg: ClientMessage): void {
    this.ws.send(encodeClient(msg));
  }

  hello(name: string, cls: string, level: number): void {
    this.send({ t: 'hello', protocol: NET_PROTOCOL_VERSION, name, cls, level });
  }

  /** Send one move intent this call (increasing seq so the server never drops it). */
  move(wishX: number, wishZ: number): void {
    this.seq += 1;
    this.send({
      t: 'intent',
      seq: this.seq,
      tick: 0,
      intent: makeMoveIntent(wishX, wishZ, false, false, 0),
    });
  }

  close(): void {
    this.ws.close();
  }
}

describe('two-player vertical slice', () => {
  let world: ReturnType<typeof createServerWorld>;
  let sim: ServerSim;
  let server: GameServer;
  let url: string;

  beforeEach(async () => {
    world = createServerWorld();
    sim = new ServerSim(world);
    server = new GameServer(sim, {
      port: 0, // ask the OS for a free port
      host: '127.0.0.1',
      tickDurationMs: TICK_DURATION_MS,
      broadcastEveryTicks: 2,
    });
    await server.listen();
    url = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('gives each client a distinct id and a matching world seed', async () => {
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 5);

    await until(() => a.you !== null && b.you !== null, 3000, 'both welcomed');
    expect(a.you).not.toBe(b.you);
    expect(a.seed).toBe(WORLD_SEED);
    expect(b.seed).toBe(WORLD_SEED);

    a.close();
    b.close();
  });

  it('one player moving is seen moving by the other, from server authority', async () => {
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 5);

    // Both clients must know about both players before we start moving.
    await until(() => a.you !== null && b.you !== null, 3000, 'both welcomed');
    const aid = a.you as string;
    const bid = b.you as string;
    await until(
      () => b.players.has(aid) && b.players.has(bid) && a.players.has(aid) && a.players.has(bid),
      3000,
      'mutual visibility',
    );

    // A runs +X for a while; B stays put. A sends a fresh intent every ~tick so the
    // server keeps applying it (pendingMove is consumed each tick).
    const mover = setInterval(() => a.move(1, 0), TICK_DURATION_MS);
    await until(
      () => (b.players.get(aid)?.x ?? SPAWN_X) > SPAWN_X + 0.5,
      5000,
      'B sees A move east',
    );
    clearInterval(mover);

    // Let the final resting delta settle, then compare B's view of A against the
    // server's AUTHORITATIVE position — replication reflects the server, not the mover.
    await until(() => sim.players.get(aid)?.pendingMove === null, 1000, 'A intent drained');
    await new Promise((r) => setTimeout(r, 200));

    const authoritativeA = sim.players.get(aid);
    expect(authoritativeA).toBeDefined();
    const seenA = b.players.get(aid);
    expect(seenA).toBeDefined();

    // A genuinely moved from spawn…
    expect(authoritativeA?.phys.x).toBeGreaterThan(SPAWN_X + 0.3);
    // …and B's replicated view matches the server to within a broadcast of jitter.
    expect(Math.abs((seenA?.x ?? 0) - (authoritativeA?.phys.x ?? 0))).toBeLessThan(1.0);
    expect(Math.abs((seenA?.z ?? 0) - (authoritativeA?.phys.z ?? 0))).toBeLessThan(1.0);

    // B never moved, so A's view of B stays at the spawn plaza.
    const seenB = a.players.get(bid);
    expect(seenB).toBeDefined();
    expect(Math.abs((seenB?.x ?? 0) - SPAWN_X)).toBeLessThan(0.5);
    expect(Math.abs((seenB?.z ?? 0) - SPAWN_Z)).toBeLessThan(0.5);

    a.close();
    b.close();
  });

  it('a departing player is removed from the other client', async () => {
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 5);
    await until(() => a.you !== null && b.you !== null, 3000, 'both welcomed');
    const bid = b.you as string;
    await until(() => a.players.has(bid), 3000, 'A sees B');

    b.close();
    await until(() => !a.players.has(bid), 3000, 'A sees B leave');
    expect(a.players.has(bid)).toBe(false);

    a.close();
  });
});
