// Path perks (GDD §10): account-wide upgrades bought with Path Points at any
// Waystone. Pure data + purchase helpers. Effects are applied by the client (bag
// slots, travel-fee reduction; others are defined here and wired as their systems land).

export type PerkEffectKind = 'bagSlots' | 'travelFee' | 'moveSpeed' | 'restedCap';

export interface PerkDef {
  id: string;
  name: string;
  description: string;
  /** Max ranks purchasable. */
  maxRank: number;
  /** Path Points per rank. */
  cost: number;
  effect: { kind: PerkEffectKind; perRank: number };
}

export const PERKS: readonly PerkDef[] = [
  {
    id: 'deepPockets',
    name: 'Deep Pockets',
    description: '+2 bag slots per rank.',
    maxRank: 4,
    cost: 1,
    effect: { kind: 'bagSlots', perRank: 2 },
  },
  {
    id: 'waywise',
    name: 'Waywise',
    description: '−15% Waystone travel fees per rank.',
    maxRank: 2,
    cost: 2,
    effect: { kind: 'travelFee', perRank: 0.15 },
  },
  {
    id: 'trailblazer',
    name: 'Trailblazer',
    description: '+5% out-of-combat movement speed.',
    maxRank: 1,
    cost: 2,
    effect: { kind: 'moveSpeed', perRank: 0.05 },
  },
  {
    id: 'wanderersRest',
    name: "Wanderer's Rest",
    description: '+0.5 level of rested-XP cap per rank.',
    maxRank: 3,
    cost: 1,
    effect: { kind: 'restedCap', perRank: 0.5 },
  },
];

const PERK_BY_ID = new Map<string, PerkDef>(PERKS.map((p) => [p.id, p]));
export function perkById(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id);
}

/** Whether a perk can be bought (rank left + enough Path Points). */
export function canBuyPerk(perk: PerkDef, currentRank: number, pathPoints: number): boolean {
  return currentRank < perk.maxRank && pathPoints >= perk.cost;
}

/** Total magnitude of a perk effect across a set of purchased ranks. */
export function perkMagnitude(perks: Record<string, number>, kind: PerkEffectKind): number {
  let total = 0;
  for (const p of PERKS) {
    if (p.effect.kind === kind) total += p.effect.perRank * (perks[p.id] ?? 0);
  }
  return total;
}
