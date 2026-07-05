// Primary stat model and the constants that turn primary stats into combat power.
// GDD §4. Pure data + tiny helpers; no randomness, no wall-clock. Shared by the
// client HUD, the sim combat resolver, and (Phase 6) the authoritative server.

/** The five primary stats. Live on gear and grow per-level by class (GDD §4). */
export interface StatBlock {
  /** Melee/ranged attack power (1 AP per point). */
  might: number;
  /** Crit (+1% per 20) + a little AP for the Ranger. */
  agility: number;
  /** Spell power (1 SP per point) + max Mana (+15 per point). */
  intellect: number;
  /** HP/Mana regeneration, in and out of combat. */
  spirit: number;
  /** +10 max HP per point. */
  stamina: number;
}

export const STAT_KEYS = ['might', 'agility', 'intellect', 'spirit', 'stamina'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

// --- Primary → derived conversion constants (GDD §4) ---
export const AP_PER_MIGHT = 1;
export const AP_PER_AGILITY_RANGER = 0.5; // Ranger only; "small AP for Ranger"
export const SP_PER_INTELLECT = 1;
export const MANA_PER_INTELLECT = 15;
export const HP_PER_STAMINA = 10;
/** Crit chance per point of Agility: 1% per 20 → 0.0005 as a fraction. */
export const CRIT_PER_AGILITY = 0.01 / 20;
/** Everyone crits at least this often before Agility/gear. */
export const BASE_CRIT = 0.05;
/** Crit damage/heal multiplier. */
export const CRIT_MULTIPLIER = 1.5;

export function zeroStats(): StatBlock {
  return { might: 0, agility: 0, intellect: 0, spirit: 0, stamina: 0 };
}

export function makeStats(partial: Partial<StatBlock>): StatBlock {
  return { ...zeroStats(), ...partial };
}

/** Sum any number of stat blocks into a fresh block (gear + base + growth). */
export function addStats(...blocks: ReadonlyArray<Partial<StatBlock>>): StatBlock {
  const out = zeroStats();
  for (const b of blocks) {
    out.might += b.might ?? 0;
    out.agility += b.agility ?? 0;
    out.intellect += b.intellect ?? 0;
    out.spirit += b.spirit ?? 0;
    out.stamina += b.stamina ?? 0;
  }
  return out;
}

/** Scale a stat block by a factor (per-level growth × levels), floored to integers. */
export function scaleStatsFloored(b: StatBlock, factor: number): StatBlock {
  return {
    might: Math.floor(b.might * factor),
    agility: Math.floor(b.agility * factor),
    intellect: Math.floor(b.intellect * factor),
    spirit: Math.floor(b.spirit * factor),
    stamina: Math.floor(b.stamina * factor),
  };
}

/** Total stat-point weight of a block (used for item budget accounting). */
export function statTotal(b: Partial<StatBlock>): number {
  return (
    (b.might ?? 0) + (b.agility ?? 0) + (b.intellect ?? 0) + (b.spirit ?? 0) + (b.stamina ?? 0)
  );
}
