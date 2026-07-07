// Droppable ground items (Phase 6 Part 29) — the player-to-player trade surface that replaced
// bank / mail / trading. Two levels of proof:
//   1. The GroundItems store in isolation: drop → get, atomic pickup (first-come-wins),
//      out-of-range rejection, lifetime despawn, and the memory-cap eviction.
//   2. Over the wire: a dropped stack replicates to a NEARBY player (interest-filtered), a pickup
//      grants it to exactly one picker and removes it from every client, and a race for the same
//      id can't duplicate it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPAWN_X, SPAWN_Z, WORLD_SPAWNS, type ItemDef } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { GroundItems } from '../src/groundItems.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

/** A minimal item to drop — the wire only needs a string id + name (procedural loot has no id). */
const BLADE = { id: 'test_blade', name: 'Test Blade' } as unknown as ItemDef;

describe('GroundItems store', () => {
  it('drops with unique ids and looks items up', () => {
    const g = new GroundItems();
    const a = g.drop(BLADE, 1, 10, 5, 10, 0);
    const b = g.drop(BLADE, 3, 12, 5, 10, 0);
    expect(a.id).not.toBe(b.id);
    expect(g.get(a.id)?.qty).toBe(1);
    expect(g.get(b.id)?.qty).toBe(3);
    expect(g.size).toBe(2);
    expect(g.get('nope')).toBeNull();
  });

  it('picks up atomically (first-come-wins) and only within range', () => {
    const g = new GroundItems();
    const wi = g.drop(BLADE, 2, 100, 5, 100, 0);
    // Out of range → not removed, no grant.
    expect(g.tryPickup(wi.id, 200, 200, 3)).toBeNull();
    expect(g.size).toBe(1);
    // In range → removed + returned.
    const got = g.tryPickup(wi.id, 101, 101, 3);
    expect(got?.qty).toBe(2);
    expect(g.size).toBe(0);
    // A second pickup of the same id finds nothing — no duplication.
    expect(g.tryPickup(wi.id, 101, 101, 3)).toBeNull();
  });

  it('despawns items past their lifetime, keeping fresh ones', () => {
    const g = new GroundItems();
    const old = g.drop(BLADE, 1, 0, 0, 0, 0); // dropped at tick 0
    const fresh = g.drop(BLADE, 1, 0, 0, 0, 90); // dropped at tick 90
    // ttl = 100 ticks; at tick 100 only the tick-0 stack has aged out.
    const gone = g.expire(100, 100);
    expect(gone).toEqual([old.id]);
    expect(g.get(old.id)).toBeNull();
    expect(g.get(fresh.id)).not.toBeNull();
  });

  it('evicts the oldest stack past the memory cap', () => {
    const g = new GroundItems();
    // Fill just past the 2048 cap; the very first (oldest) drop should be evicted.
    let first = '';
    for (let i = 0; i < 2049; i++) {
      const wi = g.drop(BLADE, 1, i, 5, 0, i);
      if (i === 0) first = wi.id;
    }
    expect(g.size).toBe(2048);
    expect(g.get(first)).toBeNull(); // the oldest made room for the newest
  });
});

describe('ground items — over the wire', () => {
  let sim: ServerSim;
  let store: MemoryStore;
  let server: GameServer;
  let wsUrl: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    store = new MemoryStore();
    server = new GameServer(sim, gatewayOptions(), { auth: new Auth('test-secret'), store });
    await server.listen();
    wsUrl = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('replicates a drop to a nearby player, and a pickup grants + removes it everywhere', async () => {
    // Two guests spawn at the plaza (same interest cell); a third player far away must not see it.
    const dropper = new TestClient(wsUrl);
    const nearby = new TestClient(wsUrl);
    await Promise.all([dropper.opened(), nearby.opened()]);
    dropper.hello('Dropper', 'warrior', 5);
    nearby.hello('Nearby', 'ranger', 5);
    await until(() => dropper.you !== null && nearby.you !== null, 3000, 'both welcomed');

    // Drop a stack; both plaza players should see the world item appear.
    dropper.dropItem(BLADE, 4);
    await until(() => nearby.worldItems.size === 1, 3000, 'nearby sees the drop');
    await until(() => dropper.worldItems.size === 1, 3000, 'dropper sees its own drop');
    const id = [...nearby.worldItems.keys()][0]!;
    expect(nearby.worldItems.get(id)?.qty).toBe(4);
    expect(nearby.worldItems.get(id)?.item.name).toBe('Test Blade');

    // The nearby player picks it up → gets the grant; it vanishes from every client's world.
    nearby.pickupItem(id);
    await until(() => nearby.grants.length === 1, 3000, 'nearby is granted the stack');
    expect(nearby.grants[0]!.qty).toBe(4);
    await until(() => nearby.worldItems.size === 0, 3000, 'item gone for the picker');
    await until(() => dropper.worldItems.size === 0, 3000, 'item gone for the dropper');

    // Anti-dup: the dropper now races for the same (already-taken) id → no grant, nothing spawned.
    dropper.pickupItem(id);
    await sleep(300);
    expect(dropper.grants.length).toBe(0);

    dropper.close();
    nearby.close();
  });

  it('does not replicate a drop to a distant player (interest-filtered)', async () => {
    const dropper = new TestClient(wsUrl);
    const far = new TestClient(wsUrl);
    await Promise.all([dropper.opened(), far.opened()]);

    // The far player joins via a persisted character positioned at a far-off region.
    const region = WORLD_SPAWNS.find((r) => r.id === 'valeBoars')!;
    expect(Math.hypot(SPAWN_X - region.cx, SPAWN_Z - region.cz)).toBeGreaterThan(40);
    const res = await fetch(`http://127.0.0.1:${server.address()}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'faraway@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('faraway@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(region.cx, region.cz);
    const { createCharacter } = await import('@pathlands/shared');
    await store.putCharacter(
      acct.id,
      createCharacter('cf', 'Farley', 'mage', { skin: 0, hair: 0 }, region.cx, y, region.cz),
    );

    dropper.hello('Dropper', 'warrior', 5); // guest → plaza
    far.hello('Farley', 'mage', 5, token); // far region
    await until(() => dropper.you !== null && far.you !== null, 3000, 'both welcomed');

    dropper.dropItem(BLADE, 1);
    await until(() => dropper.worldItems.size === 1, 3000, 'dropper sees its own drop');
    await sleep(300); // give the far player ample time to (not) receive it
    expect(far.worldItems.size).toBe(0);

    dropper.close();
    far.close();
  });
});
