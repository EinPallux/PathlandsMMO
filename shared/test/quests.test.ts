import { describe, it, expect } from 'vitest';
import {
  createQuestLog,
  availableFrom,
  readyToTurnIn,
  inProgressAt,
  acceptQuest,
  applyQuestEvent,
  turnInQuest,
  abandonQuest,
  setPinned,
  isAvailable,
  isQuestComplete,
  progressOf,
  MAX_PINNED,
  QUESTS,
  QUEST_GIVERS,
  questById,
  questGiverById,
  enemyById,
  EQUIP_SLOTS,
  settlementById,
  type QuestLogState,
} from '../src/index.js';

describe('Quest state machine (GDD §8)', () => {
  it('offers a giver’s quests, gated by level and prereqs', () => {
    const log = createQuestLog();
    const fromMaris = availableFrom('elderMaris', log, 1).map((q) => q.id);
    expect(fromMaris).toContain('q_find_feet');
    // Light the Way is locked behind Find Your Feet.
    expect(fromMaris).not.toContain('q_light_the_way');
    // A high-level boss quest is level-gated.
    expect(availableFrom('wardenTuck', log, 1).some((q) => q.id === 'q_warren_warlord')).toBe(
      false,
    );
  });

  it('accepts a quest and advances an explore objective within radius', () => {
    const log = createQuestLog();
    expect(acceptQuest(log, 'q_find_feet', 1)).toBe(true);
    // Far away → no progress.
    expect(applyQuestEvent(log, { kind: 'explore', x: 2000, z: 2000 })).toHaveLength(0);
    // At the fountain → objective + quest complete.
    const notices = applyQuestEvent(log, { kind: 'explore', x: 1536, z: 1536 });
    expect(notices.some((n) => n.type === 'questComplete')).toBe(true);
    expect(isQuestComplete(questById('q_find_feet')!, progressOf(log, 'q_find_feet')!)).toBe(true);
  });

  it('counts kill objectives and fires notices once', () => {
    const log = createQuestLog();
    acceptQuest(log, 'q_boar_trouble', 1);
    let completed = 0;
    for (let i = 0; i < 6; i++) {
      const n = applyQuestEvent(log, { kind: 'kill', enemyId: 'thornbackBoar' });
      completed += n.filter((x) => x.type === 'questComplete').length;
    }
    // 5 required → completes exactly once, extra kills do nothing.
    expect(completed).toBe(1);
    expect(progressOf(log, 'q_boar_trouble')!.counts[0]).toBe(5);
  });

  it('collect objectives accumulate by n', () => {
    const log = createQuestLog();
    acceptQuest(log, 'q_verminous', 1);
    applyQuestEvent(log, { kind: 'collect', tag: 'ratTail', n: 3 });
    expect(progressOf(log, 'q_verminous')!.counts[0]).toBe(3);
    const done = applyQuestEvent(log, { kind: 'collect', tag: 'ratTail', n: 2 });
    expect(progressOf(log, 'q_verminous')!.counts[0]).toBe(4); // clamped to the required 4
    expect(done.some((n) => n.type === 'questComplete')).toBe(true);
  });

  it('runs the main-story chain with a use objective and prereq unlock', () => {
    const log = createQuestLog();
    // Complete Find Your Feet first.
    acceptQuest(log, 'q_find_feet', 1);
    applyQuestEvent(log, { kind: 'explore', x: 1536, z: 1536 });
    expect(turnInQuest(log, 'q_find_feet')).not.toBeNull();
    // Now Light the Way is available; a Waystone `use` completes it.
    expect(isAvailable(questById('q_light_the_way')!, log, 1)).toBe(true);
    acceptQuest(log, 'q_light_the_way', 1);
    applyQuestEvent(log, { kind: 'use', objectId: 'brookhollow' });
    const reward = turnInQuest(log, 'q_light_the_way');
    expect(reward).not.toBeNull();
    expect(reward!.waystoneUnlock).toBe('brookhollow');
    expect(log.turnedIn).toContain('q_light_the_way');
  });

  it('handles a cross-NPC turn-in (give at Maris, hand in at Tuck)', () => {
    const log = createQuestLog();
    // Fast-forward the prereqs.
    log.turnedIn.push('q_find_feet', 'q_light_the_way');
    expect(acceptQuest(log, 'q_word_from_millstead', 1)).toBe(true);
    applyQuestEvent(log, { kind: 'talk', npcId: 'wardenTuck' });
    // Not ready to turn in at the giver; ready at Tuck.
    expect(readyToTurnIn('elderMaris', log)).toHaveLength(0);
    expect(readyToTurnIn('wardenTuck', log).map((q) => q.id)).toContain('q_word_from_millstead');
  });

  it('a boss objective completes on the boss kill', () => {
    const log = createQuestLog();
    log.turnedIn.push('q_find_feet', 'q_light_the_way', 'q_word_from_millstead', 'q_thin_the_pack');
    expect(acceptQuest(log, 'q_warren_warlord', 12)).toBe(true);
    const n = applyQuestEvent(log, { kind: 'boss', enemyId: 'bossBriarking' });
    expect(n.some((x) => x.type === 'questComplete')).toBe(true);
  });

  it('reports in-progress vs ready at the giver', () => {
    const log = createQuestLog();
    acceptQuest(log, 'q_boar_trouble', 1);
    expect(inProgressAt('farmerBressel', log).map((q) => q.id)).toContain('q_boar_trouble');
    expect(readyToTurnIn('farmerBressel', log)).toHaveLength(0);
  });

  it('abandon drops progress; pinning respects the cap', () => {
    const log: QuestLogState = createQuestLog();
    acceptQuest(log, 'q_boar_trouble', 1);
    abandonQuest(log, 'q_boar_trouble');
    expect(progressOf(log, 'q_boar_trouble')).toBeUndefined();
    // Pin cap.
    const ids = QUESTS.slice(0, MAX_PINNED + 2).map((q) => q.id);
    for (const id of ids) {
      log.active.push({ id, counts: [], pinned: false });
      setPinned(log, id, true);
    }
    expect(log.active.filter((p) => p.pinned).length).toBeLessThanOrEqual(MAX_PINNED);
  });

  it('does not re-offer a turned-in, non-repeatable quest', () => {
    const log = createQuestLog();
    log.turnedIn.push('q_find_feet');
    expect(isAvailable(questById('q_find_feet')!, log, 1)).toBe(false);
  });
});

