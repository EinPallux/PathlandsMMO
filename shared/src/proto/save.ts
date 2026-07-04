// Versioned save schema. The same shape backs IndexedDB now (Phases 1–5) and
// PostgreSQL later (Phase 6), so it is deliberately plain and serialisable.
// Every version bump adds a migration step; migrate() walks old saves forward.

import { WORLD_SEED } from '../core/constants.js';

export const SAVE_VERSION = 1;

export interface SettingsV1 {
  viewDistance: number;
  masterVolume: number;
}

export interface CharacterSaveV1 {
  id: string;
  name: string;
  /** CharacterClass id ('warrior' | 'ranger' | 'priest' | 'mage'). */
  class: string;
  appearance: { skin: number; hair: number };
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SaveGameV1 {
  version: 1;
  worldSeed: number;
  characters: CharacterSaveV1[];
  settings: SettingsV1;
  /** Sim tick at last save (no wall-clock in the schema itself). */
  updatedAtTick: number;
}

/** The current save shape (alias bumps with SAVE_VERSION). */
export type SaveGame = SaveGameV1;

export const DEFAULT_SETTINGS: SettingsV1 = {
  viewDistance: 8,
  masterVolume: 0.8,
};

export function createNewSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    worldSeed: WORLD_SEED,
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

function migrateCharacter(v: unknown): CharacterSaveV1 | null {
  if (!isRecord(v)) return null;
  const app = isRecord(v.appearance) ? v.appearance : {};
  return {
    id: str(v.id, ''),
    name: str(v.name, 'Wayfarer'),
    class: str(v.class, 'warrior'),
    appearance: { skin: num(app.skin, 0), hair: num(app.hair, 0) },
    x: num(v.x, 0),
    y: num(v.y, 0),
    z: num(v.z, 0),
    yaw: num(v.yaw, 0),
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

  // (Future: switch on raw.version and step 1→2→3… Here v1 is the origin.)
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const chars = Array.isArray(raw.characters) ? raw.characters : [];

  return {
    version: SAVE_VERSION,
    worldSeed: num(raw.worldSeed, WORLD_SEED),
    characters: chars.map(migrateCharacter).filter((c): c is CharacterSaveV1 => c !== null),
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
