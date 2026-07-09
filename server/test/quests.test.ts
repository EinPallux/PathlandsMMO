// Server-authoritative quests (Phase 6 quest migration #138, Stage 1). Two levels of proof:
//   1. The Quests model in isolation: seed + dirty tracking, availability/level-gated accept, the
//      kill-credit drive (kill/boss/collect from an authoritative kill), and complete-gated turn-in.
//   2. Over the wire: a player accepts a quest, advances it via a client-reported objective event,
//      and turns it in — the log replicates at each step and the reward (gold + items) is granted
//      SERVER-SIDE (no claimReward), while an unfinished turn-in is rejected.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCharacter,
  createQuestLog,
  EquipSlot,
  QUEST_GIVERS,
  settlementById,
  type QuestLogState,
} from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { ServerCombat } from '../src/combat.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { Quests } from '../src/quests.js';
import { TestClient, gatewayOptions, until } from './support.js';

/** Step the combat sim until a Vale boar exists, then return it (mirrors combat.test.ts). */
function spawnBoar(combat: ServerCombat): { id: string; x: number; y: number; z: number } {
  for (let i = 0; i < 5; i++) combat.step();
  const boar = combat.netEntities().find((e) => e.id.startsWith('valeBoars#'))!;
  return { id: boar.id, x: boar.x, y: boar.y, z: boar.z };
}