describe('Quest content validity', () => {
  it('every quest giver + prereq + turnIn resolves', () => {
    const giverIds = new Set(QUEST_GIVERS.map((g) => g.id));
    for (const q of QUESTS) {
      expect(giverIds.has(q.giver), `${q.id} giver`).toBe(true);
      if (q.turnIn) expect(giverIds.has(q.turnIn), `${q.id} turnIn`).toBe(true);
      for (const pre of q.prereq ?? [])
        expect(questById(pre), `${q.id} prereq ${pre}`).toBeDefined();
    }
  });

  it('kill/boss objectives target real enemies; explore objectives have a point', () => {
    for (const q of QUESTS) {
      for (const o of q.objectives) {
        if (o.kind === 'kill' || o.kind === 'boss') {
          expect(enemyById(o.target), `${q.id}:${o.target}`).toBeDefined();
        }
        if (o.kind === 'explore') {
          expect(typeof o.x === 'number' && typeof o.z === 'number', q.id).toBe(true);
        }
      }
    }
  });

  it('reward item specs use real equip slots; givers sit in real settlements', () => {
    const slots = new Set<string>(EQUIP_SLOTS);
    for (const q of QUESTS) {
      for (const s of [...(q.reward.items ?? []), ...(q.reward.choices ?? [])]) {
        expect(slots.has(s.slot), `${q.id} slot`).toBe(true);
      }
    }
    for (const g of QUEST_GIVERS) {
      expect(settlementById(g.settlement), g.id).toBeDefined();
      expect(questGiverById(g.id)).toBe(g);
    }
  });
});
