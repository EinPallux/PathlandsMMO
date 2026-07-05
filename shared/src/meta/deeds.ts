// Deed tracking + perk purchasing (GDD §10). Pure: the client feeds progress events
// (kills, bosses, Waystones, quests, crafts, skill milestones); completed deeds award
// account Path Points, which buy perks. Runs client-side now, server-side in Phase 6.

import { DEEDS } from '../data/deeds.js';
import { perkById, canBuyPerk } from '../data/perks.js';

export interface DeedState {
  /** Progress per deed id. */
  progress: Record<string, number>;
  /** Completed deed ids. */
  completed: string[];
}

export function createDeedState(): DeedState {
  return { progress: {}, completed: [] };
}

export interface DeedNotice {
  deedId: string;
  name: string;
  pathPoints: number;
}

/**
 * Advance every deed tracking `metric` by `amount` (default 1). Returns the deeds
 * that just completed (for a toast + Path-Point award). Idempotent per completion.
 */
export function applyDeedProgress(state: DeedState, metric: string, amount = 1): DeedNotice[] {
  const notices: DeedNotice[] = [];
  for (const d of DEEDS) {
    if (d.metric !== metric || state.completed.includes(d.id)) continue;
    const next = Math.min(d.threshold, (state.progress[d.id] ?? 0) + amount);
    state.progress[d.id] = next;
    if (next >= d.threshold) {
      state.completed.push(d.id);
      notices.push({ deedId: d.id, name: d.name, pathPoints: d.pathPoints });
    }
  }
  return notices;
}

export function deedProgress(state: DeedState, id: string): number {
  return state.progress[id] ?? 0;
}

export function isDeedComplete(state: DeedState, id: string): boolean {
  return state.completed.includes(id);
}

/** Total Path Points a deed state has ever earned (sum of completed deeds). */
export function earnedPathPoints(state: DeedState): number {
  let n = 0;
  for (const id of state.completed) {
    const d = DEEDS.find((x) => x.id === id);
    if (d) n += d.pathPoints;
  }
  return n;
}

export interface PurchaseResult {
  perks: Record<string, number>;
  pathPoints: number;
}

/**
 * Buy one rank of a perk. Returns the new perks map + remaining Path Points, or null
 * if unaffordable / maxed. Pure (does not mutate the inputs).
 */
export function buyPerk(
  perks: Record<string, number>,
  pathPoints: number,
  perkId: string,
): PurchaseResult | null {
  const perk = perkById(perkId);
  if (!perk) return null;
  const rank = perks[perkId] ?? 0;
  if (!canBuyPerk(perk, rank, pathPoints)) return null;
  return { perks: { ...perks, [perkId]: rank + 1 }, pathPoints: pathPoints - perk.cost };
}
