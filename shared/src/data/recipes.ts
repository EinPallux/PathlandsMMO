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
}

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
];

export function recipeById(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.id === id);
}
