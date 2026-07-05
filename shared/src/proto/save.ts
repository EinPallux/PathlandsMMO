// Versioned save schema. The same shape backs IndexedDB now (Phases 1–5) and
// PostgreSQL later (Phase 6), so it is deliberately plain and serialisable.
// Every version bump adds a migration step; migrate() walks old saves forward.
//
// v1 → v2 (Phase 3): characters gained combat progression (level/xp/gold),
// inventory + equipment, and discovered Waystones; the save gained an account
// block (Path Points).
// v2 → v3 (Phase 4): characters gained a quest log (active quests + progress +
// turned-in ids).
// v3 → v4 (Phase 4): characters gained profession skills (1–100 each) and a
// material stash (gathered ore/herbs/fish, counted by id).
// v4 → v5 (Phase 4): characters gained a consumables stash (crafted potions/elixirs).

import { WORLD_SEED } from '../core/constants.js';
import type { ItemDef } from '../data/items.js';
import type { QuestLogState } from '../quests/log.js';

export const SAVE_VERSION = 5;

export interface SettingsV1 {
  viewDistance: number;
  masterVolume: number;
}

export interface ItemStackSave {
  item: ItemDef;
  qty: number;
}

export interface CharacterSaveV2 {
  id: string;
  name: string;
  /** CharacterClass id ('warrior' | 'ranger' | 'priest' | 'mage'). */
  class: string;
  appearance: { skin: number; hair: number };
  /** Character level (1–30). */
  level: number;
  /** Total lifetime XP (level is derived, but stored for convenience). */
  xp: number;
  gold: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  inventory: ItemStackSave[];
  /** Equip slot id → item. */
  equipment: Record<string, ItemDef>;
  /** Ids of Waystones the character has activated. */
  discoveredWaystones: string[];
}

export interface CharacterSaveV3 extends CharacterSaveV2 {
  /** Quest log: active quests + objective progress + turned-in ids (GDD §8). */
  quests: QuestLogState;
}

export interface CharacterSaveV4 extends CharacterSaveV3 {
  /** Profession skill 1–100 by profession id (GDD §9). */
  professions: Record<string, number>;
  /** Gathered materials counted by material id. */
  materials: Record<string, number>;
}

export interface CharacterSaveV5 extends CharacterSaveV4 {
  /** Crafted consumables (potions/elixirs) counted by consumable id. */
  consumables: Record<string, number>;
}

export interface AccountSaveV2 {
  /** Account-wide Path Points (GDD §10). */
  pathPoints: number;
}

export interface SaveGameV5 {
  version: 5;
  worldSeed: number;
  account: AccountSaveV2;
  characters: CharacterSaveV5[];
  settings: SettingsV1;
  /** Sim tick at last save (no wall-clock in the schema itself). */
  updatedAtTick: number;
}

/** The current save shape (alias bumps with SAVE_VERSION). */
export type SaveGame = SaveGameV5;
export type CharacterSave = CharacterSaveV5;

const DEFAULT_SKILLS = (): Record<string, number> => ({
  mining: 1,
  herbalism: 1,
  fishing: 1,
  blacksmithing: 1,
  alchemy: 1,
});

export const DEFAULT_SETTINGS: SettingsV1 = {
  viewDistance: 8,
  masterVolume: 0.8,
};

export function createNewSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    worldSeed: WORLD_SEED,
    account: { pathPoints: 0 },
    characters: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAtTick: 0,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function itemStacks(v: unknown): ItemStackSave[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is { item: ItemDef; qty?: unknown } => isRecord(s) && isRecord(s.item))
    .map((s) => ({ item: s.item, qty: Math.max(1, Math.floor(num(s.qty, 1))) }));
}

function equipment(v: unknown): Record<string, ItemDef> {
  const out: Record<string, ItemDef> = {};
  if (!isRecord(v)) return out;
  for (const [slot, item] of Object.entries(v)) {
    if (isRecord(item)) out[slot] = item as unknown as ItemDef;
  }
  return out;
}

