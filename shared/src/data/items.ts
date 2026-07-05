// Item & gear schema plus itemization formulas (GDD §6). Data-driven: curated
// items and loot tables are declared as ItemDef data; random drops are generated
// deterministically from a seeded Rng. Pure — no DOM, no wall-clock.

import { CharacterClass } from '../models/characters/index.js';
import { ArmorClass } from './classes.js';
import { STAT_KEYS, type StatBlock, type StatKey } from './stats.js';
import type { Rng } from '../core/rng.js';

/** The 11 equipment slots (GDD §6). */
export enum EquipSlot {
  MainHand = 'mainHand',
  OffHand = 'offHand',
  Head = 'head',
  Chest = 'chest',
  Legs = 'legs',
  Feet = 'feet',
  Hands = 'hands',
  Amulet = 'amulet',
  Ring1 = 'ring1',
  Ring2 = 'ring2',
  Trinket = 'trinket',
}

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  EquipSlot.MainHand,
  EquipSlot.OffHand,
  EquipSlot.Head,
  EquipSlot.Chest,
  EquipSlot.Legs,
  EquipSlot.Feet,
  EquipSlot.Hands,
  EquipSlot.Amulet,
  EquipSlot.Ring1,
  EquipSlot.Ring2,
  EquipSlot.Trinket,
];

/** The two interchangeable ring slots (for auto-placing a ring). */
export const RING_SLOTS: readonly EquipSlot[] = [EquipSlot.Ring1, EquipSlot.Ring2];

export enum Rarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
}

export const RARITY_ORDER: readonly Rarity[] = [
  Rarity.Common,
  Rarity.Uncommon,
  Rarity.Rare,
  Rarity.Epic,
];

/** Stat-budget multiplier by rarity (GDD §6). */
export const RARITY_BUDGET_MULT: Record<Rarity, number> = {
  [Rarity.Common]: 1.0,
  [Rarity.Uncommon]: 1.25,
  [Rarity.Rare]: 1.55,
  [Rarity.Epic]: 1.9,
};

/** ilvl bonus over required level, by rarity (GDD §6: reqLevel + {0,3,6,10}). */
export const RARITY_ILVL_BONUS: Record<Rarity, number> = {
  [Rarity.Common]: 0,
  [Rarity.Uncommon]: 3,
  [Rarity.Rare]: 6,
  [Rarity.Epic]: 10,
};

/** UI/rarity colors (ART_GUIDE §7); mirrored here so tooltips share one source. */
export const RARITY_COLOR: Record<Rarity, number> = {
  [Rarity.Common]: 0xf2f2f2,
  [Rarity.Uncommon]: 0x5fbf4e,
  [Rarity.Rare]: 0x4ea3e8,
  [Rarity.Epic]: 0xa66fe8,
};

export enum WeaponKind {
  Sword = 'sword',
  Axe = 'axe',
  Mace = 'mace',
  Dagger = 'dagger',
  Bow = 'bow',
  Staff = 'staff',
  Wand = 'wand',
  Shield = 'shield',
  Tome = 'tome',
}

/** Weapon swing time in seconds (feeds weaponDamage per swing). */
export const WEAPON_SPEED: Record<WeaponKind, number> = {
  [WeaponKind.Dagger]: 1.6,
  [WeaponKind.Sword]: 2.4,
  [WeaponKind.Axe]: 2.6,
  [WeaponKind.Mace]: 2.5,
  [WeaponKind.Bow]: 2.8,
  [WeaponKind.Staff]: 3.0,
  [WeaponKind.Wand]: 1.8,
  [WeaponKind.Shield]: 0,
  [WeaponKind.Tome]: 0,
};

/** The signature main-hand weapon each class wields (GDD §2 "one visible weapon"). */
export const CLASS_WEAPON: Record<CharacterClass, WeaponKind> = {
  [CharacterClass.Warrior]: WeaponKind.Sword,
  [CharacterClass.Ranger]: WeaponKind.Bow,
  [CharacterClass.Priest]: WeaponKind.Mace,
  [CharacterClass.Mage]: WeaponKind.Staff,
};

export interface WeaponData {
  kind: WeaponKind;
  /** Swing time (seconds). */
  speed: number;
  /** Base damage per swing (dps × speed). */
  baseRoll: number;
  /** Damage per second this weapon represents. */
  dps: number;
}

