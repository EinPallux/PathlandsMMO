// Server-authoritative quests (Phase 6 quest migration #138, Stage 1). Two levels of proof:
//   1. The Quests model in isolation: seed + dirty tracking, availability/level-gated accept, the
//      kill-credit drive (kill/boss/collect from an authoritative kill), and complete-gated turn-in.
//   2. Over the wire: a player accepts a quest, advances it via a client-reported objective event,
//      and turns it in — the log replicates at each step and the reward (gold + items) is granted
//      SERVER-SIDE (no claimReward), while an unfinished turn-in is rejected.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, createQuestLog, EquipSlot, type QuestLogState } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { Quests } from '../src/quests.js';
import { TestClient, gatewayOptions, until } from './support.js';

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

  /** Register an account + persist a character (optionally with a pre-set quest log), return a token. */
  async function persist(email: string, id: string, name: string, quests?: QuestLogState) {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail(email))!;
    const y = createServerWorld().surfaceSpawnY(120, 120);
    const ch = createCharacter(id, name, 'warrior', { skin: 0, hair: 0 }, 120, y, 120);
    if (quests) ch.quests = quests;
    await store.putCharacter(acct.id, ch);
    return token;
  }

  it('accept → explore event → turn in: replicates the log + grants the gold reward', async () => {
    const token = await persist('walker@example.com', 'cq1', 'Walker');
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
});
