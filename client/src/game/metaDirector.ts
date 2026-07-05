// Client meta-progression orchestrator (GDD §10): tracks Deeds from world events
// (kills, bosses, Waystones, quests, crafts, gathering milestones), awards Path
// Points, buys perks, and applies their effects (bag slots, travel-fee cut). All
// deed/perk rules live in shared/meta; this is the input → engine → events edge.

import {
  createDeedState,
  applyDeedProgress,
  buyPerk as buyPerkEngine,
  perkMagnitude,
  perkById,
  enemyById,
  EnemyRank,
  DEEDS,
  PERKS,
  type DeedState,
  type DeedNotice,
} from '@pathlands/shared';
import type { CombatDirector } from './combatDirector.js';
import { useStore } from './store.js';

export class MetaDirector {
  private readonly combat: CombatDirector;
  private deeds: DeedState;
  private pathPoints: number;
  private perks: Record<string, number>;
  private toastSeq = 1;

  /** Fired once per newly-completed Deed (e.g. to grant a mount skin). */
  onDeedComplete?: (deedId: string) => void;

  constructor(
    combat: CombatDirector,
    deeds?: DeedState,
    pathPoints?: number,
    perks?: Record<string, number>,
  ) {
    this.combat = combat;
    this.deeds = deeds
      ? { progress: { ...deeds.progress }, completed: [...deeds.completed] }
      : createDeedState();
    this.pathPoints = Math.max(0, pathPoints ?? 0);
    this.perks = perks ? { ...perks } : {};
    this.applyPerks();
    this.publish();
  }

  /** Meta progression for the character autosave. */
  get state(): { deeds: DeedState; pathPoints: number; perks: Record<string, number> } {
    return {
      deeds: { progress: { ...this.deeds.progress }, completed: [...this.deeds.completed] },
      pathPoints: this.pathPoints,
      perks: { ...this.perks },
    };
  }

  // --- event feed ------------------------------------------------------------

  handleKill(enemyId: string): void {
    const notices = applyDeedProgress(this.deeds, 'kill');
    if (enemyById(enemyId)?.rank === EnemyRank.Boss) {
      notices.push(...applyDeedProgress(this.deeds, 'boss'));
    }
    this.award(notices);
  }

  handleWaystone(): void {
    this.award(applyDeedProgress(this.deeds, 'waystone'));
  }

  handleQuest(): void {
    this.award(applyDeedProgress(this.deeds, 'quest'));
  }

  handleCraft(): void {
    this.award(applyDeedProgress(this.deeds, 'craft'));
  }

  handleGatherSkill(skill: number): void {
    if (skill >= 25) this.award(applyDeedProgress(this.deeds, 'gatherSkill25'));
  }

  // --- perks -----------------------------------------------------------------

  buyPerk(id: string): void {
    const res = buyPerkEngine(this.perks, this.pathPoints, id);
    if (!res) return;
    this.perks = res.perks;
    this.pathPoints = res.pathPoints;
    this.applyPerks();
    const p = perkById(id);
    if (p) this.toast(`Learned ${p.name} (rank ${this.perks[id]})`);
    this.publish();
  }

  private applyPerks(): void {
    this.combat.setPerks(
      perkMagnitude(this.perks, 'bagSlots'),
      perkMagnitude(this.perks, 'travelFee'),
    );
  }

  /** Trailblazer's out-of-combat movement bonus (0 = none), applied by the game. */
  get outOfCombatSpeedBonus(): number {
    return perkMagnitude(this.perks, 'moveSpeed');
  }

  // --- publishing ------------------------------------------------------------

  private award(notices: DeedNotice[]): void {
    if (notices.length === 0) return;
    for (const n of notices) {
      this.pathPoints += n.pathPoints;
      this.toast(
        `Deed earned: ${n.name} (+${n.pathPoints} Path Point${n.pathPoints > 1 ? 's' : ''})`,
      );
      this.onDeedComplete?.(n.deedId);
    }
    this.publish();
  }

  private toast(text: string): void {
    const store = useStore.getState();
    store.setQuestToasts(
      [
        ...store.questToasts,
        { id: -2000 - this.toastSeq++, text, kind: 'complete' as const },
      ].slice(-4),
    );
  }

  private publish(): void {
    const deeds = DEEDS.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      category: d.category,
      progress: this.deeds.progress[d.id] ?? 0,
      threshold: d.threshold,
      complete: this.deeds.completed.includes(d.id),
      pathPoints: d.pathPoints,
    }));
    const perks = PERKS.map((p) => {
      const rank = this.perks[p.id] ?? 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        rank,
        maxRank: p.maxRank,
        cost: p.cost,
        canBuy: rank < p.maxRank && this.pathPoints >= p.cost,
      };
    });
    useStore.getState().setJournal({ pathPoints: this.pathPoints, deeds, perks });
  }
}
