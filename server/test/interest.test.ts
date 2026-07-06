// Chunk-grid interest management: a player replicates only the OTHERS within its 3×3
// chunk region (ARCH §7), and always sees itself (the reconciliation channel bypasses
// interest). Covers the pure cell logic and the over-the-wire enter/leave/re-enter
// lifecycle, including that leaving interest is distinct from disconnecting.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SPAWN_X } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { buildCellIndex, cellOf, visibleIds } from '../src/interest.js';
import { TestClient, gatewayOptions, until } from './support.js';

describe('interest — cell logic', () => {
  it('sees others in the 3×3 region and always sees self', () => {
    const sim = new ServerSim(createServerWorld());
    const a = sim.join('A', 'warrior', 5);
    const b = sim.join('B', 'ranger', 5);

    // Same spawn cell ⇒ mutually visible.
    let index = buildCellIndex(sim.players.values());
    expect(visibleIds(a, index).has(b.id)).toBe(true);
    expect(visibleIds(a, index).has(a.id)).toBe(true);

    // One cell away (Chebyshev 1) is still inside the 3×3.
    b.phys.x = SPAWN_X + CHUNK_SIZE;
    index = buildCellIndex(sim.players.values());
    expect(cellOf(b.phys.x) - cellOf(a.phys.x)).toBe(1);
    expect(visibleIds(a, index).has(b.id)).toBe(true);

    // Three cells away is outside — no longer visible, but self still is.
    b.phys.x = SPAWN_X + 3 * CHUNK_SIZE;
    index = buildCellIndex(sim.players.values());
    expect(visibleIds(a, index).has(b.id)).toBe(false);
    expect(visibleIds(a, index).has(a.id)).toBe(true);
  });
});

describe('interest — over the wire', () => {
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

  it('players leave and re-enter each other as they cross the interest boundary', async () => {
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 5);
    await until(() => a.you !== null && b.you !== null, 3000, 'welcomed');
    const aid = a.you as string;
    const bid = b.you as string;
    await until(() => a.players.has(bid) && b.players.has(aid), 3000, 'mutual visibility');

    // Push A three cells east in the authoritative sim (out of B's 3×3, and vice-versa).
    const pa = sim.players.get(aid)!;
    pa.phys.x = SPAWN_X + 3 * CHUNK_SIZE;
    pa.dirty = true;
    await until(() => !b.players.has(aid) && !a.players.has(bid), 3000, 'mutual leave');

    // Leaving interest is NOT a disconnect — A is still in authoritative state…
    expect(sim.players.has(aid)).toBe(true);
    // …and A still receives its own self-state (reconciliation bypasses interest).
    expect(a.lastSelf).not.toBeNull();

    // Walk A back into the shared cell — B sees A ENTER again with full state.
    pa.phys.x = SPAWN_X;
    pa.dirty = true;
    await until(() => b.players.has(aid) && a.players.has(bid), 3000, 're-enter');
    const seen = b.players.get(aid);
    expect(seen?.name).toBe('Alia');
    expect(seen?.cls).toBe('ranger');
    expect(seen?.level).toBe(5);

    a.close();
    b.close();
  });
});
