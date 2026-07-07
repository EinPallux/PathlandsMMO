// The Postgres schema, applied idempotently on connect (CREATE TABLE IF NOT EXISTS). This is
// the source of truth for BOTH player data and — as content migrates (a future admin/map editor
// edits these rows) — the game's items / enemies / NPCs / quests. UUIDs are generated in Node
// (randomUUID), so no pgcrypto extension is needed; JSONB columns carry the rich blobs while a
// few promoted columns (name, level, position) stay queryable/editable.
//
// Migrations are additive-only here (a first-launch convenience); a real migration tool lands if
// the schema starts changing shape. Keep every statement idempotent.

export const SCHEMA_SQL = `
-- Accounts: email + password hash (scrypt). Sessions are stateless JWTs (not stored).
CREATE TABLE IF NOT EXISTS accounts (
  id            uuid PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  is_gm         boolean NOT NULL DEFAULT false,
  is_banned     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One character per account (the current scope). The full versioned CharacterSave lives in
-- \`data\` (JSONB); identity + position + progression are promoted to columns for querying and
-- for the server's authoritative position/XP write-back.
CREATE TABLE IF NOT EXISTS characters (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  name       text NOT NULL,
  class      text NOT NULL,
  level      int  NOT NULL,
  xp         bigint NOT NULL DEFAULT 0,
  x          double precision NOT NULL,
  y          double precision NOT NULL,
  z          double precision NOT NULL,
  yaw        double precision NOT NULL DEFAULT 0,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Game content — the source of truth for enemies / quests / NPCs (quest-givers) / recipes, so a
-- future admin/map editor edits ROWS here instead of TypeScript. One row per authored entity: the
-- full typed def in \`data\` (JSONB — editable), the id + a human name promoted for browsing. Items
-- are procedurally generated (loot rolls), so there is no fixed item catalog — an editor changes
-- drops by editing the enemy/loot data. Seeded from shared/data on first boot (see contentStore).
CREATE TABLE IF NOT EXISTS content (
  kind       text NOT NULL,      -- 'enemy' | 'quest' | 'npc' | 'recipe'
  id         text NOT NULL,
  name       text,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
`;