function questLog(v: unknown): QuestLogState {
  if (!isRecord(v)) return { active: [], turnedIn: [] };
  const active = Array.isArray(v.active) ? v.active : [];
  return {
    active: active
      .filter((p): p is Record<string, unknown> => isRecord(p) && typeof p.id === 'string')
      .map((p) => ({
        id: str(p.id, ''),
        counts: Array.isArray(p.counts)
          ? p.counts.map((c) => Math.max(0, Math.floor(num(c, 0))))
          : [],
        pinned: p.pinned === true,
      })),
    turnedIn: strArray(v.turnedIn),
  };
}

function skillMap(v: unknown): Record<string, number> {
  const out = DEFAULT_SKILLS();
  if (isRecord(v)) {
    for (const [k, val] of Object.entries(v)) {
      if (k in out) out[k] = Math.max(1, Math.min(100, Math.floor(num(val, 1))));
    }
  }
  return out;
}

function materialMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(v)) {
    for (const [k, val] of Object.entries(v)) {
      const n = Math.floor(num(val, 0));
      if (n > 0) out[k] = n;
    }
  }
  return out;
}

function migrateCharacter(v: unknown): CharacterSaveV5 | null {
  if (!isRecord(v)) return null;
  const app = isRecord(v.appearance) ? v.appearance : {};
  return {
    id: str(v.id, ''),
    name: str(v.name, 'Wayfarer'),
    class: str(v.class, 'warrior'),
    appearance: { skin: num(app.skin, 0), hair: num(app.hair, 0) },
    level: Math.max(1, Math.floor(num(v.level, 1))),
    xp: Math.max(0, Math.floor(num(v.xp, 0))),
    gold: Math.max(0, Math.floor(num(v.gold, 0))),
    x: num(v.x, 0),
    y: num(v.y, 0),
    z: num(v.z, 0),
    yaw: num(v.yaw, 0),
    inventory: itemStacks(v.inventory),
    equipment: equipment(v.equipment),
    discoveredWaystones: strArray(v.discoveredWaystones),
    quests: questLog(v.quests),
    professions: skillMap(v.professions),
    materials: materialMap(v.materials),
    consumables: materialMap(v.consumables),
  };
}

/**
 * Bring any prior save shape up to the current version, filling defaults for
 * missing fields. Returns a fresh, valid SaveGame. Throws only if `raw` is not
 * an object at all (unrecoverable).
 */
export function migrate(raw: unknown): SaveGame {
  if (!isRecord(raw)) {
    throw new Error('Save data is not an object; cannot migrate.');
  }

  const settings = isRecord(raw.settings) ? raw.settings : {};
  const account = isRecord(raw.account) ? raw.account : {};
  const chars = Array.isArray(raw.characters) ? raw.characters : [];

  return {
    version: SAVE_VERSION,
    worldSeed: num(raw.worldSeed, WORLD_SEED),
    account: { pathPoints: Math.max(0, Math.floor(num(account.pathPoints, 0))) },
    characters: chars.map(migrateCharacter).filter((c): c is CharacterSaveV5 => c !== null),
    settings: {
      viewDistance: num(settings.viewDistance, DEFAULT_SETTINGS.viewDistance),
      masterVolume: num(settings.masterVolume, DEFAULT_SETTINGS.masterVolume),
    },
    updatedAtTick: num(raw.updatedAtTick, 0),
  };
}

/** Round-trip safety: serialise then re-migrate to guarantee a canonical save. */
export function normalizeSave(save: SaveGame): SaveGame {
  return migrate(JSON.parse(JSON.stringify(save)));
}

/** A fresh level-1 character at the Brookhollow spawn. */
export function createCharacter(
  id: string,
  name: string,
  cls: string,
  appearance: { skin: number; hair: number },
  x: number,
  y: number,
  z: number,
): CharacterSaveV5 {
  return {
    id,
    name,
    class: cls,
    appearance,
    level: 1,
    xp: 0,
    gold: 0,
    x,
    y,
    z,
    yaw: 0,
    inventory: [],
    equipment: {},
    discoveredWaystones: [],
    quests: { active: [], turnedIn: [] },
    professions: DEFAULT_SKILLS(),
    materials: {},
    consumables: {},
  };
}
