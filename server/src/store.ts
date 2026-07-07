// Account + character persistence. The `Store` interface is async so a PostgreSQL
// implementation (Phase-6 scale, ARCH §8) can drop in unchanged; the shipped default is
// a dependency-free durable `FileStore` (JSON on disk, atomic writes) which is plenty for
// a first launch and needs nothing but a mounted volume. `MemoryStore` backs the tests.
//
// Characters are stored as the opaque `CharacterSave` blob (the same versioned schema the
// client uses locally — a cloud save). The server owns and overwrites the authoritative
// position; the rest of the blob is client-authoritative until those systems move
// server-side, and is re-validated at the HTTP boundary before it is ever stored.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CharacterSave } from '@pathlands/shared';

export interface Account {
  id: string;
  email: string;
  passwordHash: string;
  /** GM privilege — gates the /kick /ban /teleport /give tooling. */
  isGm: boolean;
  /** Banned accounts are refused at login (GM tooling). */
  isBanned: boolean;
}

export interface Store {
  /** Create an account, or return null if the (normalised) email is already taken. */
  createAccount(email: string, passwordHash: string): Promise<Account | null>;
  getByEmail(email: string): Promise<Account | null>;
  getById(id: string): Promise<Account | null>;
  /** Store (overwrite) the account's character blob. */
  putCharacter(accountId: string, character: CharacterSave): Promise<void>;
  getCharacter(accountId: string): Promise<CharacterSave | null>;
  /** GM tooling: set an account's GM privilege / banned flag (persisted). */
  setGm(accountId: string, isGm: boolean): Promise<void>;
  setBanned(accountId: string, isBanned: boolean): Promise<void>;
  /** Flush any pending writes and release resources. */
  close(): Promise<void>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** In-memory store — the base for tests and the substrate FileStore persists. */
export class MemoryStore implements Store {
  protected readonly byId = new Map<string, Account>();
  protected readonly byEmail = new Map<string, string>(); // email → id
  protected readonly characters = new Map<string, CharacterSave>();

  createAccount(email: string, passwordHash: string): Promise<Account | null> {
    const key = normalizeEmail(email);
    if (this.byEmail.has(key)) return Promise.resolve(null);
    const account: Account = {
      id: randomUUID(),
      email: key,
      passwordHash,
      isGm: false,
      isBanned: false,
    };
    this.byId.set(account.id, account);
    this.byEmail.set(key, account.id);
    this.onMutate();
    return Promise.resolve(account);
  }

  setGm(accountId: string, isGm: boolean): Promise<void> {
    const a = this.byId.get(accountId);
    if (a !== undefined) {
      a.isGm = isGm;
      this.onMutate();
    }
    return Promise.resolve();
  }

  setBanned(accountId: string, isBanned: boolean): Promise<void> {
    const a = this.byId.get(accountId);
    if (a !== undefined) {
      a.isBanned = isBanned;
      this.onMutate();
    }
    return Promise.resolve();
  }

  getByEmail(email: string): Promise<Account | null> {
    const id = this.byEmail.get(normalizeEmail(email));
    return Promise.resolve(id !== undefined ? (this.byId.get(id) ?? null) : null);
  }

  getById(id: string): Promise<Account | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  putCharacter(accountId: string, character: CharacterSave): Promise<void> {
    this.characters.set(accountId, character);
    this.onMutate();
    return Promise.resolve();
  }

  getCharacter(accountId: string): Promise<CharacterSave | null> {
    return Promise.resolve(this.characters.get(accountId) ?? null);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  /** Hook for FileStore to persist after a change; no-op in memory. */
  protected onMutate(): void {}
}

interface Snapshot {
  version: 1;
  accounts: Account[];
  characters: [string, CharacterSave][];
}

const WRITE_DEBOUNCE_MS = 500;

/**
 * Durable store: MemoryStore + a debounced atomic JSON flush to `path`. Loads on start.
 * Writes go to a temp file then `rename` (atomic on POSIX), so a crash mid-write can't
 * corrupt the live file.
 */
export class FileStore extends MemoryStore {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string) {
    super();
  }

  /** Open (and load, if present) a FileStore at `path`. */
  static async open(path: string): Promise<FileStore> {
    const store = new FileStore(path);
    await store.load();
    return store;
  }

  private async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch {
      return; // fresh install — no file yet
    }
    let snap: unknown;
    try {
      snap = JSON.parse(raw);
    } catch {
      return; // corrupt file — start empty rather than crash (a backup ring is future work)
    }
    if (typeof snap !== 'object' || snap === null) return;
    const s = snap as Partial<Snapshot>;
    for (const a of s.accounts ?? []) {
      if (a && typeof a.id === 'string') {
        // Default the GM/ban flags for snapshots written before they existed.
        this.byId.set(a.id, { ...a, isGm: a.isGm ?? false, isBanned: a.isBanned ?? false });
        this.byEmail.set(a.email, a.id);
      }
    }
    for (const [id, ch] of s.characters ?? []) {
      if (typeof id === 'string' && ch) this.characters.set(id, ch);
    }
  }

  protected override onMutate(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, WRITE_DEBOUNCE_MS);
  }

  /** Write the current state to disk atomically (chained so writes never interleave). */
  flush(): Promise<void> {
    const snapshot: Snapshot = {
      version: 1,
      accounts: [...this.byId.values()],
      characters: [...this.characters.entries()],
    };
    const data = JSON.stringify(snapshot);
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, data, 'utf8');
      await rename(tmp, this.path);
    });
    return this.writing;
  }

  override async close(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
