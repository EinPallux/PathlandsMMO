// Server-authoritative enemies (Phase 6 combat Stage 1). Two levels of proof:
//   1. ServerCombat spawns the world's enemies deterministically and idles them (no
//      players → no aggro), so the same seed yields the same monsters on any machine.
//   2. Over the wire, a joining player receives the enemies in its 3×3 interest region as
//      NetEntity, while a distant player does not — the same interest policy as players.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, SPAWN_X, SPAWN_Z, WORLD_SPAWNS } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerCombat } from '../src/combat.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

const VALE_BOARS = WORLD_SPAWNS.find((r) => r.id === 'valeBoars')!;

describe('server-authoritative enemies — ServerCombat', () => {
  it('spawns a region deterministically and idles enemies without players', () => {
    const world = createServerWorld();
    const a = new ServerCombat(world);
    const b = new ServerCombat(world);
    for (let i = 0; i < 5; i++) {
      a.step();
      b.step();
    }

    const boarsA = a.netEntities().filter((e) => e.id.startsWith('valeBoars#'));
    // The region wants `count` boars alive; they should be present after a few ticks.
    expect(boarsA.length).toBe(VALE_BOARS.count);
    for (const e of boarsA) {
      expect(e.enemyId).toBe('thornbackBoar');
      expect(e.hp).toBeGreaterThan(0);
      expect(e.hp).toBe(e.maxHP); // full health, never engaged
      expect(e.state).toBe('idle'); // no players → no aggro
      // Spawned within the region radius of its centre.
      const d = Math.hypot(e.x - VALE_BOARS.cx, e.z - VALE_BOARS.cz);
      expect(d).toBeLessThanOrEqual(VALE_BOARS.radius + 0.001);
    }

    // Determinism: two independently-stepped sims agree on ids and positions byte-for-byte.
    const boarsB = b.netEntities().filter((e) => e.id.startsWith('valeBoars#'));
    expect(boarsB.map((e) => e.id).sort()).toEqual(boarsA.map((e) => e.id).sort());
    const posA = new Map(boarsA.map((e) => [e.id, `${e.x},${e.z}`]));
    for (const e of boarsB) expect(`${e.x},${e.z}`).toBe(posA.get(e.id));
  });

  it('reports no wire changes once enemies have settled', () => {
    const combat = new ServerCombat(createServerWorld());
    combat.step(); // first step spawns
    combat.refreshDiff(); // diff is taken at broadcast cadence, not inside step()
    expect(combat.hasChanges()).toBe(true); // the spawns are new → changed
    combat.step();
    combat.step();
    combat.refreshDiff();
    // Idle enemies don't move, so subsequent broadcasts produce no deltas.
    expect(combat.hasChanges()).toBe(false);
  });
});

describe('server-authoritative enemies — replication', () => {
  let sim: ServerSim;
  let store: MemoryStore;
  let server: GameServer;
  let base: string;
  let wsUrl: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    store = new MemoryStore();
    server = new GameServer(sim, gatewayOptions(), { auth: new Auth('test-secret'), store });
    await server.listen();
    base = `http://127.0.0.1:${server.address()}`;
    wsUrl = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  async function tokenAt(email: string, x: number, z: number): Promise<string> {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail(email))!;
    const y = createServerWorld().surfaceSpawnY(x, z);
    await store.putCharacter(
      acct.id,
      createCharacter('c1', 'Ranger', 'ranger', { skin: 0, hair: 0 }, x, y, z),
    );
    return token;
  }

  it('replicates the enemies in a joiner’s interest, but not distant ones', async () => {
    // A player spawned at the boar region should see the boars; a guest at the far-off
    // plaza should not (they are outside its 3×3 interest).
    const near = new TestClient(wsUrl);
    const far = new TestClient(wsUrl);
    await Promise.all([near.opened(), far.opened()]);

    const token = await tokenAt('boarhunter@example.com', VALE_BOARS.cx, VALE_BOARS.cz);
    near.hello('Ranger', 'ranger', 5, token);
    far.hello('Plaza', 'warrior', 5); // guest → spawns at SPAWN_X/Z

    await until(() => near.you !== null && far.you !== null, 3000, 'both welcomed');
    // The near player receives the boars (interest ENTER on the join snapshot / first delta).
    await until(
      () => [...near.enemies.values()].some((e) => e.enemyId === 'thornbackBoar'),
      3000,
      'near sees boars',
    );

    const nearBoars = [...near.enemies.keys()].filter((id) => id.startsWith('valeBoars#'));
    expect(nearBoars.length).toBeGreaterThan(0);
    // The distant plaza player never sees the boar region's enemies.
    await sleep(300);
    const farBoars = [...far.enemies.keys()].filter((id) => id.startsWith('valeBoars#'));
    expect(farBoars.length).toBe(0);
    // Sanity: the plaza is genuinely far from the boars.
    expect(Math.hypot(SPAWN_X - VALE_BOARS.cx, SPAWN_Z - VALE_BOARS.cz)).toBeGreaterThan(40);

    near.close();
    far.close();
  });
});