describe('Quests model', () => {
  it('seeds a log and reports it dirty; markClean clears it', () => {
    const q = new Quests();
    q.seed('p1', createQuestLog());
    expect(q.isDirty('p1')).toBe(true);
    expect(q.get('p1')).toEqual({ active: [], turnedIn: [] });
    q.markClean('p1');
    expect(q.isDirty('p1')).toBe(false);
  });

  it('accepts an available quest and rejects a level-gated / duplicate / unknown one', () => {
    const q = new Quests();
    q.seed('p1', createQuestLog());
    // q_strayed_flock is minLevel 2 — rejected at level 1, accepted at level 2.
    expect(q.accept('p1', 'q_strayed_flock', 1)).toBe(false);
    expect(q.accept('p1', 'q_strayed_flock', 2)).toBe(true);
    expect(q.get('p1')!.active.some((p) => p.id === 'q_strayed_flock')).toBe(true);
    expect(q.accept('p1', 'q_strayed_flock', 2)).toBe(false); // duplicate
    expect(q.accept('p1', 'not_a_quest', 30)).toBe(false); // unknown id
  });

  it('drives kill + collect objectives by exactly one per authoritative kill', () => {
    const q = new Quests();
    q.seed('p1', createQuestLog());
    q.accept('p1', 'q_boar_trouble', 1); // kill thornbackBoar x5
    q.accept('p1', 'q_verminous', 1); // collect ratTail x4 (blightrat's drop tag)
    // applyKill emits kill+boss+collect; a kill objective must advance by exactly 1 (not 2), so it's
    // still 4/5 after four kills — the fix for the boss-event double-count.
    for (let i = 0; i < 4; i++) q.applyKill('p1', 'thornbackBoar');
    expect(q.get('p1')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(4);
    for (let i = 0; i < 4; i++) q.applyKill('p1', 'blightrat');
    const log = q.get('p1')!;
    expect(log.active.find((p) => p.id === 'q_verminous')!.counts[0]).toBe(4); // collect via drop tag
    // The fifth boar completes it; overkill is clamped to the objective count.
    q.applyKill('p1', 'thornbackBoar');
    q.applyKill('p1', 'thornbackBoar');
    expect(q.get('p1')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(5);
  });

  it('turns in only a complete quest and moves it to turnedIn', () => {
    const q = new Quests();
    q.seed('p1', createQuestLog());
    q.accept('p1', 'q_boar_trouble', 1);
    expect(q.turnIn('p1', 'q_boar_trouble')).toBeNull(); // not complete yet
    for (let i = 0; i < 5; i++) q.applyKill('p1', 'thornbackBoar');
    const reward = q.turnIn('p1', 'q_boar_trouble');
    expect(reward).not.toBeNull();
    expect(reward!.gold).toBe(12);
    expect(q.get('p1')!.active.some((p) => p.id === 'q_boar_trouble')).toBe(false);
    expect(q.get('p1')!.turnedIn).toContain('q_boar_trouble');
  });
});

describe('quests — over the wire', () => {
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

  /** Register an account + persist a character (optional pre-set quest log + spawn), return a token. */
  async function persist(
    email: string,
    id: string,
    name: string,
    quests?: QuestLogState,
    spawn?: { x: number; z: number },
  ) {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail(email))!;
    const sx = spawn?.x ?? 120;
    const sz = spawn?.z ?? 120;
    const y = createServerWorld().surfaceSpawnY(sx, sz);
    const ch = createCharacter(id, name, 'warrior', { skin: 0, hair: 0 }, sx, y, sz);
    if (quests) ch.quests = quests;
    await store.putCharacter(acct.id, ch);
    return token;
  }

  it('accept → explore event → turn in: replicates the log + grants the gold reward', async () => {
    // Spawn AT the q_find_feet fountain (1536,1536) — the server advances explore from the
    // authoritative position now (Stage 2b), not the client-supplied coords.
    const token = await persist('walker@example.com', 'cq1', 'Walker', undefined, {
      x: 1536,
      z: 1536,
    });
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Walker', 'warrior', 1, token);
    await until(() => c.lastQuestLog !== null, 3000, 'quest log seeded');
    expect(c.lastQuestLog!.active).toHaveLength(0);

    // Accept q_find_feet (explore the Brookhollow fountain @ 1536,1536 r7).
    c.questAction('accept', 'q_find_feet');
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_find_feet') === true,
      3000,
      'accepted',
    );

    // Reach the fountain (client-reported explore at the target) → the objective advances.
    c.questEvent({ kind: 'explore', x: 1536, z: 1536 });
    await until(
      () => (c.lastQuestLog?.active.find((p) => p.id === 'q_find_feet')?.counts[0] ?? 0) >= 1,
      3000,
      'explore objective advanced',
    );

    // Turn in: the quest leaves the active log (into turnedIn) and its gold (5) lands in the wallet.
    const goldBefore = c.lastInventory?.gold ?? 0;
    c.questAction('turnIn', 'q_find_feet');
    await until(() => c.lastQuestLog?.turnedIn.includes('q_find_feet') === true, 3000, 'turned in');
    expect(c.lastQuestLog!.active.some((p) => p.id === 'q_find_feet')).toBe(false);
    await until(() => (c.lastInventory?.gold ?? 0) >= goldBefore + 5, 3000, 'reward gold granted');

    c.close();
  });

  it('grants a completed quest’s reward items on turn-in, server-side (no claimReward)', async () => {
    // Seed the character with q_boar_trouble ALREADY complete (5/5) so we can turn it in on the wire
    // without driving combat. The server rolls the chosen reward item + grants it into the bag.
    const done: QuestLogState = {
      active: [{ id: 'q_boar_trouble', counts: [5], pinned: false }],
      turnedIn: [],
    };
    const token = await persist('slayer@example.com', 'cq2', 'Slayer', done);
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Slayer', 'warrior', 1, token);
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_boar_trouble') === true,
      3000,
      'seeded complete quest',
    );
    const bagBefore = c.lastInventory?.bag.length ?? 0;
    const goldBefore = c.lastInventory?.gold ?? 0;

    // Turn in choosing reward choice 0 (Uncommon Hands). Gold + XP + one generated item are granted.
    c.questAction('turnIn', 'q_boar_trouble', 0);
    await until(
      () => c.lastQuestLog?.turnedIn.includes('q_boar_trouble') === true,
      3000,
      'turned in',
    );
    await until(
      () => (c.lastInventory?.bag.length ?? 0) >= bagBefore + 1,
      3000,
      'reward item granted into the bag',
    );
    expect(c.lastInventory!.gold).toBe(goldBefore + 12);
    // The chosen slot (0 = Hands) was honored and the item was rolled SERVER-SIDE (a `gen:` id).
    expect(
      c.lastInventory!.bag.some(
        (s) => s.item.slot === EquipSlot.Hands && String(s.item.id).startsWith('gen:'),
      ),
    ).toBe(true);
    // Reward XP (260 → scaledQuestXp 520) was granted through server progression.
    await until(
      () => (c.lastCombatSelf?.totalXp ?? 0) >= 520,
      3000,
      'reward xp granted server-side',
    );

    c.close();
  });

  it('rejects a turn-in of an unfinished quest (anti-cheat)', async () => {
    const token = await persist('cheater@example.com', 'cq3', 'Cheater');
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Cheater', 'warrior', 1, token);
    await until(() => c.lastQuestLog !== null, 3000, 'seeded');

    c.questAction('accept', 'q_boar_trouble'); // 0/5 boars
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_boar_trouble') === true,
      3000,
      'accepted',
    );
    const goldBefore = c.lastInventory?.gold ?? 0;

    // Forge a turn-in of the unfinished quest — the server re-checks completion and rejects it.
    c.questAction('turnIn', 'q_boar_trouble');
    await new Promise((r) => setTimeout(r, 300));
    expect(c.lastQuestLog!.active.some((p) => p.id === 'q_boar_trouble')).toBe(true);
    expect(c.lastQuestLog!.turnedIn).not.toContain('q_boar_trouble');
    expect(c.lastInventory?.gold ?? 0).toBe(goldBefore); // no reward granted

    c.close();
  });

  it('rejects accepting a level-gated quest against the authoritative level', async () => {
    // A level-1 player forges an accept of q_strayed_flock (minLevel 2). The server checks the
    // AUTHORITATIVE combat level, not a client-supplied one, so it never enters the log.
    const token = await persist('lowbie@example.com', 'cq4', 'Lowbie');
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Lowbie', 'warrior', 1, token);
    await until(() => c.lastQuestLog !== null, 3000, 'seeded');

    c.questAction('accept', 'q_strayed_flock'); // minLevel 2, we are level 1
    // Also accept a valid quest so a later frame proves replication is flowing (not just silence).
    c.questAction('accept', 'q_boar_trouble');
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_boar_trouble') === true,
      3000,
      'valid quest accepted',
    );
    expect(c.lastQuestLog!.active.some((p) => p.id === 'q_strayed_flock')).toBe(false);

    c.close();
  });

  it('abandons an accepted quest over the wire', async () => {
    const token = await persist('quitter@example.com', 'cq5', 'Quitter');
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Quitter', 'warrior', 1, token);
    await until(() => c.lastQuestLog !== null, 3000, 'seeded');

    c.questAction('accept', 'q_boar_trouble');
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_boar_trouble') === true,
      3000,
      'accepted',
    );
    c.questAction('abandon', 'q_boar_trouble');
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_boar_trouble') === false,
      3000,
      'abandoned',
    );
    expect(c.lastQuestLog!.turnedIn).not.toContain('q_boar_trouble'); // abandon ≠ turn-in

    c.close();
  });

  it('persists the authoritative quest log on disconnect (server-owned now, Stage 2)', async () => {
    // Spawn at the fountain so the explore advances from the authoritative position (Stage 2b).
    const token = await persist('journal@example.com', 'cq6', 'Journal', undefined, {
      x: 1536,
      z: 1536,
    });
    const acct = (await store.getByEmail('journal@example.com'))!;
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Journal', 'warrior', 1, token);
    await until(() => c.lastQuestLog !== null, 3000, 'seeded');

    // Accept → complete (explore) → turn in q_find_feet entirely over the wire.
    c.questAction('accept', 'q_find_feet');
    await until(
      () => c.lastQuestLog?.active.some((p) => p.id === 'q_find_feet') === true,
      3000,
      'accepted',
    );
    c.questEvent({ kind: 'explore', x: 1536, z: 1536 });
    await until(
      () => (c.lastQuestLog?.active.find((p) => p.id === 'q_find_feet')?.counts[0] ?? 0) >= 1,
      3000,
      'explored',
    );
    c.questAction('turnIn', 'q_find_feet');
    await until(() => c.lastQuestLog?.turnedIn.includes('q_find_feet') === true, 3000, 'turned in');

    // Disconnect → the server writes ITS authoritative log to the stored character (no longer a
    // client-owned blob). The persisted character reflects the turn-in.
    c.close();
    let saved = null;
    for (let i = 0; i < 40; i++) {
      saved = await store.getCharacter(acct.id);
      if (saved !== null && saved.quests.turnedIn.includes('q_find_feet')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(saved!.quests.turnedIn).toContain('q_find_feet');
    expect(saved!.quests.active.some((p) => p.id === 'q_find_feet')).toBe(false);
  });

  it('advances an explore objective from the player’s authoritative position, ignoring forged coords (Stage 2b)', async () => {
    // A stands AT the q_find_feet fountain (1536,1536, r7); B stands far away (120,120).
    const tokenA = await persist('atsite@example.com', 'cq7', 'AtSite', undefined, {
      x: 1536,
      z: 1536,
    });
    const tokenB = await persist('faker@example.com', 'cq8', 'Faker'); // default spawn (120,120)

    const a = new TestClient(wsUrl);
    await a.opened();
    a.hello('AtSite', 'warrior', 1, tokenA);
    await until(() => a.lastQuestLog !== null, 3000, 'A seeded');
    a.questAction('accept', 'q_find_feet');
    await until(
      () => a.lastQuestLog?.active.some((p) => p.id === 'q_find_feet') === true,
      3000,
      'A accepted',
    );
    // A reports explore (coords irrelevant) — the server uses A's authoritative position, which is at
    // the fountain, so the objective advances.
    a.questEvent({ kind: 'explore', x: 0, z: 0 });
    await until(
      () => (a.lastQuestLog?.active.find((p) => p.id === 'q_find_feet')?.counts[0] ?? 0) >= 1,
      3000,
      'A advanced from its real position',
    );

    const b = new TestClient(wsUrl);
    await b.opened();
    b.hello('Faker', 'warrior', 1, tokenB);
    await until(() => b.lastQuestLog !== null, 3000, 'B seeded');
    b.questAction('accept', 'q_find_feet');
    await until(
      () => b.lastQuestLog?.active.some((p) => p.id === 'q_find_feet') === true,
      3000,
      'B accepted',
    );
    // B forges the fountain coords while standing at (120,120) — the server ignores the coords and
    // uses B's authoritative position, which is nowhere near, so the objective does NOT advance.
    b.questEvent({ kind: 'explore', x: 1536, z: 1536 });
    await new Promise((r) => setTimeout(r, 300));
    expect(b.lastQuestLog!.active.find((p) => p.id === 'q_find_feet')!.counts[0]).toBe(0);

    a.close();
    b.close();
  });

  it('advances a talk objective only when the player is near the target NPC (Stage 2b)', async () => {
    // q_word_from_millstead has a talk objective at wardenTuck; seed it active (bypassing prereqs).
    const tuck = QUEST_GIVERS.find((g) => g.id === 'wardenTuck')!;
    const set = settlementById(tuck.settlement)!;
    const tuckPos = { x: set.cx + tuck.dx, z: set.cz + tuck.dz };
    const active: QuestLogState = {
      active: [{ id: 'q_word_from_millstead', counts: [0], pinned: false }],
      turnedIn: [],
    };

    // Near Tuck → the talk advances.
    const tokenNear = await persist('pilgrim@example.com', 'cq9', 'Pilgrim', active, tuckPos);
    const near = new TestClient(wsUrl);
    await near.opened();
    near.hello('Pilgrim', 'warrior', 1, tokenNear);
    await until(
      () => near.lastQuestLog?.active.some((p) => p.id === 'q_word_from_millstead') === true,
      3000,
      'near seeded',
    );
    near.questEvent({ kind: 'talk', npcId: 'wardenTuck' });
    await until(
      () =>
        (near.lastQuestLog?.active.find((p) => p.id === 'q_word_from_millstead')?.counts[0] ?? 0) >=
        1,
      3000,
      'talk advanced when near',
    );
    near.close();

    // Far from Tuck (default spawn) → the forged talk is dropped.
    const tokenFar = await persist('spoofer@example.com', 'cqA', 'Spoofer', active);
    const far = new TestClient(wsUrl);
    await far.opened();
    far.hello('Spoofer', 'warrior', 1, tokenFar);
    await until(
      () => far.lastQuestLog?.active.some((p) => p.id === 'q_word_from_millstead') === true,
      3000,
      'far seeded',
    );
    far.questEvent({ kind: 'talk', npcId: 'wardenTuck' });
    await new Promise((r) => setTimeout(r, 300));
    expect(far.lastQuestLog!.active.find((p) => p.id === 'q_word_from_millstead')!.counts[0]).toBe(
      0,
    );
    far.close();
  });
});

