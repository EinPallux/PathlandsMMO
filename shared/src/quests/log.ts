// Quest state machine (GDD §8). Pure and deterministic: it holds the player's quest
// log, accepts quests from givers, advances objectives from world events (kills,
// exploration, talks, world-object use), and grants rewards on turn-in. No DOM, no
// wall-clock, no RNG — the same engine runs client-side now and server-side in P6.

import {
  QUESTS,
  questById,
  type QuestDef,
  type Objective,
  type QuestReward,
} from '../data/quests/index.js';

/** Per-quest live state: progress counts per objective, plus the pin flag. */
export interface QuestProgress {
  id: string;
  /** Progress toward each objective's `count` (parallel to def.objectives). */
  counts: number[];
  /** Pinned quests show on the tracker HUD (max MAX_PINNED). */
  pinned: boolean;
}

export interface QuestLogState {
  active: QuestProgress[];
  /** Ids of quests already turned in (prereq + availability gating). */
  turnedIn: string[];
}

export const MAX_ACTIVE = 25; // GDD §8 quest-log cap
export const MAX_PINNED = 5; // GDD §8 tracker cap

export function createQuestLog(): QuestLogState {
  return { active: [], turnedIn: [] };
}

/** World events that advance objectives. */
export type QuestEvent =
  | { kind: 'kill'; enemyId: string }
  | { kind: 'boss'; enemyId: string }
  | { kind: 'collect'; tag: string; n?: number }
  | { kind: 'gather'; tag: string; n?: number }
  | { kind: 'talk'; npcId: string }
  | { kind: 'deliver'; npcId: string }
  | { kind: 'use'; objectId: string }
  | { kind: 'explore'; x: number; z: number };

export interface QuestNotice {
  questId: string;
  type: 'progress' | 'objectiveComplete' | 'questComplete';
  text: string;
}

const objCount = (o: Objective): number => Math.max(1, o.count ?? 1);

export function progressOf(log: QuestLogState, id: string): QuestProgress | undefined {
  return log.active.find((p) => p.id === id);
}

export function isObjectiveDone(o: Objective, count: number): boolean {
  return count >= objCount(o);
}

export function isQuestComplete(def: QuestDef, prog: QuestProgress): boolean {
  return def.objectives.every((o, i) => isObjectiveDone(o, prog.counts[i] ?? 0));
}

/** Whether `def` can be accepted now: not active/done, prereqs met, level ok. */
export function isAvailable(def: QuestDef, log: QuestLogState, level: number): boolean {
  if (progressOf(log, def.id)) return false;
  if (!def.repeatable && log.turnedIn.includes(def.id)) return false;
  if (level < def.minLevel) return false;
  for (const pre of def.prereq ?? []) if (!log.turnedIn.includes(pre)) return false;
  return true;
}

/** Quests a giver NPC can currently offer (the "!" list). */
export function availableFrom(npcId: string, log: QuestLogState, level: number): QuestDef[] {
  return questsByGiver(npcId).filter((def) => isAvailable(def, log, level));
}

/** Active quests ready to hand in at this NPC (the "?" list). */
export function readyToTurnIn(npcId: string, log: QuestLogState): QuestDef[] {
  const out: QuestDef[] = [];
  for (const prog of log.active) {
    const def = questById(prog.id);
    if (!def) continue;
    const turnNpc = def.turnIn ?? def.giver;
    if (turnNpc === npcId && isQuestComplete(def, prog)) out.push(def);
  }
  return out;
}

/** Active quests in progress (not yet complete) tied to this NPC (grey "?"). */
export function inProgressAt(npcId: string, log: QuestLogState): QuestDef[] {
  const out: QuestDef[] = [];
  for (const prog of log.active) {
    const def = questById(prog.id);
    if (!def) continue;
    const turnNpc = def.turnIn ?? def.giver;
    if ((def.giver === npcId || turnNpc === npcId) && !isQuestComplete(def, prog)) out.push(def);
  }
  return out;
}

