// Client quest orchestrator: owns the player's quest log (the shared, pure state
// machine from shared/quests), feeds it world events (kills, exploration, talks,
// Waystone use), grants rewards through the CombatDirector, and publishes the quest
// UI slices (log, tracker, giver dialogue, toasts). Input → engine → events out;
// all quest rules live in shared/ and move server-side in Phase 6.

import {
  createQuestLog,
  scaledQuestXp,
  availableFrom,
  readyToTurnIn,
  inProgressAt,
  isQuestComplete,
  questById,
  QUEST_GIVERS,
  settlementById,
  type ClientQuestAction,
  type QuestEvent,
  type QuestLogState,
  type QuestDef,
  type QuestReward,
  type GeneratedItemSpec,
  type ServerQuestLog,
} from '@pathlands/shared';
import type { CombatDirector } from './combatDirector.js';
import { useStore, type QuestEntryUi, type QuestDialogUi, type QuestMarker } from './store.js';
import { audio } from '../platform/audio.js';

/** How the QuestDirector reaches the network (quest migration #138, Stage 2). Wired by the game. */
export interface QuestNetSink {
  /** Take the latest authoritative quest-log frame (the sole writer of the local mirror), or null. */
  drainQuestLog(): ServerQuestLog | null;
  /** Send a server-validated quest action; the change returns on the next quest-log frame. */
  sendQuestAction(action: ClientQuestAction['action'], id: string, choiceIndex?: number): void;
  /** Report a client-observed objective event (explore / talk / deliver / use / gather). */
  sendQuestEvent(ev: QuestEvent): void;
}

/** World position of each quest-giver = its settlement plaza centre + its offset. */
const GIVER_POS: Record<string, { x: number; z: number }> = {};
for (const g of QUEST_GIVERS) {
  const s = settlementById(g.settlement);
  if (s) GIVER_POS[g.id] = { x: s.cx + g.dx, z: s.cz + g.dz };
}

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
  // Show the effective (§5-scaled) XP the player will actually receive.
  const parts = [`+${scaledQuestXp(r.xp)} XP`];
  if (r.gold) parts.push(`+${r.gold}c`);
  for (const it of r.items ?? []) parts.push(specLabel(it));
  if (r.choices?.length) parts.push(`1 of ${r.choices.length}`);
  if (r.waystoneUnlock) parts.push('Waystone');
  return parts.join(' · ');
}

