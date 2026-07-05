// Local persistence for Phases 1–5 (ARCH §6): the versioned SaveGame in IndexedDB,
// with one rotating backup and a migrate() pass on load. The same schema decomposes
// into PostgreSQL in Phase 6. Dependency-free IDB wrapper (no idb-keyval).

import {
  createNewSave,
  migrate,
  normalizeSave,
  type AccountSave,
  type CharacterSave,
  type SaveGame,
} from '@pathlands/shared';

const DB_NAME = 'pathlands';
const STORE = 'kv';
const KEY = 'save';
const BACKUP_KEY = 'save.bak';

let memoryFallback: SaveGame | null = null;

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

/** Load the save (migrated), or a fresh one. Falls back to memory if IDB is unavailable. */
export async function loadSave(): Promise<SaveGame> {
  try {
    const db = await openDB();
    const raw = await idbGet(db, KEY);
    if (raw === undefined || raw === null) return createNewSave();
    return migrate(raw);
  } catch {
    return memoryFallback ?? createNewSave();
  }
}

/** Persist the save (canonicalised), rotating the previous copy into a backup. */
export async function persistSave(save: SaveGame): Promise<void> {
  const canonical = normalizeSave(save);
  memoryFallback = canonical;
  try {
    const db = await openDB();
    const prev = await idbGet(db, KEY);
    if (prev !== undefined && prev !== null) await idbSet(db, BACKUP_KEY, prev);
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