/** Accept a quest into the log. Returns false if invalid or the log is full. */
export function acceptQuest(log: QuestLogState, id: string, level: number): boolean {
  const def = questById(id);
  if (!def || !isAvailable(def, log, level)) return false;
  if (log.active.length >= MAX_ACTIVE) return false;
  log.active.push({
    id,
    counts: def.objectives.map(() => 0),
    pinned: log.active.filter((p) => p.pinned).length < MAX_PINNED,
  });
  return true;
}

/** Abandon an active quest (drops progress; repeatable/prereq unaffected). */
export function abandonQuest(log: QuestLogState, id: string): void {
  log.active = log.active.filter((p) => p.id !== id);
}

/** Pin/unpin for the tracker (respects MAX_PINNED). */
export function setPinned(log: QuestLogState, id: string, pinned: boolean): void {
  const prog = progressOf(log, id);
  if (!prog) return;
  if (pinned && log.active.filter((p) => p.pinned).length >= MAX_PINNED) return;
  prog.pinned = pinned;
}

function matches(o: Objective, ev: QuestEvent): boolean {
  switch (ev.kind) {
    case 'kill':
      return o.kind === 'kill' && o.target === ev.enemyId;
    case 'boss':
      return (o.kind === 'boss' || o.kind === 'kill') && o.target === ev.enemyId;
    case 'collect':
      return o.kind === 'collect' && o.target === ev.tag;
    case 'gather':
      return o.kind === 'gather' && o.target === ev.tag;
    case 'talk':
      return o.kind === 'talk' && o.target === ev.npcId;
    case 'deliver':
      return o.kind === 'deliver' && o.target === ev.npcId;
    case 'use':
      return o.kind === 'use' && o.target === ev.objectId;
    case 'explore':
      if (o.kind !== 'explore' || o.x === undefined || o.z === undefined) return false;
      return Math.hypot(o.x - ev.x, o.z - ev.z) <= (o.radius ?? 8);
  }
}

/**
 * Advance every active quest's matching objectives for one world event. Returns
 * notices (objective/quest completion) for UI toasts. Idempotent per event — an
 * already-complete objective/quest doesn't fire again.
 */
export function applyQuestEvent(log: QuestLogState, ev: QuestEvent): QuestNotice[] {
  const notices: QuestNotice[] = [];
  const inc = ev.kind === 'collect' || ev.kind === 'gather' ? Math.max(1, ev.n ?? 1) : 1;

  for (const prog of log.active) {
    const def = questById(prog.id);
    if (!def) continue;
    const wasComplete = isQuestComplete(def, prog);
    if (wasComplete) continue;

    let changed = false;
    def.objectives.forEach((o, i) => {
      if (!matches(o, ev)) return;
      const before = prog.counts[i] ?? 0;
      if (isObjectiveDone(o, before)) return;
      const after = Math.min(objCount(o), before + inc);
      prog.counts[i] = after;
      changed = true;
      if (isObjectiveDone(o, after)) {
        notices.push({ questId: def.id, type: 'objectiveComplete', text: o.label });
      } else {
        notices.push({
          questId: def.id,
          type: 'progress',
          text: `${o.label} (${after}/${objCount(o)})`,
        });
      }
    });

    if (changed && isQuestComplete(def, prog)) {
      notices.push({ questId: def.id, type: 'questComplete', text: def.name });
    }
  }
  return notices;
}

/**
 * Turn in a completed quest: move it to `turnedIn` and return its reward for the
 * caller to grant (xp/gold/items). Returns null if the quest isn't complete.
 * Repeatable quests are removed from active but not added to `turnedIn`.
 */
export function turnInQuest(log: QuestLogState, id: string): QuestReward | null {
  const prog = progressOf(log, id);
  const def = questById(id);
  if (!prog || !def || !isQuestComplete(def, prog)) return null;
  log.active = log.active.filter((p) => p.id !== id);
  if (!def.repeatable && !log.turnedIn.includes(id)) log.turnedIn.push(id);
  return def.reward;
}

// Giver index (built once from the content module).
let byGiver: Map<string, QuestDef[]> | null = null;
function questsByGiver(npcId: string): QuestDef[] {
  if (!byGiver) {
    byGiver = new Map();
    for (const def of QUESTS) {
      const list = byGiver.get(def.giver) ?? [];
      list.push(def);
      byGiver.set(def.giver, list);
    }
  }
  return byGiver.get(npcId) ?? [];
}
