// Client quest orchestrator: owns the player's quest log (the shared, pure state
// machine from shared/quests), feeds it world events (kills, exploration, talks,
// Waystone use), grants rewards through the CombatDirector, and publishes the quest
// UI slices (log, tracker, giver dialogue, toasts). Input → engine → events out;
// all quest rules live in shared/ and move server-side in Phase 6.

import {
  createQuestLog,
  applyQuestEvent,
  availableFrom,
  readyToTurnIn,
  inProgressAt,
  acceptQuest,
  turnInQuest,
  abandonQuest,
  setPinned,
  isQuestComplete,
  questById,
  QUEST_DROP_TAGS,
  QUEST_GIVERS,
  type QuestLogState,
  type QuestDef,
  type QuestReward,
  type GeneratedItemSpec,
} from '@pathlands/shared';
import type { CombatDirector } from './combatDirector.js';
import { useStore, type QuestEntryUi, type QuestDialogUi } from './store.js';

const SLOT_LABEL: Record<string, string> = {
  mainHand: 'Weapon',
  offHand: 'Off-hand',
  head: 'Helm',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Boots',
  hands: 'Gloves',
  amulet: 'Amulet',
  ring1: 'Ring',
  ring2: 'Ring',
  trinket: 'Trinket',
};
const specLabel = (s: GeneratedItemSpec): string =>
  `${s.rarity[0]!.toUpperCase()}${s.rarity.slice(1)} ${SLOT_LABEL[s.slot] ?? s.slot}`;

function rewardSummary(r: QuestReward): string {
  const parts = [`+${r.xp} XP`];
  if (r.gold) parts.push(`+${r.gold}c`);
  for (const it of r.items ?? []) parts.push(specLabel(it));
  if (r.choices?.length) parts.push(`1 of ${r.choices.length}`);
  if (r.waystoneUnlock) parts.push('Waystone');
  return parts.join(' · ');
}

export class QuestDirector {
  private log: QuestLogState;
  private readonly combat: CombatDirector;
  private toastId = 1;
  private exploreTimer = 0;
  private lastEx = 0;
  private lastEz = 0;
  /** Giver id → indicator, read by the EntityManager for the "!/?" markers. */
  readonly indicators: Record<string, 'available' | 'turnin' | 'progress'> = {};

  /** Set by the game: notified when a quest is turned in (for Deed progress). */
  onQuestTurnedIn?: () => void;

  constructor(combat: CombatDirector, log?: QuestLogState) {
    this.combat = combat;
    this.log = log ?? createQuestLog();
    this.publish();
  }

  /** A Waystone was used — advance any `use` objectives. */
  handleWaystoneUse(id: string): void {
    this.emit({ kind: 'use', objectId: id });
  }

  /** The current quest log for the character autosave. */
  get state(): QuestLogState {
    return this.log;
  }

  private get level(): number {
    return this.combat.characterLevel;
  }

  // --- event feed ------------------------------------------------------------

  /** An enemy was slain — advance kill/boss/collect objectives. */
  onKill(enemyId: string): void {
    this.emit({ kind: 'kill', enemyId });
    this.emit({ kind: 'boss', enemyId });
    const tag = QUEST_DROP_TAGS[enemyId];
    if (tag) this.emit({ kind: 'collect', tag, n: 1 });
  }

  /** Called each frame with the player position (throttled explore checks). */
  tickExplore(dt: number, px: number, pz: number): void {
    this.exploreTimer += dt;
    if (this.exploreTimer < 0.25) return;
    this.exploreTimer = 0;
    if (Math.hypot(px - this.lastEx, pz - this.lastEz) < 1.5) return;
    this.lastEx = px;
    this.lastEz = pz;
    this.emit({ kind: 'explore', x: px, z: pz });
  }

  private emit(ev: Parameters<typeof applyQuestEvent>[1]): void {
    const notices = applyQuestEvent(this.log, ev);
    const changed = notices.length > 0;
    for (const n of notices) {
      if (n.type === 'objectiveComplete') this.toast(`Objective: ${n.text}`, 'progress');
      else if (n.type === 'questComplete') this.toast(`Quest complete: ${n.text}`, 'complete');
    }
    if (changed) this.publish();
  }

  // --- giver interaction -----------------------------------------------------

  /** Open a quest giver's dialogue (offers + ready turn-ins). Also fires a talk event. */
  openGiver(giverId: string, giverName: string): void {
    // Talking to a giver can itself satisfy a `talk` objective.
    this.emit({ kind: 'talk', npcId: giverId });

    const offers = availableFrom(giverId, this.log, this.level).map((q) => ({
      id: q.id,
      name: q.name,
      intro: q.intro,
      chapter: q.chapter ?? null,
      reward: rewardSummary(q.reward),
    }));
    const turnIns = readyToTurnIn(giverId, this.log).map((q) => this.turnInUi(q));
    const active = inProgressAt(giverId, this.log).map((q) => q.name);
    const dialog: QuestDialogUi = { giver: giverName, giverId, offers, turnIns, active };
    useStore.getState().setQuestDialog(dialog);
  }

