// Client daily-bounty orchestrator (GDD §11): posts each hub town's daily board
// (a deterministic slice of shared/data/bounties, seeded by the world seed + a day
// index taken at bootstrap), tracks accepted bounties against kill/gather events,
// and pays out gold + XP + Deed progress on turn-in. All bounty *rules* are shared
// data; this is the input → engine → reward edge (server-side in Phase 6).

import {
  BOUNTY_HUBS,
  SETTLEMENTS,
  bountyById,
  dailyBountyIds,
  enemyById,
  type BountyDef,
  type BountyLogSave,
} from '@pathlands/shared';
import type { CombatDirector } from './combatDirector.js';
import type { MetaDirector } from './metaDirector.js';
import { useStore, type BountyUi } from './store.js';

export class BountyDirector {
  private readonly combat: CombatDirector;
  private readonly meta: MetaDirector;
  private readonly worldSeed: number;
  private readonly dayIndex: number;
  private readonly active = new Map<string, number>();
  private readonly completed = new Set<string>();
  private currentHub: string;
  private toastSeq = 1;

  constructor(
    combat: CombatDirector,
    meta: MetaDirector,
    worldSeed: number,
    dayIndex: number,
    saved?: BountyLogSave,
  ) {
    this.combat = combat;
    this.meta = meta;
    this.worldSeed = worldSeed;
    this.dayIndex = dayIndex;
    // A stored log from an earlier day is stale — the board resets each day.
    if (saved && saved.day === dayIndex) {
      for (const a of saved.active)
        if (bountyById(a.id)) this.active.set(a.id, Math.max(0, a.count));
      for (const id of saved.completed) if (bountyById(id)) this.completed.add(id);
    }
    this.currentHub = BOUNTY_HUBS[0]!;
    this.publish();
  }

  /** Bounty log for the character autosave. */
  get state(): BountyLogSave {
    return {
      day: this.dayIndex,
      active: [...this.active].map(([id, count]) => ({ id, count })),
      completed: [...this.completed],
    };
  }

  // --- board access ----------------------------------------------------------

  /** Open/close the board, refreshing to the hub nearest the player when opening. */
  toggle(px: number, pz: number): void {
    const opening = !useStore.getState().showBounties;
    if (opening) {
      this.currentHub = this.nearestHub(px, pz);
      this.publish();
    }
    useStore.getState().toggleBounties();
  }

  private nearestHub(px: number, pz: number): string {
    let best = BOUNTY_HUBS[0]!;
    let bestD = Infinity;
    for (const s of SETTLEMENTS) {
      if (!BOUNTY_HUBS.includes(s.id)) continue;
      const d = (s.cx - px) * (s.cx - px) + (s.cz - pz) * (s.cz - pz);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  private todaysIds(hub: string): string[] {
    return dailyBountyIds(this.worldSeed, this.dayIndex, hub);
  }

  // --- player actions --------------------------------------------------------

  accept(id: string): void {
    const bounty = bountyById(id);
    if (!bounty || this.active.has(id) || this.completed.has(id)) return;
    // Only bounties actually posted today (at their hub) can be accepted.
    if (!this.todaysIds(bounty.hub).includes(id)) return;
    this.active.set(id, 0);
    this.toast(`Bounty accepted: ${bounty.title}`);
    this.publish();
  }

  turnIn(id: string): void {
    const bounty = bountyById(id);
    const count = this.active.get(id);
    if (!bounty || count === undefined || count < bounty.count) return;
    this.combat.grantReward({ xp: bounty.xp, gold: bounty.gold }, 0);
    this.active.delete(id);
    this.completed.add(id);
    this.meta.handleBounty();
    this.toast(`Bounty complete: ${bounty.title} (+${bounty.gold}g)`);
    this.publish();
  }

  // --- progress feed ---------------------------------------------------------

  onKill(enemyId: string): void {
    const fam = enemyById(enemyId)?.family;
    let changed = false;
    for (const [id, count] of this.active) {
      const b = bountyById(id);
      if (!b || b.kind !== 'kill' || count >= b.count) continue;
      const hit = b.targetIsFamily ? fam === b.target : enemyId === b.target;
      if (hit) {
        this.active.set(id, count + 1);
        changed = true;
      }
    }
    if (changed) this.publish();
  }

  onGather(materialId: string, qty: number): void {
    let changed = false;
    for (const [id, count] of this.active) {
      const b = bountyById(id);
      if (!b || b.kind !== 'gather' || count >= b.count) continue;
      if (b.target === materialId) {
        this.active.set(id, Math.min(b.count, count + qty));
        changed = true;
      }
    }
    if (changed) this.publish();
  }

  // --- publishing ------------------------------------------------------------

  private entry(b: BountyDef): BountyUi['board'][number] {
    const count = this.active.get(b.id);
    const done = this.completed.has(b.id);
    const state = done
      ? 'done'
      : count === undefined
        ? 'available'
        : count >= b.count
          ? 'ready'
          : 'active';
    return {
      id: b.id,
      title: b.title,
      kind: b.kind,
      progress: count ?? 0,
      count: b.count,
      gold: b.gold,
      xp: b.xp,
      state,
    };
  }

  private publish(): void {
    const hubName = SETTLEMENTS.find((s) => s.id === this.currentHub)?.name ?? this.currentHub;
    // The board shows today's posted bounties for the current hub, plus any active
    // bounties accepted elsewhere so they can always be turned in.
    const ids = new Set<string>(this.todaysIds(this.currentHub));
    for (const id of this.active.keys()) ids.add(id);
    const board = [...ids]
      .map((id) => bountyById(id))
      .filter((b): b is BountyDef => !!b)
      .map((b) => this.entry(b));
    const ui: BountyUi = {
      hub: hubName,
      day: this.dayIndex,
      board,
      activeCount: this.active.size,
    };
    useStore.getState().setBounties(ui);
  }

  private toast(text: string): void {
    const store = useStore.getState();
    store.setQuestToasts(
      [...store.questToasts, { id: -4000 - this.toastSeq++, text, kind: 'accept' as const }].slice(
        -4,
      ),
    );
  }
}
