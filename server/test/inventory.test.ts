// Server-authoritative inventory (Phase 6 economy migration, Stage 1a). Two levels of proof:
//   1. The Inventories model in isolation: seed, bag-cap, gold credit/spend, drop removal,
//      equip/unequip swap, sell + buyback, and dirty tracking.
//   2. Over the wire: a player joins with a persisted character and receives their authoritative
//      bag / gold / equipment; dropping a held stack removes it from the authoritative inventory
//      and re-replicates.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BAG_SIZE, createCharacter, EquipSlot, Rarity, type ItemDef } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { Inventories } from '../src/inventory.js';
import { TestClient, gatewayOptions, until } from './support.js';

/** A minimal but structurally-valid ItemDef for the model tests. */
function mkItem(over: Partial<ItemDef> = {}): ItemDef {
  return {
    id: 'itm',
    name: 'Item',
    slot: EquipSlot.Trinket,
    rarity: Rarity.Common,
    ilvl: 1,
    reqLevel: 1,
    stats: {},
    value: 40,
    ...over,
  };
}

describe('Inventories model', () => {
  it('seeds from a character and reports the seeded state dirty', () => {
    const inv = new Inventories();
    inv.seed('p1', {
      cls: 'warrior',
      level: 5,
      inventory: [{ item: mkItem({ id: 'a', name: 'A' }), qty: 2 }],
      gold: 100,
      equipment: {},
    });
    const got = inv.get('p1')!;
    expect(got.gold).toBe(100);
    expect(got.bag).toHaveLength(1);
    expect(got.bag[0]!.qty).toBe(2);
    expect(inv.isDirty('p1')).toBe(true);
    inv.markClean('p1');
    expect(inv.isDirty('p1')).toBe(false);
  });

  it('adds loot up to the bag cap, then rejects', () => {
    const inv = new Inventories();
    inv.seed('p1', { cls: 'mage', level: 1, inventory: [], gold: 0, equipment: {} });
    for (let i = 0; i < BAG_SIZE; i++) {
      expect(inv.addStack('p1', mkItem({ id: `i${i}` }), 1)).toBe(true);
    }
    expect(inv.get('p1')!.bag).toHaveLength(BAG_SIZE);
    expect(inv.addStack('p1', mkItem({ id: 'overflow' }), 1)).toBe(false); // full
    expect(inv.hasRoom('p1')).toBe(false);
  });

  it('credits and spends gold (never below zero)', () => {
    const inv = new Inventories();
    inv.seed('p1', { cls: 'ranger', level: 1, inventory: [], gold: 50, equipment: {} });
    inv.addGold('p1', 25);
    expect(inv.get('p1')!.gold).toBe(75);
    expect(inv.spendGold('p1', 100)).toBe(false); // unaffordable — no change
    expect(inv.get('p1')!.gold).toBe(75);
    expect(inv.spendGold('p1', 75)).toBe(true);
    expect(inv.get('p1')!.gold).toBe(0);
  });

  it('removes a stack by index and by content match', () => {
    const inv = new Inventories();
    inv.seed('p1', {
      cls: 'warrior',
      level: 1,
      inventory: [
        { item: mkItem({ id: 'a' }), qty: 1 },
        { item: mkItem({ id: 'b' }), qty: 3 },
      ],
      gold: 0,
      equipment: {},
    });
    expect(inv.removeStackAt('p1', 5)).toBeNull(); // out of range
    expect(inv.removeMatchingStack('p1', 'b', 3)?.item.id).toBe('b');
    expect(inv.get('p1')!.bag).toHaveLength(1);
    expect(inv.removeMatchingStack('p1', 'b', 3)).toBeNull(); // already gone
  });

  it('equips a ring (auto-slot) and unequips back to the bag', () => {
    const inv = new Inventories();
    const ring = mkItem({ id: 'r', name: 'Ring', slot: EquipSlot.Ring1, reqLevel: 1 });
    inv.seed('p1', {
      cls: 'warrior',
      level: 5,
      inventory: [{ item: ring, qty: 1 }],
      gold: 0,
      equipment: {},
    });
    expect(inv.equip('p1', 0)).toBe(true);
    const eq = inv.get('p1')!.equipment;
    expect(eq[EquipSlot.Ring1]?.id).toBe('r');
    expect(inv.get('p1')!.bag).toHaveLength(0);
    expect(inv.unequip('p1', EquipSlot.Ring1)).toBe(true);
    expect(inv.get('p1')!.bag).toHaveLength(1);
    expect(inv.get('p1')!.equipment[EquipSlot.Ring1]).toBeUndefined();
  });

  it('sells for a quarter value and buys the sale back', () => {
    const inv = new Inventories();
    const blade = mkItem({ id: 'blade', value: 80 }); // sell = 20
    inv.seed('p1', {
      cls: 'warrior',
      level: 1,
      inventory: [{ item: blade, qty: 1 }],
      gold: 0,
      equipment: {},
    });
    expect(inv.sell('p1', 0)).toBe(true);
    expect(inv.get('p1')!.gold).toBe(20);
    expect(inv.get('p1')!.bag).toHaveLength(0);
    // Buy it back at the price it sold for.
    expect(inv.buyback('p1', 0)).toBe('ok');
    expect(inv.get('p1')!.gold).toBe(0);
    expect(inv.get('p1')!.bag[0]!.item.id).toBe('blade');
  });

  it('clamps a hostile bagBonus so the bag cap can’t be inflated into a memory DoS', () => {
    const inv = new Inventories();
    inv.seed('p1', {
      cls: 'warrior',
      level: 1,
      inventory: [],
      gold: 0,
      equipment: {},
      bagBonus: 1e9, // a forged hello value
    });
    // Clamped to BASE + MAX_BAG_BONUS (96), not the billion the client asked for.
    expect(inv.bagCap('p1')).toBe(BAG_SIZE + 96);
    expect(inv.get('p1')!.bagBonus).toBe(96);
  });
});