  private turnInUi(q: QuestDef): QuestDialogUi['turnIns'][number] {
    return {
      id: q.id,
      name: q.name,
      complete: q.complete,
      reward: rewardSummary(q.reward),
      choices: (q.reward.choices ?? []).map(specLabel),
    };
  }

  accept(id: string): void {
    const def = questById(id);
    if (!def) return;
    if (acceptQuest(this.log, id, this.level)) {
      this.toast(`Quest accepted: ${def.name}`, 'accept');
      this.reopenGiver(def.giver);
      this.publish();
    }
  }

  turnIn(id: string, choiceIndex: number): void {
    const def = questById(id);
    const reward = turnInQuest(this.log, id);
    if (!reward || !def) return;
    this.combat.grantReward(reward, choiceIndex);
    this.onQuestTurnedIn?.(); // Deed progress
    this.toast(`Quest complete: ${def.name}`, 'complete');
    this.reopenGiver(def.turnIn ?? def.giver);
    this.publish();
  }

  abandon(id: string): void {
    abandonQuest(this.log, id);
    this.publish();
  }

  pin(id: string, pinned: boolean): void {
    setPinned(this.log, id, pinned);
    this.publish();
  }

  closeDialog(): void {
    useStore.getState().setQuestDialog(null);
  }

  /** Refresh an open giver dialogue in place (after accept/turn-in). */
  private reopenGiver(giverId: string): void {
    const dlg = useStore.getState().questDialog;
    if (dlg && dlg.giverId === giverId) {
      const name = dlg.giver;
      // Rebuild without re-firing the talk event.
      const offers = availableFrom(giverId, this.log, this.level).map((q) => ({
        id: q.id,
        name: q.name,
        intro: q.intro,
        chapter: q.chapter ?? null,
        reward: rewardSummary(q.reward),
      }));
      const turnIns = readyToTurnIn(giverId, this.log).map((q) => this.turnInUi(q));
      const active = inProgressAt(giverId, this.log).map((q) => q.name);
      if (offers.length === 0 && turnIns.length === 0 && active.length === 0) {
        useStore.getState().setQuestDialog(null);
      } else {
        useStore.getState().setQuestDialog({ giver: name, giverId, offers, turnIns, active });
      }
    }
  }

  // --- publishing ------------------------------------------------------------

  private toast(text: string, kind: 'accept' | 'progress' | 'complete'): void {
    const store = useStore.getState();
    const next = [...store.questToasts, { id: this.toastId++, text, kind }].slice(-4);
    store.setQuestToasts(next);
  }

  private entryUi(id: string): QuestEntryUi | null {
    const def = questById(id);
    const prog = this.log.active.find((p) => p.id === id);
    if (!def || !prog) return null;
    return {
      id: def.id,
      name: def.name,
      chapter: def.chapter ?? null,
      pinned: prog.pinned,
      complete: isQuestComplete(def, prog),
      objectives: def.objectives.map((o, i) => ({
        label: o.label,
        count: prog.counts[i] ?? 0,
        need: Math.max(1, o.count ?? 1),
        done: (prog.counts[i] ?? 0) >= Math.max(1, o.count ?? 1),
      })),
    };
  }

  private publish(): void {
    const entries = this.log.active
      .map((p) => this.entryUi(p.id))
      .filter((e): e is QuestEntryUi => e !== null);
    useStore.getState().setQuestLog(entries);
    useStore.getState().setQuestTracker(entries.filter((e) => e.pinned));
    this.refreshIndicators();
  }

  /** Recompute per-giver "!/?" indicators for the world nameplates. */
  private refreshIndicators(): void {
    for (const k of Object.keys(this.indicators)) delete this.indicators[k];
    const givers = new Set<string>();
    for (const p of this.log.active) {
      const def = questById(p.id);
      if (def) {
        givers.add(def.giver);
        if (def.turnIn) givers.add(def.turnIn);
      }
    }
    // Consider every known giver (turn-in > available > in-progress priority).
    for (const g of QUEST_GIVER_IDS) {
      if (readyToTurnIn(g, this.log).length > 0) this.indicators[g] = 'turnin';
      else if (availableFrom(g, this.log, this.level).length > 0) this.indicators[g] = 'available';
      else if (inProgressAt(g, this.log).length > 0) this.indicators[g] = 'progress';
    }
    void givers;
  }
}

const QUEST_GIVER_IDS = QUEST_GIVERS.map((g) => g.id);
