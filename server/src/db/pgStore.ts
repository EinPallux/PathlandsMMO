// PostgreSQL implementation of the `Store` interface (ARCH §8). Drops in for the FileStore when
// DATABASE_URL is set — the shared account/character contract is identical, so the gateway and
// auth API are unchanged. Accounts + characters persist here; content tables (items/enemies/
// quests) are added in the content-repository slice and edited by the future admin editor.
//
// Testable without a live server via pg-mem (see db.test.ts) — the same contract that MemoryStore
// passes, run against real SQL.

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { CharacterSave } from '@pathlands/shared';
import { normalizeEmail, type Account, type Store } from '../store.js';
import { SCHEMA_SQL } from './schema.js';

/** A minimal query surface — satisfied by pg.Pool and by pg-mem's adapter Pool alike. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
}

interface AccountRow {
  id: string;
  email: string;
  password_hash: string;
  is_gm: boolean;
  is_banned: boolean;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    isGm: row.is_gm === true,
    isBanned: row.is_banned === true,
  };
}

const ACCOUNT_COLS = 'id, email, password_hash, is_gm, is_banned';

export class PgStore implements Store {
  private constructor(private readonly db: Queryable) {}

  /** Open a pool on `connectionString` and apply the schema. */
  static async open(connectionString: string): Promise<PgStore> {
    const pool = new pg.Pool({ connectionString });
    return PgStore.fromPool(pool as unknown as Queryable);
  }

  /** Build on an injected pool (production pg.Pool, or a pg-mem adapter in tests) + migrate. */
  static async fromPool(db: Queryable): Promise<PgStore> {
    const store = new PgStore(db);
    await db.query(SCHEMA_SQL);
    return store;
  }

  async createAccount(email: string, passwordHash: string): Promise<Account | null> {
    const key = normalizeEmail(email);
    // Check-then-insert (the fast path + the taken-email contract). The UNIQUE constraint is the
    // real guard against a concurrent-registration race — a duplicate INSERT throws, which the
    // catch maps to null, so two simultaneous sign-ups can never both succeed.
    if (await this.getByEmail(key)) return null;
    try {
      const res = await this.db.query(
        `INSERT INTO accounts (id, email, password_hash) VALUES ($1, $2, $3)
         RETURNING ${ACCOUNT_COLS}`,
        [randomUUID(), key, passwordHash],
      );
      return res.rowCount ? toAccount(res.rows[0] as AccountRow) : null;
    } catch {
      return null; // unique violation on a race
    }
  }

  async getByEmail(email: string): Promise<Account | null> {
    const res = await this.db.query(`SELECT ${ACCOUNT_COLS} FROM accounts WHERE email = $1`, [
      normalizeEmail(email),
    ]);
    return res.rowCount ? toAccount(res.rows[0] as AccountRow) : null;
  }

  async getById(id: string): Promise<Account | null> {
    const res = await this.db.query(`SELECT ${ACCOUNT_COLS} FROM accounts WHERE id = $1`, [id]);
    return res.rowCount ? toAccount(res.rows[0] as AccountRow) : null;
  }

  async setGm(accountId: string, isGm: boolean): Promise<void> {
    await this.db.query('UPDATE accounts SET is_gm = $2 WHERE id = $1', [accountId, isGm]);
  }

  async setBanned(accountId: string, isBanned: boolean): Promise<void> {
    await this.db.query('UPDATE accounts SET is_banned = $2 WHERE id = $1', [accountId, isBanned]);
  }

  async putCharacter(accountId: string, character: CharacterSave): Promise<void> {
    // Upsert: the full blob in `data`, with identity/position/progression promoted to columns.
    await this.db.query(
      `INSERT INTO characters (account_id, name, class, level, xp, x, y, z, yaw, data, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (account_id) DO UPDATE SET
         name = EXCLUDED.name, class = EXCLUDED.class, level = EXCLUDED.level, xp = EXCLUDED.xp,
         x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, yaw = EXCLUDED.yaw,
         data = EXCLUDED.data, updated_at = now()`,
      [
        accountId,
        character.name,
        character.class,
        character.level,
        character.xp,
        character.x,
        character.y,
        character.z,
        character.yaw,
        JSON.stringify(character),
      ],
    );
  }

  async getCharacter(accountId: string): Promise<CharacterSave | null> {
    const res = await this.db.query('SELECT data FROM characters WHERE account_id = $1', [
      accountId,
    ]);
    if (!res.rowCount) return null;
    const { data } = res.rows[0] as { data: CharacterSave | string };
    // node-pg parses jsonb to an object; pg-mem may hand back a string — accept both.
    return typeof data === 'string' ? (JSON.parse(data) as CharacterSave) : data;
  }

  async close(): Promise<void> {
    await this.db.end();
  }
}
