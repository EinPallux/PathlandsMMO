// Server-authoritative professions (Phase 6 profession migration #139). Two levels of proof:
//   1. The Professions model in isolation: seed + dirty tracking, gather yield/skill-up + per-player
//      node depletion + the action-cadence gate + skill gating, crafting (stash + gear outputs, input
//      consumption, discovery), consumable use, and forged-save clamping.
//   2. Over the wire: a player gathers a real worldgen node (resolved from its authoritative position),
//      forges gear via crafting (granted SERVER-SIDE — no claimReward), and drinks a consumable; a
//      gather far from any node yields nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCharacter,
  EquipSlot,
  nodeInfo,
  Profession,
  Rarity,
  type CharacterSave,
} from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { Professions, type GatherCandidate } from '../src/professions.js';
import { TestClient, gatewayOptions, until, sleep } from './support.js';

const RESPAWN = 2400; // ticks (~120 s @ 20 Hz) — matches the gateway's node respawn
const CADENCE = 24; // ticks (~1.2 s) — matches the gateway's gather/fish cadence gate

/** Find a real gatherable tier-0 node near spawn by re-running the worldgen scatter (so the
 *  over-the-wire gather test can stand a player exactly on it). Returns its world position + info. */
function findTier0Node(): { x: number; z: number; prof: Profession; tier: number } {
  const world = createServerWorld().world;
  for (let cx = 40; cx <= 80; cx++) {
    for (let cz = 40; cz <= 80; cz++) {
      let props;
      try {
        props = world.scatterChunk(cx, cz);
      } catch {
        continue;
      }
      for (const p of props) {
        const info = nodeInfo(p.prop);
        if (info !== undefined && info.tier === 0) {
          return { x: p.x, z: p.z, prof: info.profession, tier: info.tier };
        }
      }
    }
  }
  throw new Error('no tier-0 gather node found near spawn');
}

