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
// v5 → v6 (Phase 4): characters gained Deed progress; the account gained Path perks.
// v6 → v7 (Phase 4): characters gained owned mounts + the active mount skin.
// v7 → v8 (Phase 4): characters gained the Waymeet bank vault + a mail inbox.
// v8 → v9 (Phase 4): characters gained the daily-bounty log (day + active + done).
// v9 → v10 (Phase 4): Path Points + perks moved from the character to the ACCOUNT
// (shared across all local characters); per-character meta is folded in on upgrade.

import { WORLD_SEED } from '../core/constants.js';
import type { ItemDef } from '../data/items.js';
import type { MailLetterSave } from '../data/mail.js';
import { starterInbox } from '../data/mail.js';
import { defaultKeybinds, DEFAULT_KEYBINDS } from '../data/keybinds.js';
import type { QuestLogState } from '../quests/log.js';
import type { DeedState } from '../meta/deeds.js';

// v10 → v11 (Phase 4): settings gained the rebindable keybind map.
export const SAVE_VERSION = 12;

export interface SettingsV1 {
  viewDistance: number;
  masterVolume: number;
  /** Rebindable action → KeyboardEvent.code (GDD §14; defaults in data/keybinds). */
  keybinds: Record<string, string>;
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

export interface CharacterSaveV6 extends CharacterSaveV5 {
  /** Deed progress + completed deed ids (GDD §10). */
  deeds: DeedState;
  /** Path Points earned from Deeds (account-wide in Phase 6; per-character now). */
  pathPoints: number;
  /** Purchased Path perks: rank by perk id. */
  perks: Record<string, number>;
}

export interface CharacterSaveV7 extends CharacterSaveV6 {
  /** Owned mount + skin ids (GDD §7); the base Wolf plus any Deed-unlocked skins. */
  mounts: string[];
  /** The mount skin the player currently rides, or null if none is chosen. */
  activeMount: string | null;
}

export interface CharacterSaveV8 extends CharacterSaveV7 {
  /** Waymeet vault contents (shared storage, up to BANK_SIZE). */
  bank: ItemStackSave[];
  /** Mail inbox: letters from world NPCs with optional (claimable) gold gifts. */
  mail: MailLetterSave[];
}

/** Daily-bounty log: the day it was set, accepted bounties, and today's completions. */
export interface BountyLogSave {
  /** Day index the log belongs to; a newer day resets active + completed. */
  day: number;
  active: Array<{ id: string; count: number }>;
  /** Bounty ids turned in today (drives the board's "done" state). */
  completed: string[];
}

export interface CharacterSaveV9 extends CharacterSaveV8 {
  /** Daily bounties (GDD §11): accepted tasks + today's completions. */
  bounties: BountyLogSave;
}

/**
 * v10 moved Path Points + perks off the character and onto the account, so they
 * apply across all local characters (GDD §10). Deeds stay per-character (each
 * earns its own), but the Points they award — and the perks bought with them —
 * are shared.
 */
export type CharacterSaveV10 = Omit<CharacterSaveV9, 'pathPoints' | 'perks'>;

/** v11→v12: characters remember the discovery recipes they have learned (GDD §9). */
export interface CharacterSaveV11 extends CharacterSaveV10 {
  /** Learned discovery-recipe ids (advanced recipes hidden until discovered). */
  learnedRecipes: string[];
}

export interface AccountSaveV2 {
  /** Account-wide Path Points (GDD §10; the Phase-6 home for the per-character pool). */
  pathPoints: number;
}

export interface AccountSaveV3 extends AccountSaveV2 {
  /** Account-wide Path perks: rank by perk id (shared across all characters). */
  perks: Record<string, number>;
}

export interface SaveGameV12 {
  version: 12;
  worldSeed: number;
  account: AccountSaveV3;
  characters: CharacterSaveV11[];
  settings: SettingsV1;
  /** Sim tick at last save (no wall-clock in the schema itself). */
  updatedAtTick: number;
}

/** The current save shape (alias bumps with SAVE_VERSION). */
export type SaveGame = SaveGameV12;
export type CharacterSave = CharacterSaveV11;
export type AccountSave = AccountSaveV3;

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
  keybinds: defaultKeybinds(),
};