export interface TrinketEffect {
  /** 'onUse' (activated, has cooldown) or 'proc' (chance on hit). */
  trigger: 'onUse' | 'proc';
  kind: 'shield' | 'speed' | 'goldFind' | 'restoreResource' | 'critBurst';
  magnitude: number;
  durationTicks?: number;
  cooldownTicks?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  slot: EquipSlot;
  rarity: Rarity;
  /** Item level (drives budget + armor + weapon dps). */
  ilvl: number;
  /** Level required to equip. */
  reqLevel: number;
  /** Armor material for armor pieces; undefined for jewelry/weapons. */
  armorClass?: ArmorClass;
  /** Primary-stat bonuses (the item's stat budget, distributed 1–3 stats). */
  stats: Partial<StatBlock>;
  /** Armor rating (physical mitigation) for armor pieces + shields. */
  armor?: number;
  /** Bonus crit chance as a fraction (some gear grants flat crit). */
  bonusCritChance?: number;
  weapon?: WeaponData;
  trinket?: TrinketEffect;
  /** Epic items bind on equip (GDD §6); everything else trades freely. */
  bindOnEquip?: boolean;
  /** Vendor value in copper (buy = value; sell = value/4). */
  value: number;
}

// --- Itemization formulas (GDD §6) ---

/** ilvl for an item of `reqLevel` and `rarity`. */
export function ilvlFor(reqLevel: number, rarity: Rarity): number {
  return reqLevel + RARITY_ILVL_BONUS[rarity];
}

/** What a vendor charges to sell an item to the player (GDD §6: buy = full value). */
export function buyPrice(item: ItemDef): number {
  return Math.max(1, Math.round(item.value));
}

/** What a vendor pays the player for an item (GDD §6: sell = a quarter of value). */
export function sellPrice(item: ItemDef, qty = 1): number {
  return Math.max(1, Math.floor((item.value / 4) * qty));
}

/** Total primary-stat budget for an item: `ilvl × rarityMult` (GDD §6). */
export function statBudget(ilvl: number, rarity: Rarity): number {
  return Math.round(ilvl * RARITY_BUDGET_MULT[rarity]);
}

/** Weapon DPS at an item level: `3.2 + 1.9 × ilvl^0.95` (GDD §6). */
export function weaponDps(ilvl: number): number {
  return 3.2 + 1.9 * Math.pow(ilvl, 0.95);
}

/** Armor-class base mitigation multiplier (plate armors far more than cloth). */
export const ARMOR_CLASS_MULT: Record<ArmorClass, number> = {
  [ArmorClass.Cloth]: 1.0,
  [ArmorClass.Leather]: 1.6,
  [ArmorClass.Mail]: 2.4,
  [ArmorClass.Plate]: 3.2,
};

/** Share of a body's armor carried by each armor slot. */
export const SLOT_ARMOR_WEIGHT: Partial<Record<EquipSlot, number>> = {
  [EquipSlot.Chest]: 1.0,
  [EquipSlot.Legs]: 0.85,
  [EquipSlot.Head]: 0.6,
  [EquipSlot.Feet]: 0.5,
  [EquipSlot.Hands]: 0.5,
  [EquipSlot.OffHand]: 1.2, // shields
};

/** Armor rating for an armor/shield piece; 0 for slots that carry no armor. */
export function armorRating(ilvl: number, slot: EquipSlot, armorClass: ArmorClass): number {
  const weight = SLOT_ARMOR_WEIGHT[slot];
  if (weight === undefined) return 0;
  return Math.round(ilvl * ARMOR_CLASS_MULT[armorClass] * weight * 2);
}

/** The armor class a character wears (GDD §6, class-locked at equip). */
export function armorClassFor(cls: CharacterClass): ArmorClass {
  switch (cls) {
    case CharacterClass.Warrior:
      return ArmorClass.Plate;
    case CharacterClass.Ranger:
      return ArmorClass.Leather;
    case CharacterClass.Priest:
    case CharacterClass.Mage:
      return ArmorClass.Cloth;
  }
}

/** Armor classes a character may wear (Warriors wear mail AND plate, GDD §6). */
export function canWearArmor(cls: CharacterClass, ac: ArmorClass): boolean {
  if (cls === CharacterClass.Warrior) return ac === ArmorClass.Plate || ac === ArmorClass.Mail;
  return ac === armorClassFor(cls);
}

/** True if `cls` may equip `item` (armor-class lock + level + weapon type). */
export function canEquip(cls: CharacterClass, level: number, item: ItemDef): boolean {
  if (level < item.reqLevel) return false;
  if (item.armorClass !== undefined && !canWearArmor(cls, item.armorClass)) return false;
  if (item.slot === EquipSlot.MainHand && item.weapon && item.weapon.kind !== CLASS_WEAPON[cls]) {
    return false;
  }
  return true;
}

/** Which primary stats a class most wants (for generating class-flavored drops). */
export const FAVORED_STATS: Record<CharacterClass, StatKey[]> = {
  [CharacterClass.Warrior]: ['might', 'stamina'],
  [CharacterClass.Ranger]: ['agility', 'might', 'stamina'],
  [CharacterClass.Priest]: ['intellect', 'spirit', 'stamina'],
  [CharacterClass.Mage]: ['intellect', 'agility', 'spirit'],
};

/**
 * Distribute a stat budget over 1–3 stats drawn from `favored` (falls back to all
 * stats), deterministically from `rng`. Returns integer stat amounts.
 */
