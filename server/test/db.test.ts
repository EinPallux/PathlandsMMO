// PgStore contract tests, run against pg-mem (an in-memory Postgres) so the real SQL —
// schema, upserts, ON CONFLICT, jsonb round-trip, the promoted identity columns — is exercised
// headlessly, the same account/character contract MemoryStore passes.

import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { createCharacter, type CharacterSave } from '@pathlands/shared';
import { PgStore, type Queryable } from '../src/db/pgStore.js';

function sampleCharacter(name = 'Alia'): CharacterSave {
  return createCharacter('c1', name, 'ranger', { skin: 0, hair: 0 }, 100, 64, 200);
}

/** A fresh PgStore backed by an isolated in-memory Postgres, plus the raw pool for assertions. */
async function freshStore(): Promise<{ store: PgStore; pool: Queryable }> {
  const db = newDb();
  const { Pool } = db.adapters.createPg() as { Pool: new () => Queryable };
  const pool = new Pool();
  const store = await PgStore.fromPool(pool);
  return { store, pool };
}

describe('PgStore (pg-mem)', () => {
  it('creates accounts, normalises the email, and rejects duplicates', async () => {
    const { store } = await freshStore();
    const a = await store.createAccount('  Alia@Example.com ', 'hash');
    expect(a).not.toBeNull();
    expect(a!.email).toBe('alia@example.com'); // normalised
    expect(await store.createAccount('alia@example.com', 'hash2')).toBeNull(); // email taken
    expect((await store.getByEmail('ALIA@EXAMPLE.COM'))?.id).toBe(a!.id);
    expect((await store.getById(a!.id))?.email).toBe('alia@example.com');
    expect((await store.getById(a!.id))?.passwordHash).toBe('hash');
  });

  it('round-trips a character blob (null before, upsert after)', async () => {
    const { store } = await freshStore();
    const acct = (await store.createAccount('e@e.com', 'h'))!;
    expect(await store.getCharacter(acct.id)).toBeNull();
    await store.putCharacter(acct.id, sampleCharacter('Boro'));
    const got = await store.getCharacter(acct.id);
    expect(got?.name).toBe('Boro');
    expect(got?.class).toBe('ranger');
    // Upsert (not duplicate) on a second put — the row is replaced, still one character.
    await store.putCharacter(acct.id, { ...sampleCharacter('Boro'), level: 7, xp: 5000 });
    expect((await store.getCharacter(acct.id))?.level).toBe(7);
  });

  it('promotes identity + position to queryable columns (for a future admin editor)', async () => {
    const { store, pool } = await freshStore();
    const acct = (await store.createAccount('col@e.com', 'h'))!;
    await store.putCharacter(acct.id, { ...sampleCharacter('Colly'), level: 12, x: 150, z: 250 });
    const res = await pool.query(
      'SELECT name, class, level, x, z FROM characters WHERE account_id = $1',
      [acct.id],
    );
    const row = res.rows[0] as { name: string; class: string; level: number; x: number; z: number };
    expect(row.name).toBe('Colly');
    expect(row.class).toBe('ranger');
    expect(Number(row.level)).toBe(12);
    expect(Number(row.x)).toBe(150);
    expect(Number(row.z)).toBe(250);
  });
});
