// Crafting recipes + consumables (GDD §9). Blacksmithing smelts ore into bars and
// forges gear; Alchemy brews potions/elixirs from herbs (+ fish oil). Pure data —
// the craft engine (shared/professions/craft.ts) resolves them. Consumables are used
// through the combat director (heal / restore / stat buff).

import { EquipSlot, Rarity } from './items.js';
import { Profession } from './professions.js';
import { TICK_RATE } from '../core/constants.js';

const MIN = (m: number): number => Math.round(m * 60 * TICK_RATE); // minutes → ticks

/** What drinking a consumable does. */
export type ConsumableEffect =
  | { kind: 'heal'; amount: number }
  | { kind: 'resource'; amount: number }
  | { kind: 'buff'; modifier: string; magnitude: number; durationTicks: number; label: string };

export interface ConsumableDef {
  id: string;
  name: string;
  effect: ConsumableEffect;
  /** Vendor value in copper. */
  value: number;
}

export const CONSUMABLES: readonly ConsumableDef[] = [
  {
    id: 'lesserHealthPotion',
    name: 'Lesser Health Potion',
    effect: { kind: 'heal', amount: 90 },
    value: 12,
  },
  { id: 'healthPotion', name: 'Health Potion', effect: { kind: 'heal', amount: 240 }, value: 30 },
  {
    id: 'manaPotion',
    name: 'Mana Draught',
    effect: { kind: 'resource', amount: 70 },
    value: 24,
  },
  {
    id: 'mightElixir',
    name: 'Elixir of Might',
    effect: {
      kind: 'buff',
      modifier: 'damageDealt',
      magnitude: 0.1,
      durationTicks: MIN(30),
      label: '+10% damage',
    },
    value: 45,
  },
  {
    id: 'wardingElixir',
    name: 'Warding Elixir',
    effect: {
      kind: 'buff',
      modifier: 'damageTaken',
      magnitude: -0.1,
      durationTicks: MIN(30),
      label: '−10% damage taken',
    },
    value: 45,
  },
  // --- Part 18: higher-tier consumables for the fuller recipe book ---
  {
    id: 'greaterHealthPotion',
    name: 'Greater Health Potion',
    effect: { kind: 'heal', amount: 520 },
    value: 60,
  },
  {
    id: 'greaterManaPotion',
    name: 'Greater Mana Draught',
    effect: { kind: 'resource', amount: 160 },
    value: 52,
  },
  {
    id: 'masterHealthPotion',
    name: 'Master Health Potion',
    effect: { kind: 'heal', amount: 940 },
    value: 110,
  },
  {
    id: 'greaterMightElixir',
    name: 'Greater Elixir of Might',
    effect: {
      kind: 'buff',
      modifier: 'damageDealt',
      magnitude: 0.15,
      durationTicks: MIN(30),
      label: '+15% damage',
    },
    value: 90,
  },
  {
    id: 'greaterWardingElixir',
    name: 'Greater Warding Elixir',
    effect: {
      kind: 'buff',
      modifier: 'damageTaken',
      magnitude: -0.15,
      durationTicks: MIN(30),
      label: '−15% damage taken',
    },
    value: 90,
  },
  {
    id: 'elixirOfMastery',
    name: 'Elixir of Mastery',
    effect: {
      kind: 'buff',
      modifier: 'damageDealt',
      magnitude: 0.2,
      durationTicks: MIN(45),
      label: '+20% damage',
    },
    value: 180,
  },
];

const CONSUMABLE_BY_ID = new Map<string, ConsumableDef>(CONSUMABLES.map((c) => [c.id, c]));
export function consumableById(id: string): ConsumableDef | undefined {
  return CONSUMABLE_BY_ID.get(id);
}

export type RecipeOutput =
  | { kind: 'material'; id: string; qty: number }
  | { kind: 'consumable'; id: string; qty: number }
  | { kind: 'equipment'; slot: EquipSlot; rarity: Rarity; reqLevel: number };

export interface RecipeInput {
  id: string; // material id
  qty: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  profession: Profession;
  /** Skill required to craft (drives skill-ups, orange→gray). */
  skillReq: number;
  inputs: RecipeInput[];
  output: RecipeOutput;
  category: 'smelt' | 'gear' | 'potion' | 'elixir';
  /**
   * A "discovery" recipe is hidden until learned: it is not craftable or shown until
   * a random discovery procs on a craft in the same profession at sufficient skill
   * (GDD §9, classic profession discovery). Non-discovery recipes are known by
   * default, gated only by skill.
   */
  discovery?: boolean;
}

/** Per-craft chance to discover an unknown, skill-eligible discovery recipe. */
export const DISCOVERY_CHANCE = 0.12;