describe('party quest kill-credit (ServerCombat + Quests)', () => {
  it('advances the quest log of every nearby party member on one kill (the gateway fan-out)', () => {
    // Part 22 proved creditKill fans the enemy id to each eligible member's drainKills. This proves
    // the quest-migration seam the gateway adds on top: draining a member's kills and applying each
    // to that member's authoritative quest log advances it — so party questing credits everyone.
    const combat = new ServerCombat(createServerWorld());
    const boar = spawnBoar(combat);
    combat.setPartyProvider(() => ['P', 'Q']);
    combat.setLootRecipientProvider(() => 'P'); // loot to one; quest credit to all
    combat.addPlayer('P', 'Mage', 'mage', 6, boar.x, boar.y, boar.z, 0);
    combat.addPlayer('Q', 'Cleric', 'priest', 6, boar.x + 5, boar.y, boar.z, 0); // ~5 m — in range
    const enemyId = combat.state.entities.get(boar.id)!.enemyId!;
    expect(enemyId).toBe('thornbackBoar'); // the enemy q_boar_trouble targets

    // Both members are on q_boar_trouble (kill thornbackBoar x5).
    const quests = new Quests();
    for (const id of ['P', 'Q']) {
      quests.seed(id, createQuestLog());
      quests.accept(id, 'q_boar_trouble', 6);
    }

    // P lands the killing blow.
    combat.state.entities.get(boar.id)!.hp = 1;
    combat.applyPlayerIntent('P', { type: 'SetTarget', targetId: boar.id });
    combat.applyPlayerIntent('P', { type: 'CastSkill', skillId: 'fireBlast', targetId: boar.id });
    combat.step();

    // Exactly what the gateway broadcast loop does per member: drain its kills → apply to its log.
    for (const id of ['P', 'Q']) {
      for (const kill of combat.drainKills(id)) quests.applyKill(id, kill.enemyId);
    }

    // BOTH the killer and the nearby ally advanced their kill objective.
    expect(quests.get('P')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(1);
    expect(quests.get('Q')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(1);
  });

  it('does not credit a party member out of range', () => {
    const combat = new ServerCombat(createServerWorld());
    const boar = spawnBoar(combat);
    combat.setPartyProvider(() => ['P', 'Q']);
    combat.addPlayer('P', 'Mage', 'mage', 6, boar.x, boar.y, boar.z, 0);
    combat.addPlayer('Q', 'Cleric', 'priest', 6, boar.x + 200, boar.y, boar.z, 0); // far away
    const quests = new Quests();
    for (const id of ['P', 'Q']) {
      quests.seed(id, createQuestLog());
      quests.accept(id, 'q_boar_trouble', 6);
    }
    combat.state.entities.get(boar.id)!.hp = 1;
    combat.applyPlayerIntent('P', { type: 'SetTarget', targetId: boar.id });
    combat.applyPlayerIntent('P', { type: 'CastSkill', skillId: 'fireBlast', targetId: boar.id });
    combat.step();
    for (const id of ['P', 'Q']) {
      for (const kill of combat.drainKills(id)) quests.applyKill(id, kill.enemyId);
    }
    expect(quests.get('P')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(1);
    expect(quests.get('Q')!.active.find((p) => p.id === 'q_boar_trouble')!.counts[0]).toBe(0);
  });
});
