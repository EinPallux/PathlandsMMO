// Server-authoritative quest log (Phase 6 quest migration #138, Stage 1). Each player's
// QuestLogState becomes server state — seeded from the persisted character on join, advanced by the
// authoritative paths (accept / turn-in / abandon / pin intents, kill credit, and the client-reported
// objective sources), and replicated to the owning client.
//
// The gameplay LOGIC is the pure `shared/quests` engine, reused here unchanged — it was written to
// run on both sides (deterministic, no wall-clock, no RNG). This model just owns per-player state and
// dirty tracking around it (mirroring `Inventories`). Reward COMPUTATION stays in the gateway, which
// has the RNG + inventory + combat it needs; `turnIn` returns the pure `QuestReward` for it to grant.

import {
  QUEST_DROP_TAGS,
  abandonQuest,
  acceptQuest,
  applyQuestEvent,
  createQuestLog,
  setPinned,
  turnInQuest,
  type QuestEvent,
  type QuestLogState,
  type QuestNotice,
  type QuestReward,
} from '@pathlands/shared';

interface PlayerQuests {
  log: QuestLogState;
  /** Set when the log changed since the last replication; cleared after sending. */
  dirty: boolean;
}

/** The authoritative quest logs of every joined player, keyed by session id. */
export class Quests {
  private readonly map = new Map<string, PlayerQuests>();

  /** Admit a player, seeding their quest log from the persisted character (or empty). */
  seed(id: string, log: QuestLogState | null | undefined): void {
    this.map.set(id, { log: cloneLog(log), dirty: true }); // replicate the seeded log first broadcast
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  get(id: string): QuestLogState | null {
    return this.map.get(id)?.log ?? null;
  }

  /**
   * Accept a quest into the log. `level` is the player's AUTHORITATIVE level (from combat), passed by
   * the gateway so the availability / minLevel check can't be spoofed. Returns whether it accepted.
   */
  accept(id: string, questId: string, level: number): boolean {
    const q = this.map.get(id);
    if (q === undefined) return false;
    const ok = acceptQuest(q.log, questId, Math.max(1, Math.floor(level)));
    if (ok) q.dirty = true;
    return ok;
  }

  abandon(id: string, questId: string): void {
    const q = this.map.get(id);
    if (q === undefined) return;
    const before = q.log.active.length;
    abandonQuest(q.log, questId);
    if (q.log.active.length !== before) q.dirty = true;
  }

  setPinned(id: string, questId: string, pinned: boolean): void {
    const q = this.map.get(id);
    if (q === undefined) return;
    setPinned(q.log, questId, pinned);
    q.dirty = true;
  }

  /** Apply a client-reported world event (explore / talk / deliver / use / gather) to the log. */
  applyEvent(id: string, ev: QuestEvent): QuestNotice[] {
    const q = this.map.get(id);
    if (q === undefined) return [];
    const notices = applyQuestEvent(q.log, ev);
    if (notices.length > 0) q.dirty = true;
    return notices;
  }

  /**
   * Apply an AUTHORITATIVE kill to the log — the kill + boss objectives, plus a collect objective for
   * the enemy's drop tag (mirrors the client's `onKill`, so a kill drives all three at once). Driven
   * by the gateway from server kill credit, so kill counts can't be forged.
   */
  applyKill(id: string, enemyId: string): void {
    const q = this.map.get(id);
    if (q === undefined) return;
    let changed = applyQuestEvent(q.log, { kind: 'kill', enemyId }).length > 0;
    changed = applyQuestEvent(q.log, { kind: 'boss', enemyId }).length > 0 || changed;
    const tag = QUEST_DROP_TAGS[enemyId];
    if (tag !== undefined) {
      changed = applyQuestEvent(q.log, { kind: 'collect', tag, n: 1 }).length > 0 || changed;
    }
    if (changed) q.dirty = true;
  }

  /**
   * Turn in a completed quest, returning its `QuestReward` for the gateway to grant (gold / items /
   * XP), or null if the quest isn't in the log or isn't complete. The pure engine re-validates
   * completion server-side, so a client can't turn in a quest it hasn't finished.
   */
  turnIn(id: string, questId: string): QuestReward | null {
    const q = this.map.get(id);
    if (q === undefined) return null;
    const reward = turnInQuest(q.log, questId);
    if (reward !== null) q.dirty = true;
    return reward;
  }

  isDirty(id: string): boolean {
    return this.map.get(id)?.dirty === true;
  }

  markClean(id: string): void {
    const q = this.map.get(id);
    if (q !== undefined) q.dirty = false;
  }
}

/** Deep-copy (and defensively repair) a quest log so the server owns a mutable copy of its own. */
function cloneLog(log: QuestLogState | null | undefined): QuestLogState {
  if (!log || !Array.isArray(log.active) || !Array.isArray(log.turnedIn)) return createQuestLog();
  return {
    active: log.active.map((p) => ({
      id: String(p.id),
      counts: Array.isArray(p.counts) ? p.counts.map((c) => Math.max(0, Math.floor(c))) : [],
      pinned: p.pinned === true,
    })),
    turnedIn: log.turnedIn.map((s) => String(s)),
  };
}