export function createNewSave(): SaveGame {
  return {
    version: SAVE_VERSION,
    worldSeed: WORLD_SEED,
    account: { pathPoints: 0, perks: {} },
    characters: [],
    settings: { ...DEFAULT_SETTINGS, keybinds: defaultKeybinds() },
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

function keybinds(v: unknown): Record<string, string> {
  const out = defaultKeybinds();
  if (isRecord(v)) {
    for (const action of Object.keys(DEFAULT_KEYBINDS)) {
      const code = v[action];
      if (typeof code === 'string' && code.length > 0) out[action] = code;
    }
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

function mailInbox(v: unknown): MailLetterSave[] {
  if (!Array.isArray(v)) return starterInbox();
  return v
    .filter((m): m is Record<string, unknown> => isRecord(m) && typeof m.id === 'string')
    .map((m) => ({
      id: str(m.id, ''),
      sender: str(m.sender, 'Unknown'),
      subject: str(m.subject, ''),
      body: str(m.body, ''),
      ...(typeof m.gold === 'number' && m.gold > 0 ? { gold: Math.floor(m.gold) } : {}),
      claimed: m.claimed === true,
    }));
}

function bountyLog(v: unknown): BountyLogSave {
  if (!isRecord(v)) return { day: 0, active: [], completed: [] };
  const active = Array.isArray(v.active)
    ? v.active
        .filter((a): a is Record<string, unknown> => isRecord(a) && typeof a.id === 'string')
        .map((a) => ({ id: str(a.id, ''), count: Math.max(0, Math.floor(num(a.count, 0))) }))
    : [];
  return { day: Math.floor(num(v.day, 0)), active, completed: strArray(v.completed) };
}

function deedState(v: unknown): DeedState {
  if (!isRecord(v)) return { progress: {}, completed: [] };
  const progress: Record<string, number> = {};
  if (isRecord(v.progress)) {
    for (const [k, val] of Object.entries(v.progress)) {
      const n = Math.floor(num(val, 0));
      if (n > 0) progress[k] = n;
    }
  }
  return { progress, completed: strArray(v.completed) };
}

function migrateCharacter(v: unknown): CharacterSaveV11 | null {
  if (!isRecord(v)) return null;
  const app = isRecord(v.appearance) ? v.appearance : {};
  // Note: pathPoints/perks are intentionally NOT read here — since v10 they live on
  // the account (folded in by migrate() below), not the character.
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
    deeds: deedState(v.deeds),
    mounts: strArray(v.mounts),
    activeMount: typeof v.activeMount === 'string' ? v.activeMount : null,
    bank: itemStacks(v.bank),
    mail: mailInbox(v.mail),
    bounties: bountyLog(v.bounties),
    learnedRecipes: strArray(v.learnedRecipes),
  };
}

/**
 * The account Path-Point/perk pool, folding any pre-v10 per-character meta into
 * it: the highest Path-Point pool and the union (max rank) of perks bought on any
 * character become the shared account state, so no progress is lost on upgrade.
 */
function accountMeta(account: Record<string, unknown>, rawChars: unknown[]): AccountSaveV3 {
  let pathPoints = Math.max(0, Math.floor(num(account.pathPoints, 0)));
  const perks = materialMap(account.perks);
  for (const rc of rawChars) {
    if (!isRecord(rc)) continue;
    pathPoints = Math.max(pathPoints, Math.floor(num(rc.pathPoints, 0)));
    for (const [id, rank] of Object.entries(materialMap(rc.perks))) {
      perks[id] = Math.max(perks[id] ?? 0, rank);
    }
  }
  return { pathPoints, perks };
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
    account: accountMeta(account, chars),
    characters: chars.map(migrateCharacter).filter((c): c is CharacterSaveV11 => c !== null),
    settings: {
      viewDistance: num(settings.viewDistance, DEFAULT_SETTINGS.viewDistance),
      masterVolume: num(settings.masterVolume, DEFAULT_SETTINGS.masterVolume),
      keybinds: keybinds(settings.keybinds),
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
): CharacterSaveV11 {
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
    deeds: { progress: {}, completed: [] },
    mounts: [],
    activeMount: null,
    bank: [],
    mail: starterInbox(),
    bounties: { day: 0, active: [], completed: [] },
    learnedRecipes: [],
  };
}