export function rollItemStats(rng: Rng, budget: number, favored: StatKey[]): Partial<StatBlock> {
  const pool = favored.length > 0 ? favored : [...STAT_KEYS];
  // Never pick more stats than the budget can cover (≥1 each) — this avoids
  // over-budget drops at very low ilvl.
  const maxPicks = Math.min(3, pool.length, Math.max(1, budget));
  const count = rng.int(1, maxPicks);
  const picks: StatKey[] = [];
  const bag = [...pool];
  for (let i = 0; i < count && bag.length > 0; i++) {
    const idx = rng.int(0, bag.length - 1);
    picks.push(bag[idx]!);
    bag.splice(idx, 1);
  }
  // Floor each pick at 1, then distribute the remainder by weight so the total is
  // exactly `budget` (floor for non-last picks keeps the leftover non-negative).
  const remainder = Math.max(0, budget - picks.length);
  const weights = picks.map(() => rng.float(0.7, 1.3));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const out: Partial<StatBlock> = {};
  let assigned = 0;
  picks.forEach((k, i) => {
    const extra =
      i === picks.length - 1 ? remainder - assigned : Math.floor((remainder * weights[i]!) / wSum);
    assigned += extra;
    out[k] = 1 + extra;
  });
  return out;
}

/** Human-readable name parts for generated drops. */
const SLOT_NOUN: Record<EquipSlot, string> = {
  [EquipSlot.MainHand]: 'Blade',
  [EquipSlot.OffHand]: 'Bulwark',
  [EquipSlot.Head]: 'Helm',
  [EquipSlot.Chest]: 'Chestguard',
  [EquipSlot.Legs]: 'Legguards',
  [EquipSlot.Feet]: 'Boots',
  [EquipSlot.Hands]: 'Gloves',
  [EquipSlot.Amulet]: 'Amulet',
  [EquipSlot.Ring1]: 'Ring',
  [EquipSlot.Ring2]: 'Ring',
  [EquipSlot.Trinket]: 'Charm',
};
const RARITY_ADJ: Record<Rarity, string> = {
  [Rarity.Common]: 'Worn',
  [Rarity.Uncommon]: 'Sturdy',
  [Rarity.Rare]: 'Gleaming',
  [Rarity.Epic]: 'Wayforged',
};

export interface GeneratedItemSpec {
  slot: EquipSlot;
  rarity: Rarity;
  reqLevel: number;
  /** Flavor the drop for a class (armor class, weapon kind, favored stats). */
  forClass?: CharacterClass;
}

const ARMOR_SLOTS = new Set<EquipSlot>([
  EquipSlot.Head,
  EquipSlot.Chest,
  EquipSlot.Legs,
  EquipSlot.Feet,
  EquipSlot.Hands,
]);

/**
 * Build a complete ItemDef for a random drop, deterministically from `rng`.
 * Instance id folds in the rng state so distinct rolls never collide.
 */
export function generateItem(rng: Rng, spec: GeneratedItemSpec): ItemDef {
  const { slot, rarity, reqLevel, forClass } = spec;
  const ilvl = ilvlFor(reqLevel, rarity);
  const budget = statBudget(ilvl, rarity);
  const favored = forClass ? FAVORED_STATS[forClass] : [...STAT_KEYS];
  const stats = rollItemStats(rng, budget, favored);

  const item: ItemDef = {
    id: `gen:${slot}:${ilvl}:${rarity}:${rng.getState().toString(36)}`,
    name: `${RARITY_ADJ[rarity]} ${SLOT_NOUN[slot]}`,
    slot,
    rarity,
    ilvl,
    reqLevel,
    stats,
    value: Math.round(ilvl * ilvl * 0.6 * RARITY_BUDGET_MULT[rarity]) + 4,
    bindOnEquip: rarity === Rarity.Epic,
  };

  if (ARMOR_SLOTS.has(slot)) {
    const ac = forClass ? armorClassFor(forClass) : ArmorClass.Leather;
    item.armorClass = ac;
    item.armor = armorRating(ilvl, slot, ac);
  } else if (slot === EquipSlot.OffHand) {
    // Off-hand shields carry armor (Warrior); casters use tomes (spell stats only).
    // The armorClass gates the shield to plate-wearers so casters can't equip it.
    if (forClass === CharacterClass.Warrior) {
      item.armorClass = ArmorClass.Plate;
      item.armor = armorRating(ilvl, slot, ArmorClass.Plate);
      item.weapon = { kind: WeaponKind.Shield, speed: 0, baseRoll: 0, dps: 0 };
    }
  } else if (slot === EquipSlot.MainHand) {
    const kind = forClass ? CLASS_WEAPON[forClass] : WeaponKind.Sword;
    const speed = WEAPON_SPEED[kind];
    const dps = weaponDps(ilvl);
    item.weapon = { kind, speed, baseRoll: Math.round(dps * speed), dps };
  }

  return item;
}
