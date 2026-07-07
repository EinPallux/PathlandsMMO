// ContentStore: game content (enemies/quests/NPCs/recipes) seeds into Postgres from shared/data
// on first boot, is idempotent on a re-seed, and round-trips upsert/get — the editable source a
// future admin/map editor writes to. Run against pg-mem (real SQL, headless).

import { describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { ENEMIES, QUESTS, QUEST_GIVERS, RECIPES } from '@pathlands/shared';
import { PgStore, type Queryable } from '../src/db/pgStore.js';
import { ContentStore } from '../src/db/contentStore.js';

/** A fresh in-memory Postgres with the schema applied (PgStore.fromPool runs the DDL). */
async function fresh(): Promise<ContentStore> {
  const db = newDb();
  const { Pool } = db.adapters.createPg() as { Pool: new () => Queryable };
  const pool = new Pool();
  await PgStore.fromPool(pool); // applies the schema (incl. the content table)
  return new ContentStore(pool);
}

describe('ContentStore (pg-mem)', () => {
  it('seeds every content kind from shared/data on first boot', async () => {
    const content = await fresh();
    const seeded = await content.seedFromShared();
    expect(seeded.enemy).toBe(ENEMIES.length);
    expect(seeded.quest).toBe(QUESTS.length);
    expect(seeded.npc).toBe(QUEST_GIVERS.length);
    expect(seeded.recipe).toBe(RECIPES.length);
    // The rows are actually there + the def round-trips through jsonb.
    expect((await content.getAll('enemy')).length).toBe(ENEMIES.length);
    const anEnemy = ENEMIES[0]!;
    expect(await content.get('enemy', anEnemy.id)).toEqual(anEnemy);
  });

  it('is idempotent: a second seed adds nothing (never clobbers editor edits)', async () => {
    const content = await fresh();
    await content.seedFromShared();
    const second = await content.seedFromShared();
    expect(second.enemy).toBe(0);
    expect(second.quest).toBe(0);
    expect(second.npc).toBe(0);
    expect(second.recipe).toBe(0);
  });

  it('upserts an edited entity (the admin editor save path)', async () => {
    const content = await fresh();
    await content.seedFromShared();
    const id = ENEMIES[0]!.id;
    const edited = { ...ENEMIES[0]!, name: 'Edited Boss', maxHP: 99999 };
    await content.upsert('enemy', id, edited.name, edited);
    const got = (await content.get<typeof edited>('enemy', id))!;
    expect(got.name).toBe('Edited Boss');
    expect(got.maxHP).toBe(99999);
    // Still exactly one row for that id (upsert, not insert).
    expect((await content.getAll('enemy')).filter((r) => r.id === id)).toHaveLength(1);
  });
});
