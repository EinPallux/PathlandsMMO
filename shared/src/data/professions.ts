// Professions (GDD §9). Data + skill model for the five professions; Phase-4 Part 3
// activates the three gathering professions (Mining, Herbalism, Fishing). Materials
// are stackable, non-equipment items held in a per-character material stash (not the
// equipment bag). Pure data + pure helpers — no DOM, no wall-clock.

export enum Profession {
  Mining = 'mining',
  Herbalism = 'herbalism',
  Fishing = 'fishing',
  Blacksmithing = 'blacksmithing',
  Alchemy = 'alchemy',
}

export const GATHERING_PROFESSIONS: readonly Profession[] = [
  Profession.Mining,
  Profession.Herbalism,
  Profession.Fishing,
];

export const ALL_PROFESSIONS: readonly Profession[] = [
  Profession.Mining,
  Profession.Herbalism,
  Profession.Fishing,
  Profession.Blacksmithing,
  Profession.Alchemy,
];

export const PROFESSION_NAME: Record<Profession, string> = {
  [Profession.Mining]: 'Mining',
  [Profession.Herbalism]: 'Herbalism',
  [Profession.Fishing]: 'Fishing',
  [Profession.Blacksmithing]: 'Blacksmithing',
  [Profession.Alchemy]: 'Alchemy',
};

/** Skill cap per profession (GDD §9: 1–100). */
export const SKILL_MAX = 100;

/** The four material tiers and the skill at which each becomes gatherable. */
export const TIER_SKILL = [1, 25, 50, 75] as const;

export interface MaterialDef {
  id: string;
  name: string;
  profession: Profession;
  /** Tier index 0–3 (skill req = TIER_SKILL[tier]). */
  tier: number;
  /** Vendor value in copper. */
  value: number;
  /** True for byproducts/rare procs (not a node's primary yield). */
  secondary?: boolean;
}

export const MATERIALS: readonly MaterialDef[] = [
  // --- Mining (ore + stone byproduct + rare gem) ---
  { id: 'copperOre', name: 'Copper Ore', profession: Profession.Mining, tier: 0, value: 3 },
  { id: 'ironOre', name: 'Iron Ore', profession: Profession.Mining, tier: 1, value: 8 },
  { id: 'silverOre', name: 'Silver Ore', profession: Profession.Mining, tier: 2, value: 18 },
  {
    id: 'crystaliumOre',
    name: 'Crystalium Ore',
    profession: Profession.Mining,
    tier: 3,
    value: 40,
  },
  {
    id: 'roughStone',
    name: 'Rough Stone',
    profession: Profession.Mining,
    tier: 0,
    value: 1,
    secondary: true,
  },
  {
    id: 'gemShard',
    name: 'Gem Shard',
    profession: Profession.Mining,
    tier: 0,
    value: 30,
    secondary: true,
  },
  // --- Smelted bars (Blacksmithing intermediates, crafted from ore) ---
  { id: 'copperBar', name: 'Copper Bar', profession: Profession.Blacksmithing, tier: 0, value: 8 },
  { id: 'ironBar', name: 'Iron Bar', profession: Profession.Blacksmithing, tier: 1, value: 20 },
  { id: 'silverBar', name: 'Silver Bar', profession: Profession.Blacksmithing, tier: 2, value: 44 },
  {
    id: 'crystaliumBar',
    name: 'Crystalium Bar',
    profession: Profession.Blacksmithing,
    tier: 3,
    value: 95,
  },
  // --- Herbalism ---
  { id: 'meadowbloom', name: 'Meadowbloom', profession: Profession.Herbalism, tier: 0, value: 3 },
  { id: 'fenweed', name: 'Fenweed', profession: Profession.Herbalism, tier: 1, value: 8 },
  { id: 'cavemoss', name: 'Cavemoss', profession: Profession.Herbalism, tier: 2, value: 18 },
  { id: 'duskpetal', name: 'Duskpetal', profession: Profession.Herbalism, tier: 3, value: 40 },
  // --- Fishing (fish + oil byproduct) ---
  { id: 'pondTrout', name: 'Pond Trout', profession: Profession.Fishing, tier: 0, value: 4 },
  { id: 'riverBass', name: 'River Bass', profession: Profession.Fishing, tier: 1, value: 9 },
  { id: 'lakePike', name: 'Lake Pike', profession: Profession.Fishing, tier: 2, value: 20 },
  { id: 'coastMarlin', name: 'Coast Marlin', profession: Profession.Fishing, tier: 3, value: 44 },
  {
    id: 'fishOil',
    name: 'Fish Oil',
    profession: Profession.Fishing,
    tier: 0,
    value: 2,
    secondary: true,
  },
];

const MATERIAL_BY_ID = new Map<string, MaterialDef>(MATERIALS.map((m) => [m.id, m]));
export function materialById(id: string): MaterialDef | undefined {
  return MATERIAL_BY_ID.get(id);
}

/** The primary material a profession yields at a tier index (0–3). */
export function primaryMaterial(prof: Profession, tier: number): MaterialDef | undefined {
  return MATERIALS.find((m) => m.profession === prof && m.tier === tier && !m.secondary);
}

/** Which gather node (worldgen PropId) maps to which profession + tier. */
export interface NodeInfo {
  profession: Profession;
  tier: number;
}

export const NODE_INFO: Record<string, NodeInfo> = {
  oreCopper: { profession: Profession.Mining, tier: 0 },
  oreIron: { profession: Profession.Mining, tier: 1 },
  oreSilver: { profession: Profession.Mining, tier: 2 },
  oreCrystal: { profession: Profession.Mining, tier: 3 },
  herbMeadow: { profession: Profession.Herbalism, tier: 0 },
  herbFen: { profession: Profession.Herbalism, tier: 1 },
};

/** Gather info for a worldgen prop id, or undefined if it isn't a node. */
export function nodeInfo(propId: string): NodeInfo | undefined {
  return NODE_INFO[propId];
}

/** Channel time (seconds) to work a node of a profession (GDD §9). */
export const CHANNEL_SECONDS: Partial<Record<Profession, number>> = {
  [Profession.Mining]: 3,
  [Profession.Herbalism]: 2,
};