export class QuestDirector {
  /**
   * The player's quest log — a **mirror** of the server's authoritative log now (quest migration
   * #138, Stage 2). Written ONLY by `applyServerQuestLog`; every action (accept / turn-in / …) and
   * client-observed objective event goes to the server as an intent, and the change comes back on the
   * next quest-log frame. The UI read-side (log / tracker / giver dialogue / markers) is unchanged.
   */
  private log: QuestLogState;
  private readonly combat: CombatDirector;
  private netSink: QuestNetSink | null = null;
  /** False until the first authoritative frame lands, so the login baseline fires no toasts. */
  private seeded = false;
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
    this.log = log ?? createQuestLog(); // an initial mirror from the local cache; the server frame wins
    this.publish();
  }

  setNetSink(sink: QuestNetSink): void {
    this.netSink = sink;
  }

  /** A Waystone was used — report a `use` objective event to the server engine. */
  handleWaystoneUse(id: string): void {
    this.netSink?.sendQuestEvent({ kind: 'use', objectId: id });
  }

  /** The current quest log for the character autosave. */
  get state(): QuestLogState {
    return this.log;
  }

  private get level(): number {
    return this.combat.characterLevel;
  }

  // --- event feed → server engine -------------------------------------------

  /**
   * Apply the authoritative quest log the server just sent — the SOLE writer of the local mirror.
   * Diffs the previous log to surface progress/complete toasts and fire the client-only turn-in side
   * effects (Waystone unlock + Deed progress), then republishes the UI + refreshes an open dialogue.
   * Kill / boss / collect objectives advance here (the server drives them from authoritative kill
   * credit); explore / talk / use / gather are reported as intents from the methods below.
   */
  applyServerQuestLog(): void {
    const frame = this.netSink?.drainQuestLog();
    if (frame === undefined || frame === null) return;
    const next: QuestLogState = {
      active: frame.active.map((p) => ({ id: p.id, counts: [...p.counts], pinned: p.pinned })),
      turnedIn: [...frame.turnedIn],
    };
    if (this.seeded) this.diffNotices(this.log, next); // skip the login baseline (no spurious toasts)
    this.log = next;
    this.seeded = true;
    this.publish();
    const dlg = useStore.getState().questDialog;
    if (dlg) this.reopenGiver(dlg.giverId); // refresh an open dialogue against the new log
  }

  /** Called each frame with the player position (throttled) — report an explore event to the server. */
  tickExplore(dt: number, px: number, pz: number): void {
    this.exploreTimer += dt;
    if (this.exploreTimer < 0.25) return;
    this.exploreTimer = 0;
    if (Math.hypot(px - this.lastEx, pz - this.lastEz) < 1.5) return;
    this.lastEx = px;
    this.lastEz = pz;
    this.netSink?.sendQuestEvent({ kind: 'explore', x: px, z: pz });
  }

  /** Surface toasts + client-only turn-in side effects by diffing the previous → next mirror. */
  private diffNotices(prev: QuestLogState, next: QuestLogState): void {
    const prevActive = new Map(prev.active.map((p) => [p.id, p]));
    const prevTurned = new Set(prev.turnedIn);
    for (const p of next.active) {
      const def = questById(p.id);
      if (!def) continue;
      const before = prevActive.get(p.id);
      if (!before) {
        this.toast(`Quest accepted: ${def.name}`, 'accept');
        continue;
      }
      def.objectives.forEach((o, i) => {
        const need = Math.max(1, o.count ?? 1);
        if ((p.counts[i] ?? 0) >= need && (before.counts[i] ?? 0) < need) {
          this.toast(`Objective: ${o.label}`, 'progress');
        }
      });
      if (isQuestComplete(def, p) && !isQuestComplete(def, before)) {
        this.toast(`Quest complete: ${def.name}`, 'complete');
        audio.sfx('quest');
      }
    }
    // Newly turned-in quests → the Waystone unlock + Deed progress the server doesn't own (the gold /
    // items / XP were granted server-side and arrive via the inventory + combat-self frames).
    for (const id of next.turnedIn) {
      if (prevTurned.has(id)) continue;
      const def = questById(id);
      if (!def) continue;
      this.combat.applyQuestRewardCosmetic(def.reward);
      this.onQuestTurnedIn?.();
      this.toast(`Turned in: ${def.name}`, 'complete');
    }
  }

  // --- giver interaction -----------------------------------------------------

  /** Open a quest giver's dialogue (offers + ready turn-ins). Also fires a talk event. */
  openGiver(giverId: string, giverName: string): void {
    // Talking to a giver can itself satisfy a `talk` objective (reported to the server engine).
    this.netSink?.sendQuestEvent({ kind: 'talk', npcId: giverId });

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

  // The action methods are intent-senders now (quest migration #138, Stage 2): the server validates
  // + applies against its authoritative log and the change returns on the next quest-log frame, which
  // `applyServerQuestLog` mirrors + toasts. No local mutation, so the UI can't diverge from the server.

  accept(id: string): void {
    this.netSink?.sendQuestAction('accept', id);
  }

  turnIn(id: string, choiceIndex: number): void {
    // The reward (gold / items / XP) is computed + granted server-side; the Waystone unlock + Deed
    // progress fire from `diffNotices` when the quest lands in `turnedIn` on the next frame.
    this.netSink?.sendQuestAction('turnIn', id, choiceIndex);
  }

  abandon(id: string): void {
    this.netSink?.sendQuestAction('abandon', id);
  }

  pin(id: string, pinned: boolean): void {
    this.netSink?.sendQuestAction(pinned ? 'pin' : 'unpin', id);
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
    this.refreshMarkers();
  }

  /** Build the world-map / minimap quest markers from indicators + active objectives. */
  private refreshMarkers(): void {
    const markers: QuestMarker[] = [];
    for (const [giverId, kind] of Object.entries(this.indicators)) {
      const pos = GIVER_POS[giverId];
      if (pos) markers.push({ x: pos.x, z: pos.z, kind });
    }
    // Active, uncompleted explore objectives get a marker at the area to reach.
    for (const p of this.log.active) {
      const def = questById(p.id);
      if (!def) continue;
      def.objectives.forEach((o, i) => {
        const done = (p.counts[i] ?? 0) >= Math.max(1, o.count ?? 1);
        if (o.kind === 'explore' && !done && typeof o.x === 'number' && typeof o.z === 'number') {
          markers.push({ x: o.x, z: o.z, kind: 'objective', label: o.label });
        }
      });
    }
    useStore.getState().setQuestMarkers(markers);
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
