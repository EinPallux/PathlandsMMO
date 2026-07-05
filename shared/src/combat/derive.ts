// Turn primary stats (base + per-level growth + gear) into the combat-facing
// derived stats the resolver and HUD use. GDD §4. Pure.

import { CharacterClass } from '../models/characters/index.js';
import {
  AP_PER_MIGHT,
  AP_PER_AGILITY_RANGER,
  SP_PER_INTELLECT,
  MANA_PER_INTELLECT,
  HP_PER_STAMINA,
  BASE_CRIT,
  CRIT_PER_AGILITY,
  addStats,
  type StatBlock,
} from '../data/stats.js';
import {
  CLASS_PROGRESSION,
  ResourceKind,
  RAGE_MAX,
  FOCUS_MAX,
  FOCUS_REGEN_PER_SEC,
  MANA_BASE,
  baseStatsAtLevel,
} from '../data/classes.js';

/** Combat-facing stats derived from primary stats + level + gear. */
export interface CombatStats {
  maxHP: number;
  resourceKind: ResourceKind;
  maxResource: number;
  attackPower: number;
  spellPower: number;
  /** Crit chance as a fraction (0.05 = 5%). */
  critChance: number;
  armor: number;
}

/** Gear/effect contributions that are not primary stats. */
export interface EquipDerived {
  armor?: number;
  bonusCritChance?: number;
  bonusMaxHP?: number;
}

/** Derive combat stats from a final (already-summed) stat block. */
export function deriveCombatStats(
  stats: StatBlock,
  cls: CharacterClass,
  equip: EquipDerived = {},
): CombatStats {
  const p = CLASS_PROGRESSION[cls];
  const maxHP = p.baseHP + stats.stamina * HP_PER_STAMINA + (equip.bonusMaxHP ?? 0);
  const attackPower =
    stats.might * AP_PER_MIGHT +
    (cls === CharacterClass.Ranger ? Math.floor(stats.agility * AP_PER_AGILITY_RANGER) : 0);
  const spellPower = stats.intellect * SP_PER_INTELLECT;
  const critChance = BASE_CRIT + stats.agility * CRIT_PER_AGILITY + (equip.bonusCritChance ?? 0);

  let maxResource: number;
  switch (p.resource) {
    case ResourceKind.Rage:
      maxResource = RAGE_MAX;
      break;
    case ResourceKind.Focus:
      maxResource = FOCUS_MAX;
      break;
    case ResourceKind.Mana:
      maxResource = MANA_BASE + stats.intellect * MANA_PER_INTELLECT;
      break;
  }

  return {
    maxHP,
    resourceKind: p.resource,
    maxResource,
    attackPower,
    spellPower,
    critChance,
    armor: equip.armor ?? 0,
  };
}

/** Convenience: derive a class's combat stats at a level, optionally adding gear. */
export function combatStatsForLevel(
  cls: CharacterClass,
  level: number,
  gear: Partial<StatBlock> = {},
  equip: EquipDerived = {},
): CombatStats {
  return deriveCombatStats(addStats(baseStatsAtLevel(cls, level), gear), cls, equip);
}

// --- Resource regeneration (GDD §3) ---
// Out of combat everything refills fast (~10 s). In combat: Focus is steady, Mana
// is Spirit-driven, Rage is built by damage (0 passive) and decays out of combat.
export const OOC_REFILL_SECONDS = 10;
export const RAGE_DECAY_PER_SEC = 4; // out of combat
export const MANA_COMBAT_REGEN_PER_SPIRIT = 0.35; // per second

/**
 * Passive resource change per second. Positive = regen, negative = decay. Rage in
 * combat is gained from damage events (handled by the resolver), so its passive
 * rate is 0 in combat and a decay out of combat.
 */
export function resourceRegenPerSecond(
  kind: ResourceKind,
  spirit: number,
  maxResource: number,
  inCombat: boolean,
): number {
  switch (kind) {
    case ResourceKind.Focus:
      return FOCUS_REGEN_PER_SEC;
    case ResourceKind.Rage:
      return inCombat ? 0 : -RAGE_DECAY_PER_SEC;
    case ResourceKind.Mana:
      return inCombat ? spirit * MANA_COMBAT_REGEN_PER_SPIRIT : maxResource / OOC_REFILL_SECONDS;
  }
}
