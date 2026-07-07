// Game content in PostgreSQL (ARCH §8 / launch refocus): enemies, quests, NPCs (quest-givers) and
// recipes live as editable rows so a future admin/map editor writes to the DB, not to TypeScript.
// On first boot the content table is empty, so the server SEEDS it from the shared/data registries
// (the current authored content) — after that, Postgres is the source and the editor owns it.
//
// This slice makes the content live in Postgres + queryable/upsertable; the running sim still reads
// shared/data (the seed keeps them identical). Each system's server-authority migration reroutes its
// reads to this store. Testable via pg-mem (see content.test.ts).

import { ENEMIES, QUESTS, QUEST_GIVERS, RECIPES } from '@pathlands/shared';
import type { Queryable } from './pgStore.js';

/** The content kinds stored (one table, filtered by `kind`). */
export type ContentKind = 'enemy' | 'quest' | 'npc' | 'recipe';

/** One editable content row: the id, a human name, and the full typed def as JSON. */
export interface ContentRow<T = unknown> {
  id: string;
  name: string;
  data: T;
}

export class ContentStore {
  constructor(private readonly db: Queryable) {}

  /** Upsert one content entity (an admin editor's save path; also used by the seed). */
  async upsert(kind: ContentKind, id: string, name: string, data: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO content (kind, id, name, data, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (kind, id) DO UPDATE SET name = EXCLUDED.name, data = EXCLUDED.data, updated_at = now()`,
      [kind, id, name, JSON.stringify(data)],
    );
  }

  /** All rows of a kind (for the editor's list view / the server's startup load). */
  async getAll<T = unknown>(kind: ContentKind): Promise<ContentRow<T>[]> {
    const res = await this.db.query(
      'SELECT id, name, data FROM content WHERE kind = $1 ORDER BY id',
      [kind],
    );
    return res.rows.map((r) => {
      const row = r as { id: string; name: string | null; data: T | string };
      const data = typeof row.data === 'string' ? (JSON.parse(row.data) as T) : row.data;
      return { id: row.id, name: row.name ?? row.id, data };
    });
  }

  /** One entity's data by id, or null. */
  async get<T = unknown>(kind: ContentKind, id: string): Promise<T | null> {
    const res = await this.db.query('SELECT data FROM content WHERE kind = $1 AND id = $2', [
      kind,
      id,
    ]);
    if (!res.rowCount) return null;
    const { data } = res.rows[0] as { data: T | string };
    return typeof data === 'string' ? (JSON.parse(data) as T) : data;
  }

  /** Row count for a kind (drives the "seed only when empty" check). */
  async count(kind: ContentKind): Promise<number> {
    const res = await this.db.query('SELECT count(*)::int AS n FROM content WHERE kind = $1', [
      kind,
    ]);
    return res.rowCount ? Number((res.rows[0] as { n: number }).n) : 0;
  }

  /**
   * Populate a kind from the shared/data registry on first boot (idempotent — skipped when the
   * kind already has rows, so an editor's changes are never clobbered by a restart). Returns the
   * number of rows seeded (0 if it was already populated).
   */
  private async seedKind(
    kind: ContentKind,
    defs: readonly { id: string; name: string }[],
  ): Promise<number> {
    if ((await this.count(kind)) > 0) return 0;
    for (const def of defs) await this.upsert(kind, def.id, def.name, def);
    return defs.length;
  }

  /**
   * Seed every content kind from shared/data if empty. Run once at startup after the schema is
   * applied. Returns a per-kind count of newly-seeded rows (all 0 on a subsequent boot).
   */
  async seedFromShared(): Promise<Record<ContentKind, number>> {
    return {
      enemy: await this.seedKind('enemy', ENEMIES),
      quest: await this.seedKind('quest', QUESTS),
      npc: await this.seedKind('npc', QUEST_GIVERS),
      recipe: await this.seedKind('recipe', RECIPES),
    };
  }
}