describe('Professions model', () => {
  const cand = (key: string, tier = 0, prof = Profession.Mining): GatherCandidate => ({
    prof,
    tier,
    key,
  });

  it('seeds defaults, reports dirty, and clears on markClean', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    expect(p.isDirty('p1')).toBe(true);
    const state = p.get('p1')!;
    expect(state.skills.mining).toBe(1);
    expect(state.materials).toEqual({});
    expect(state.learned).toEqual([]);
    p.markClean('p1');
    expect(p.isDirty('p1')).toBe(false);
  });

  it('gathers the nearest eligible node: banks yields, levels the skill, emits a notice', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    expect(p.gather('p1', [cand('n1')], 100, RESPAWN, CADENCE)).toBe(true);
    const f = p.frame('p1')!;
    expect(f.materials.copperOre).toBeGreaterThanOrEqual(1); // primary ore banked
    expect(f.materials.roughStone).toBeGreaterThanOrEqual(1); // mining stone byproduct
    expect(f.skills.mining).toBeGreaterThan(1); // orange node → +1 skill
    const notice = f.notices.find((n) => n.kind === 'gather');
    expect(notice).toBeDefined();
  });

  it('depletes a worked node per-player until it respawns', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    expect(p.gather('p1', [cand('n1')], 100, RESPAWN, CADENCE)).toBe(true);
    // Same node, past the cadence gate but before respawn → refused (depleted).
    expect(p.gather('p1', [cand('n1')], 100 + CADENCE, RESPAWN, CADENCE)).toBe(false);
    // After the respawn window it works again.
    expect(p.gather('p1', [cand('n1')], 100 + RESPAWN + 1, RESPAWN, CADENCE)).toBe(true);
  });

  it('enforces the gather/fish action cadence', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    expect(p.gather('p1', [cand('a')], 100, RESPAWN, CADENCE)).toBe(true);
    // A fresh node but within the cadence window → refused.
    expect(p.gather('p1', [cand('b')], 100 + CADENCE - 1, RESPAWN, CADENCE)).toBe(false);
    expect(p.gather('p1', [cand('b')], 100 + CADENCE, RESPAWN, CADENCE)).toBe(true);
  });

  it('skips a node above the player’s skill', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    // A tier-3 vein (skill req 75) is not gatherable at skill 1 → nothing gathered.
    expect(p.gather('p1', [cand('deep', 3)], 100, RESPAWN, CADENCE)).toBe(false);
    expect(p.get('p1')!.materials).toEqual({});
  });

  it('fishes: banks a catch + levels Fishing without depletion', () => {
    const p = new Professions();
    p.seed('p1', 'p1', null);
    expect(p.fish('p1', 0, 100, CADENCE)).toBe(true);
    const f = p.frame('p1')!;
    expect(Object.keys(f.materials).length).toBeGreaterThan(0);
    expect(f.notices.some((n) => n.kind === 'gather' && n.prof === 'fishing')).toBe(true);
  });

  it('crafts a stash output, consuming the inputs', () => {
    const p = new Professions();
    p.seed('p1', 'p1', { materials: { copperOre: 2 } });
    const out = p.craftRecipe('p1', 'r_copperBar'); // 2 copperOre → 1 copperBar
    expect(out.kind).toBe('stash');
    const f = p.frame('p1')!;
    expect(f.materials.copperOre ?? 0).toBe(0);
    expect(f.materials.copperBar).toBe(1);
    expect(f.notices.some((n) => n.kind === 'craft' && n.recipe === 'r_copperBar')).toBe(true);
  });

  it('refuses a craft the player can’t afford (no consume)', () => {
    const p = new Professions();
    p.seed('p1', 'p1', { materials: { copperOre: 1 } }); // needs 2
    expect(p.craftRecipe('p1', 'r_copperBar').kind).toBe('none');
    expect(p.get('p1')!.materials.copperOre).toBe(1); // untouched
  });

  it('forges gear as a gateway-granted spec (retiring claimReward)', () => {
    const p = new Professions();
    p.seed('p1', 'p1', {
      professions: { blacksmithing: 10 },
      materials: { copperBar: 3, roughStone: 1 },
    });
    const out = p.craftRecipe('p1', 'r_copperSword');
    expect(out.kind).toBe('gear');
    if (out.kind === 'gear') {
      expect(out.spec.slot).toBe(EquipSlot.MainHand);
      expect(out.spec.rarity).toBe(Rarity.Uncommon);
    }
    // The inputs are consumed even though the item is forged by the gateway.
    expect(p.get('p1')!.materials.copperBar ?? 0).toBe(0);
  });

  it('uses a consumable: returns the effect + debits the stash', () => {
    const p = new Professions();
    p.seed('p1', 'p1', { consumables: { lesserHealthPotion: 1 } });
    const eff = p.useConsumable('p1', 'lesserHealthPotion');
    expect(eff).not.toBeNull();
    expect(eff!.kind).toBe('heal');
    expect(p.get('p1')!.consumables.lesserHealthPotion ?? 0).toBe(0);
    // None left → no effect.
    expect(p.useConsumable('p1', 'lesserHealthPotion')).toBeNull();
  });

  it('clamps a forged skill above the cap on seed', () => {
    const p = new Professions();
    p.seed('p1', 'p1', { professions: { mining: 999 } });
    expect(p.get('p1')!.skills.mining).toBe(100);
  });

  it('sanitizes a forged save blob: unknown ids dropped, counts clamped, learned filtered', () => {
    const p = new Professions();
    p.seed('p1', 'p1', {
      materials: { copperOre: 1e9, notARealMaterial: 5 },
      consumables: { healthPotion: 1e12, fakeConsumable: 3 },
      // A real discovery id (kept), a known-by-default recipe id (dropped), garbage (dropped).
      learnedRecipes: ['r_crystaliumBlade', 'r_copperBar', 'notARecipe'],
    });
    const s = p.get('p1')!;
    expect(s.materials.copperOre).toBe(100_000); // clamped, not 1e9-worth of infinite crafts
    expect(s.materials.notARealMaterial).toBeUndefined(); // unknown id dropped
    expect(s.consumables.healthPotion).toBe(100_000);
    expect(s.consumables.fakeConsumable).toBeUndefined();
    expect(s.learned).toEqual(['r_crystaliumBlade']); // only the real discovery recipe survives
  });

  it('does not advance the craft RNG stream on a failed craft', () => {
    // Both players key 'k' and craft the SAME draw-bearing recipe (master potion at skill 85 rolls a
    // green skill-up + a discovery); one first spams unaffordable crafts. With seq advancing only on
    // success, both land on stream position 0 for that craft → byte-identical result. If a failed
    // craft advanced seq, the spammer would land on a later position and diverge.
    const blob = { professions: { alchemy: 85 }, materials: { duskpetal: 2 } };
    const clean = new Professions();
    clean.seed('k', 'k', { ...blob, materials: { duskpetal: 2 } });
    clean.craftRecipe('k', 'r_masterHealthPotion');

    const spammed = new Professions();
    spammed.seed('k', 'k', { ...blob, materials: { duskpetal: 2 } });
    for (let i = 0; i < 5; i++) expect(spammed.craftRecipe('k', 'r_copperBar').kind).toBe('none'); // no copperOre
    spammed.craftRecipe('k', 'r_masterHealthPotion');

    const a = clean.get('k')!;
    const b = spammed.get('k')!;
    expect(b.skills.alchemy).toBe(a.skills.alchemy); // same green skill-up outcome
    expect(b.learned).toEqual(a.learned); // same discovery outcome
  });
});