export const RECIPES: readonly RecipeDef[] = [
  // --- Blacksmithing: smelting ore → bars ---
  {
    id: 'r_copperBar',
    name: 'Smelt Copper',
    profession: Profession.Blacksmithing,
    skillReq: 1,
    inputs: [{ id: 'copperOre', qty: 2 }],
    output: { kind: 'material', id: 'copperBar', qty: 1 },
    category: 'smelt',
  },
  {
    id: 'r_ironBar',
    name: 'Smelt Iron',
    profession: Profession.Blacksmithing,
    skillReq: 25,
    inputs: [{ id: 'ironOre', qty: 2 }],
    output: { kind: 'material', id: 'ironBar', qty: 1 },
    category: 'smelt',
  },
  {
    id: 'r_silverBar',
    name: 'Smelt Silver',
    profession: Profession.Blacksmithing,
    skillReq: 50,
    inputs: [{ id: 'silverOre', qty: 2 }],
    output: { kind: 'material', id: 'silverBar', qty: 1 },
    category: 'smelt',
  },
  // --- Blacksmithing: gear ---
  {
    id: 'r_copperSword',
    name: 'Copper Sword',
    profession: Profession.Blacksmithing,
    skillReq: 10,
    inputs: [
      { id: 'copperBar', qty: 3 },
      { id: 'roughStone', qty: 1 },
    ],
    output: { kind: 'equipment', slot: EquipSlot.MainHand, rarity: Rarity.Uncommon, reqLevel: 6 },
    category: 'gear',
  },
  {
    id: 'r_copperMail',
    name: 'Copper Chestguard',
    profession: Profession.Blacksmithing,
    skillReq: 15,
    inputs: [{ id: 'copperBar', qty: 4 }],
    output: { kind: 'equipment', slot: EquipSlot.Chest, rarity: Rarity.Uncommon, reqLevel: 7 },
    category: 'gear',
  },
  {
    id: 'r_ironBlade',
    name: 'Ironforged Blade',
    profession: Profession.Blacksmithing,
    skillReq: 30,
    inputs: [
      { id: 'ironBar', qty: 4 },
      { id: 'gemShard', qty: 1 },
    ],
    output: { kind: 'equipment', slot: EquipSlot.MainHand, rarity: Rarity.Rare, reqLevel: 14 },
    category: 'gear',
  },
  // --- Alchemy: potions + elixirs ---
  {
    id: 'r_lesserHealthPotion',
    name: 'Lesser Health Potion',
    profession: Profession.Alchemy,
    skillReq: 1,
    inputs: [{ id: 'meadowbloom', qty: 1 }],
    output: { kind: 'consumable', id: 'lesserHealthPotion', qty: 1 },
    category: 'potion',
  },
  {
    id: 'r_manaPotion',
    name: 'Mana Draught',
    profession: Profession.Alchemy,
    skillReq: 8,
    inputs: [
      { id: 'meadowbloom', qty: 1 },
      { id: 'fishOil', qty: 1 },
    ],
    output: { kind: 'consumable', id: 'manaPotion', qty: 1 },
    category: 'potion',
  },
  {
    id: 'r_healthPotion',
    name: 'Health Potion',
    profession: Profession.Alchemy,
    skillReq: 25,
    inputs: [{ id: 'fenweed', qty: 2 }],
    output: { kind: 'consumable', id: 'healthPotion', qty: 1 },
    category: 'potion',
  },
  {
    id: 'r_mightElixir',
    name: 'Elixir of Might',
    profession: Profession.Alchemy,
    skillReq: 30,
    inputs: [
      { id: 'fenweed', qty: 2 },
      { id: 'gemShard', qty: 1 },
    ],
    output: { kind: 'consumable', id: 'mightElixir', qty: 1 },
    category: 'elixir',
  },
  {
    id: 'r_wardingElixir',
    name: 'Warding Elixir',
    profession: Profession.Alchemy,
    skillReq: 30,
    inputs: [
      { id: 'fenweed', qty: 2 },
      { id: 'roughStone', qty: 2 },
    ],
    output: { kind: 'consumable', id: 'wardingElixir', qty: 1 },
    category: 'elixir',
  },

  // =====================================================================
  // Part 18 — the fuller recipe book (mid/high tiers to level 100).
  // =====================================================================

  // --- Blacksmithing: iron/silver/crystalium ---
  {
    id: 'r_crystaliumBar',
    name: 'Smelt Crystalium',
    profession: Profession.Blacksmithing,
    skillReq: 75,
    inputs: [{ id: 'crystaliumOre', qty: 2 }],
    output: { kind: 'material', id: 'crystaliumBar', qty: 1 },
    category: 'smelt',
  },
  {
    id: 'r_ironHelm',
    name: 'Iron Helm',
    profession: Profession.Blacksmithing,
    skillReq: 30,
    inputs: [{ id: 'ironBar', qty: 3 }],
    output: { kind: 'equipment', slot: EquipSlot.Head, rarity: Rarity.Uncommon, reqLevel: 13 },
    category: 'gear',
  },
  {
    id: 'r_ironMail',
    name: 'Ironforged Chestguard',
    profession: Profession.Blacksmithing,
    skillReq: 35,
    inputs: [
      { id: 'ironBar', qty: 5 },
      { id: 'roughStone', qty: 2 },
    ],
    output: { kind: 'equipment', slot: EquipSlot.Chest, rarity: Rarity.Rare, reqLevel: 15 },
    category: 'gear',
  },
  {
    id: 'r_silverBlade',
    name: 'Silveredge Blade',
    profession: Profession.Blacksmithing,
    skillReq: 55,
    inputs: [
      { id: 'silverBar', qty: 4 },
      { id: 'gemShard', qty: 1 },
    ],
    output: { kind: 'equipment', slot: EquipSlot.MainHand, rarity: Rarity.Rare, reqLevel: 22 },
    category: 'gear',
  },
  {
    id: 'r_silverGuard',
    name: 'Silverplate Guard',
    profession: Profession.Blacksmithing,
    skillReq: 60,
    inputs: [{ id: 'silverBar', qty: 5 }],
    output: { kind: 'equipment', slot: EquipSlot.Legs, rarity: Rarity.Rare, reqLevel: 24 },
    category: 'gear',
  },
  // Discovery: the top-tier crystalium gear (skill 80+; learned, not given).
  {
    id: 'r_crystaliumBlade',
    name: 'Crystalium Warblade',
    profession: Profession.Blacksmithing,
    skillReq: 80,
    inputs: [
      { id: 'crystaliumBar', qty: 4 },
      { id: 'gemShard', qty: 2 },
    ],
    output: { kind: 'equipment', slot: EquipSlot.MainHand, rarity: Rarity.Epic, reqLevel: 28 },
    category: 'gear',
    discovery: true,
  },
  {
    id: 'r_crystaliumPlate',
    name: 'Crystalium Battleplate',
    profession: Profession.Blacksmithing,
    skillReq: 85,
    inputs: [{ id: 'crystaliumBar', qty: 6 }],
    output: { kind: 'equipment', slot: EquipSlot.Chest, rarity: Rarity.Epic, reqLevel: 29 },
    category: 'gear',
    discovery: true,
  },

  // --- Alchemy: greater/master potions + elixirs ---
  {
    id: 'r_greaterManaPotion',
    name: 'Greater Mana Draught',
    profession: Profession.Alchemy,
    skillReq: 45,
    inputs: [
      { id: 'cavemoss', qty: 1 },
      { id: 'fishOil', qty: 1 },
    ],
    output: { kind: 'consumable', id: 'greaterManaPotion', qty: 1 },
    category: 'potion',
  },
  {
    id: 'r_greaterHealthPotion',
    name: 'Greater Health Potion',
    profession: Profession.Alchemy,
    skillReq: 50,
    inputs: [{ id: 'cavemoss', qty: 2 }],
    output: { kind: 'consumable', id: 'greaterHealthPotion', qty: 1 },
    category: 'potion',
  },
  {
    id: 'r_greaterMightElixir',
    name: 'Greater Elixir of Might',
    profession: Profession.Alchemy,
    skillReq: 55,
    inputs: [
      { id: 'cavemoss', qty: 2 },
      { id: 'gemShard', qty: 1 },
    ],
    output: { kind: 'consumable', id: 'greaterMightElixir', qty: 1 },
    category: 'elixir',
  },
  {
    id: 'r_greaterWardingElixir',
    name: 'Greater Warding Elixir',
    profession: Profession.Alchemy,
    skillReq: 55,
    inputs: [
      { id: 'cavemoss', qty: 2 },
      { id: 'roughStone', qty: 2 },
    ],
    output: { kind: 'consumable', id: 'greaterWardingElixir', qty: 1 },
    category: 'elixir',
  },
  {
    id: 'r_masterHealthPotion',
    name: 'Master Health Potion',
    profession: Profession.Alchemy,
    skillReq: 75,
    inputs: [{ id: 'duskpetal', qty: 2 }],
    output: { kind: 'consumable', id: 'masterHealthPotion', qty: 1 },
    category: 'potion',
  },
  // Discovery: the capstone elixir (skill 85+).
  {
    id: 'r_elixirOfMastery',
    name: 'Elixir of Mastery',
    profession: Profession.Alchemy,
    skillReq: 85,
    inputs: [
      { id: 'duskpetal', qty: 3 },
      { id: 'gemShard', qty: 1 },
    ],
    output: { kind: 'consumable', id: 'elixirOfMastery', qty: 1 },
    category: 'elixir',
    discovery: true,
  },
];

/** Discovery recipes the player can learn (advanced, hidden until discovered). */
export const DISCOVERY_RECIPES: readonly RecipeDef[] = RECIPES.filter((r) => r.discovery);

export function recipeById(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.id === id);
}