describe('inventory — over the wire', () => {
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

  it('replicates a joiner’s seeded inventory, and a drop removes the stack from it', async () => {
    // Register an account and persist a character carrying gold + one bag item.
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'rich@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('rich@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c1', 'Rich', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    const blade = mkItem({ id: 'blade', name: 'Blade' });
    ch.gold = 250;
    ch.inventory = [{ item: blade, qty: 1 }];
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Rich', 'warrior', 5, token);
    await until(() => c.lastInventory !== null, 3000, 'inventory replicated');
    expect(c.lastInventory!.gold).toBe(250);
    expect(c.lastInventory!.bag).toHaveLength(1);
    expect(c.lastInventory!.bag[0]!.item.id).toBe('blade');

    // Drop the held stack: the authoritative inventory removes it and re-replicates an empty bag.
    c.dropItem(blade, 1);
    await until(() => (c.lastInventory?.bag.length ?? 1) === 0, 3000, 'bag emptied after drop');
    expect(c.lastInventory!.bag).toHaveLength(0);

    c.close();
  });

  it('validates an equip action server-side and re-replicates', async () => {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ringbearer@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('ringbearer@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c2', 'Bearer', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    const ring = mkItem({ id: 'ring', name: 'Ring', slot: EquipSlot.Ring1, reqLevel: 1 });
    ch.inventory = [{ item: ring, qty: 1 }];
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Bearer', 'warrior', 5, token);
    await until(() => (c.lastInventory?.bag.length ?? 0) === 1, 3000, 'seeded bag replicated');

    // Equip the ring at index 0 → the authoritative inventory moves it to the ring slot + empties bag.
    c.invAction('equip', { index: 0 });
    await until(
      () => c.lastInventory?.equipment?.ring1 !== undefined,
      3000,
      'ring equipped server-side',
    );
    expect(c.lastInventory!.bag).toHaveLength(0);

    // An equip of an empty slot is a validated no-op (nothing to replicate / no crash).
    c.invAction('equip', { index: 3 });
    // Unequip the ring back to the bag.
    c.invAction('unequip', { slot: 'ring1' });
    await until(() => (c.lastInventory?.bag.length ?? 0) === 1, 3000, 'ring unequipped to bag');
    expect(c.lastInventory!.equipment.ring1).toBeUndefined();

    c.close();
  });

  it('replicates the buyback list on the inventory frame after a sell', async () => {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'seller@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('seller@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c3', 'Seller', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    const relic = mkItem({ id: 'relic', name: 'Relic', value: 80 });
    ch.inventory = [{ item: relic, qty: 1 }];
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Seller', 'warrior', 5, token);
    await until(() => (c.lastInventory?.bag.length ?? 0) === 1, 3000, 'seeded bag replicated');
    expect(c.lastInventory!.buyback).toHaveLength(0);

    // Sell it: the server empties the bag AND remembers it in the buyback list, replicated to us.
    c.invAction('sell', { index: 0 });
    await until(() => (c.lastInventory?.buyback.length ?? 0) === 1, 3000, 'buyback replicated');
    expect(c.lastInventory!.bag).toHaveLength(0);
    expect(c.lastInventory!.buyback[0]!.item.id).toBe('relic');

    c.close();
  });

  it('spills an over-cap reward to the ground (giveOrDrop) instead of eating it', async () => {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'packrat@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('packrat@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c4', 'Packrat', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    // Fill the bag to the base cap so the next grant can't fit.
    ch.inventory = Array.from({ length: BAG_SIZE }, (_v, i) => ({
      item: mkItem({ id: `f${i}` }),
      qty: 1,
    }));
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Packrat', 'warrior', 5, token);
    await until(() => (c.lastInventory?.bag.length ?? 0) === BAG_SIZE, 3000, 'full bag replicated');

    // Claim a reward that can't fit — it must land on the ground, not vanish, and the bag stays full.
    c.claimReward(0, [{ item: mkItem({ id: 'prize', name: 'Prize' }), qty: 1 }]);
    await until(() => c.worldItems.size >= 1, 3000, 'over-cap reward dropped to the ground');
    expect([...c.worldItems.values()].some((w) => w.item.id === 'prize')).toBe(true);
    expect(c.lastInventory!.bag).toHaveLength(BAG_SIZE); // unchanged — nothing was eaten

    c.close();
  });

  it('persists the authoritative inventory on disconnect (no null-persist data loss)', async () => {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'saver@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('saver@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c5', 'Saver', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    ch.gold = 0;
    ch.inventory = [{ item: mkItem({ id: 'relic', name: 'Relic', value: 80 }), qty: 1 }]; // sell = 20
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Saver', 'warrior', 5, token);
    await until(() => (c.lastInventory?.bag.length ?? 0) === 1, 3000, 'seeded bag replicated');

    // Mutate the authoritative inventory over the wire, then disconnect. onClose fires
    // persistPosition fire-and-forget and THEN removes the player from the inventory map, so the
    // snapshot-before-await fix is what lets the stored blob reflect the SOLD state (empty bag,
    // 20 gold) rather than a null read (the pre-fix data-loss/dupe race).
    c.invAction('sell', { index: 0 });
    await until(() => (c.lastInventory?.gold ?? 0) === 20, 3000, 'sale applied server-side');
    c.close();

    let saved = null;
    for (let i = 0; i < 40; i++) {
      saved = await store.getCharacter(acct.id);
      if (saved !== null && saved.gold === 20 && saved.inventory.length === 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(saved!.gold).toBe(20);
    expect(saved!.inventory).toHaveLength(0);
  });

  it('re-drops a ground item on a full-bag pickup instead of vanishing it', async () => {
    // Two clients sharing a spawn: A has a full bag, B drops a stack there for A to (fail to) grab.
    const regA = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'fullbag@example.com', password: 'longenough' }),
    });
    const tokenA = ((await regA.json()) as { token: string }).token;
    const acctA = (await store.getByEmail('fullbag@example.com'))!;
    const regB = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dropper@example.com', password: 'longenough' }),
    });
    const tokenB = ((await regB.json()) as { token: string }).token;
    const acctB = (await store.getByEmail('dropper@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const chA = createCharacter('cA', 'Fullbag', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    chA.inventory = Array.from({ length: BAG_SIZE }, (_v, i) => ({
      item: mkItem({ id: `f${i}` }),
      qty: 1,
    }));
    await store.putCharacter(acctA.id, chA);
    const chB = createCharacter('cB', 'Dropper', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    chB.inventory = [{ item: mkItem({ id: 'gem', name: 'Gem' }), qty: 1 }];
    await store.putCharacter(acctB.id, chB);

    const a = new TestClient(wsUrl);
    await a.opened();
    a.hello('Fullbag', 'warrior', 5, tokenA);
    const b = new TestClient(wsUrl);
    await b.opened();
    b.hello('Dropper', 'warrior', 5, tokenB);
    await until(() => (a.lastInventory?.bag.length ?? 0) === BAG_SIZE, 3000, 'A has a full bag');

    // B drops the gem at the shared spawn; A sees it as a ground item in interest.
    b.dropItem(mkItem({ id: 'gem', name: 'Gem' }), 1);
    await until(() => a.worldItems.size >= 1, 3000, 'A sees the ground gem');
    const gid = [...a.worldItems.keys()][0]!;

    // A (full bag) picks it up: it can't fit, so the server re-drops it rather than vanishing it,
    // and sends NO grant. (Pre-fix: a grant was sent unconditionally and the stack left the world.)
    a.pickupItem(gid);
    await new Promise((r) => setTimeout(r, 400));
    expect(a.grants).toHaveLength(0); // no grant — nothing entered A's bag
    expect([...a.worldItems.values()].some((w) => w.item.id === 'gem')).toBe(true); // still on ground

    a.close();
    b.close();
  });

  it('throttles claimReward ground spills so a full bag can’t flood the world', async () => {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'flooder@example.com', password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail('flooder@example.com'))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter('c6', 'Flooder', 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    ch.inventory = Array.from({ length: BAG_SIZE }, (_v, i) => ({
      item: mkItem({ id: `f${i}` }),
      qty: 1,
    }));
    await store.putCharacter(acct.id, ch);

    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Flooder', 'warrior', 5, token);
    await until(() => (c.lastInventory?.bag.length ?? 0) === BAG_SIZE, 3000, 'full bag replicated');

    // Spam far more full-bag reward spills than the burst budget (SPILL_BUCKET_CAP = 32). The token
    // bucket must bound the ground spawns well below the number sent — the anti-flood guarantee.
    const N = 80;
    for (let i = 0; i < N; i++) {
      c.claimReward(0, [{ item: mkItem({ id: `spam${i}`, name: 'Spam' }), qty: 1 }]);
    }
    await new Promise((r) => setTimeout(r, 500));
    const spilled = [...c.worldItems.values()].filter((w) => w.item.id.startsWith('spam')).length;
    expect(spilled).toBeGreaterThan(0); // some spilled (not everything was eaten)
    expect(spilled).toBeLessThan(N); // throttled — NOT all 80 reached the ground
    expect(spilled).toBeLessThanOrEqual(40); // bounded near the 32-token burst (+ a little refill)

    c.close();
  });
});