describe('professions — over the wire', () => {
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

  /** Register an account + persist a character (spawn + optional profession blob), return a token. */
  async function persist(
    email: string,
    id: string,
    name: string,
    spawn: { x: number; z: number },
    blob?: Partial<
      Pick<CharacterSave, 'professions' | 'materials' | 'consumables' | 'learnedRecipes'>
    >,
  ): Promise<string> {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail(email))!;
    const y = createServerWorld().surfaceSpawnY(spawn.x, spawn.z);
    const ch = createCharacter(id, name, 'warrior', { skin: 0, hair: 0 }, spawn.x, y, spawn.z);
    if (blob?.professions) ch.professions = { ...ch.professions, ...blob.professions };
    if (blob?.materials) ch.materials = blob.materials;
    if (blob?.consumables) ch.consumables = blob.consumables;
    if (blob?.learnedRecipes) ch.learnedRecipes = blob.learnedRecipes;
    await store.putCharacter(acct.id, ch);
    return token;
  }

  it('gathers a real worldgen node from the authoritative position', async () => {
    const node = findTier0Node();
    const token = await persist('miner@example.com', 'pp1', 'Miner', { x: node.x, z: node.z });
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Miner', 'warrior', 5, token);
    await until(() => c.lastProfessions !== null, 3000, 'professions seeded');

    c.profAction('gather');
    await until(
      () => c.profNotices.some((n) => n.kind === 'gather'),
      3000,
      'gather resolved server-side',
    );
    // The yield landed in the authoritative stash the client mirrors.
    expect(Object.keys(c.lastProfessions!.materials).length).toBeGreaterThan(0);
    c.close();
  });

  it('yields nothing when gathering far from any node', async () => {
    // The Brookhollow fountain plaza (1536,1536) is a paved town centre — no gather nodes.
    const token = await persist('nowhere@example.com', 'pp2', 'Nowhere', { x: 1536, z: 1536 });
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Nowhere', 'warrior', 5, token);
    await until(() => c.lastProfessions !== null, 3000, 'professions seeded');

    c.profAction('gather');
    await sleep(400); // give the server time to (not) resolve + broadcast
    expect(c.profNotices.some((n) => n.kind === 'gather')).toBe(false);
    expect(c.lastProfessions!.materials).toEqual({});
    c.close();
  });

  it('forges crafted gear server-side into the bag (no claimReward)', async () => {
    const token = await persist(
      'smith@example.com',
      'pp3',
      'Smith',
      { x: 1536, z: 1536 },
      {
        professions: { blacksmithing: 10 },
        materials: { copperBar: 3, roughStone: 1 },
      },
    );
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Smith', 'warrior', 8, token);
    await until(() => c.lastInventory !== null && c.lastProfessions !== null, 3000, 'seeded');
    const bagBefore = c.lastInventory!.bag.length;

    c.profAction('craft', 'r_copperSword'); // 3 copperBar + 1 roughStone → an Uncommon MainHand
    await until(
      () => c.lastInventory!.bag.length > bagBefore,
      3000,
      'crafted gear granted into the bag',
    );
    // The item was forged SERVER-SIDE (a `gen:` id) in the weapon slot; the bars were consumed.
    expect(
      c.lastInventory!.bag.some(
        (s) => s.item.slot === EquipSlot.MainHand && String(s.item.id).startsWith('gen:'),
      ),
    ).toBe(true);
    await until(
      () => (c.lastProfessions!.materials.copperBar ?? 0) === 0,
      3000,
      'craft inputs consumed server-side',
    );
    expect(c.profNotices.some((n) => n.kind === 'craft' && n.recipe === 'r_copperSword')).toBe(
      true,
    );
    c.close();
  });

  it('drinks a consumable: debits the stash server-side', async () => {
    const token = await persist(
      'quaffer@example.com',
      'pp4',
      'Quaffer',
      { x: 1536, z: 1536 },
      {
        consumables: { lesserHealthPotion: 2 },
      },
    );
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Quaffer', 'warrior', 5, token);
    await until(
      () => (c.lastProfessions?.consumables.lesserHealthPotion ?? 0) === 2,
      3000,
      'consumables seeded',
    );

    c.profAction('use', 'lesserHealthPotion');
    await until(
      () => (c.lastProfessions?.consumables.lesserHealthPotion ?? 0) === 1,
      3000,
      'consumable debited server-side',
    );
    expect(c.profNotices.some((n) => n.kind === 'use' && n.id === 'lesserHealthPotion')).toBe(true);
    c.close();
  });
});
