// Local persistence for Phases 1–5 (ARCH §6): the versioned SaveGame in IndexedDB,
// with a rotating ring of backups and corruption recovery on load. The same schema
// decomposes into PostgreSQL in Phase 6. Dependency-free IDB wrapper (no idb-keyval).
//
// Resilience (Phase 5): every write rotates the previous primary through a 3-deep
// backup ring, and load() falls through primary → backups (newest first) using the
// never-throwing tryMigrate(), so a single corrupt record can't brick a save.

import {
  createNewSave,
  normalizeSave,
  tryMigrate,
  type AccountSave,
  type CharacterSave,
  type SaveGame,
} from '@pathlands/shared';

type Settings = SaveGame['settings'];

const DB_NAME = 'pathlands';
const STORE = 'kv';
const KEY = 'save';
// Newest-first ring: on each write the primary shifts into bak.0, bak.0 → bak.1, …
const BACKUP_KEYS = ['save.bak.0', 'save.bak.1', 'save.bak.2'] as const;

let memoryFallback: SaveGame | null = null;
// Set by loadSave() when it had to recover from a backup; the UI surfaces a notice.
let recoveredFromBackup = false;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the save (migrated), recovering from a backup if the primary record is
 * corrupt. Returns a fresh save if nothing is recoverable. Falls back to the
 * in-memory copy (or a fresh save) if IndexedDB itself is unavailable.
 */
export async function loadSave(): Promise<SaveGame> {
  recoveredFromBackup = false;
  try {
    const db = await openDB();
    const primary = await idbGet(db, KEY);
    if (primary === undefined || primary === null) return createNewSave();

    const migrated = tryMigrate(primary);
    if (migrated) return migrated;

    // Primary is corrupt/unreadable — walk the backup ring newest-first.
    for (const key of BACKUP_KEYS) {
      const candidate = tryMigrate(await idbGet(db, key));
      if (candidate) {
        recoveredFromBackup = true;
        return candidate;
      }
    }
    // Nothing survived; keep the game playable rather than crash on boot.
    return memoryFallback ?? createNewSave();
  } catch {
    return memoryFallback ?? createNewSave();
  }
}

/** Whether the most recent loadSave() had to fall back to a backup copy. */
export function wasSaveRecovered(): boolean {
  return recoveredFromBackup;
}

async function rotateBackups(db: IDBDatabase, prev: unknown): Promise<void> {
  // Shift the ring down (oldest drops off) then park the outgoing primary at bak.0.
  for (let i = BACKUP_KEYS.length - 1; i > 0; i--) {
    const older = await idbGet(db, BACKUP_KEYS[i - 1]!);
    if (older !== undefined && older !== null) await idbSet(db, BACKUP_KEYS[i]!, older);
  }
  await idbSet(db, BACKUP_KEYS[0]!, prev);
}

/** Persist the save (canonicalised), rotating the previous copy into the backup ring. */
export async function persistSave(save: SaveGame): Promise<void> {
  const canonical = normalizeSave(save);
  memoryFallback = canonical;
  try {
    const db = await openDB();
    const prev = await idbGet(db, KEY);
    if (prev !== undefined && prev !== null) await rotateBackups(db, prev);
    await idbSet(db, KEY, canonical);
  } catch {
    // Memory fallback already updated; nothing else we can do headless/private-mode.
  }
}

/** Insert or replace a character by id, then persist (used by autosave). */
export async function upsertCharacter(c: CharacterSave): Promise<void> {
  const save = await loadSave();
  const i = save.characters.findIndex((x) => x.id === c.id);
  if (i >= 0) save.characters[i] = c;
  else save.characters.push(c);
  await persistSave(save);
}

/** Replace the account block (shared Path Points + perks), then persist. */
export async function upsertAccount(account: AccountSave): Promise<void> {
  const save = await loadSave();
  save.account = account;
  await persistSave(save);
}

/** Merge a partial settings change (view distance, volume, graphics, keybinds) and persist. */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const save = await loadSave();
  save.settings = { ...save.settings, ...patch };
  await persistSave(save);
}

/**
 * Persist a character and the account together in one read-modify-write, so an
 * autosave never races the two into different `loadSave()` snapshots.
 */
export async function upsertCharacterAndAccount(
  c: CharacterSave,
  account: AccountSave,
): Promise<void> {
  const save = await loadSave();
  const i = save.characters.findIndex((x) => x.id === c.id);
  if (i >= 0) save.characters[i] = c;
  else save.characters.push(c);
  save.account = account;
  await persistSave(save);
}

/** Serialise the whole save to a JSON string the player can download as a backup. */
export async function exportSave(): Promise<string> {
  const save = await loadSave();
  return JSON.stringify(normalizeSave(save), null, 2);
}

/**
 * Restore a save from an exported JSON string. Validates via the same defensive
 * migrator; on success the imported save becomes the primary (and the previous
 * one rotates into the backup ring). Returns false on unusable input.
 */
export async function importSave(json: string): Promise<boolean> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  const restored = tryMigrate(parsed);
  if (!restored) return false;
  await persistSave(restored);
  return true;
}
