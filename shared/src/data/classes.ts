// Per-class progression data: base stats, per-level growth, starting HP, resource
// kind, and armor class. GDD §3 (classes/resources) + §4 (stats). The GDD leaves
// the exact base/growth numbers to implementation; they are defined here and
// mirrored into GDD §4 "Class stat tables". Phase-5 tunable.

import { CharacterClass } from '../models/characters/index.js';
import { addStats, scaleStatsFloored, type StatBlock } from './stats.js';

/** In-combat resource each class spends on skills (GDD §3). */
export enum ResourceKind {
  /** 0–100, built by dealing/taking damage, decays out of combat (Warrior). */
  Rage = 'rage',
  /** 0–100, regenerates 10/s always (Ranger). */
  Focus = 'focus',
  /** Intellect-scaled pool, regenerates from Spirit (Priest/Mage). */
  Mana = 'mana',
}

/** Wearable armor material; class-locked at equip (GDD §6). */
export enum ArmorClass {
  Cloth = 'cloth',
  Leather = 'leather',
  Mail = 'mail',
  Plate = 'plate',
}

export const RAGE_MAX = 100;
export const FOCUS_MAX = 100;
export const FOCUS_REGEN_PER_SEC = 10;
/** Flat Mana pool before Intellect scaling. */
export const MANA_BASE = 120;

export interface ClassProgression {
  id: CharacterClass;
  resource: ResourceKind;
  armorClass: ArmorClass;
  /** HP before Stamina is added (maxHP = baseHP + stamina·10). */
  baseHP: number;
  /** Primary stats at level 1 (before gear). */
  baseStats: StatBlock;
  /** Primary-stat points gained per level (applied as base + growth·(L−1)). */
  growth: StatBlock;
}

export const CLASS_PROGRESSION: Record<CharacterClass, ClassProgression> = {
  [CharacterClass.Warrior]: {
    id: CharacterClass.Warrior,
    resource: ResourceKind.Rage,
    armorClass: ArmorClass.Plate,
    baseHP: 60,
    baseStats: { might: 11, agility: 6, intellect: 4, spirit: 5, stamina: 11 },
    growth: { might: 1.8, agility: 0.5, intellect: 0.2, spirit: 0.5, stamina: 1.8 },
  },
  [CharacterClass.Ranger]: {
    id: CharacterClass.Ranger,
    resource: ResourceKind.Focus,
    armorClass: ArmorClass.Leather,
    baseHP: 45,
    baseStats: { might: 8, agility: 11, intellect: 4, spirit: 6, stamina: 8 },
    growth: { might: 1.1, agility: 1.8, intellect: 0.2, spirit: 0.6, stamina: 1.1 },
  },
  [CharacterClass.Priest]: {
    id: CharacterClass.Priest,
    resource: ResourceKind.Mana,
    armorClass: ArmorClass.Cloth,
    baseHP: 35,
    baseStats: { might: 4, agility: 5, intellect: 11, spirit: 10, stamina: 7 },
    growth: { might: 0.3, agility: 0.4, intellect: 1.8, spirit: 1.5, stamina: 0.9 },
  },
  [CharacterClass.Mage]: {
    id: CharacterClass.Mage,
    resource: ResourceKind.Mana,
    armorClass: ArmorClass.Cloth,
    baseHP: 30,
    baseStats: { might: 4, agility: 6, intellect: 12, spirit: 8, stamina: 6 },
    growth: { might: 0.3, agility: 0.6, intellect: 2.0, spirit: 1.0, stamina: 0.8 },
  },
};

/**
 * Primary stats for a class at a given level (before gear), floored to integers.
 * Deterministic: `base + growth·(level−1)`.
 */
export function baseStatsAtLevel(cls: CharacterClass, level: number): StatBlock {
  const p = CLASS_PROGRESSION[cls];
  return addStats(p.baseStats, scaleStatsFloored(p.growth, Math.max(0, level - 1)));
}

/** The resource kind for a class. */
export function resourceKind(cls: CharacterClass): ResourceKind {
  return CLASS_PROGRESSION[cls].resource;
}
