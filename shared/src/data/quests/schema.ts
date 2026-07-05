// Quest schema (GDD §8). Data-driven and typed: quest definitions are declarative
// data in `content.ts`; the pure state machine in `shared/quests` interprets them.
// No DOM, no wall-clock — the same defs drive the Phase-6 server.

import type { GeneratedItemSpec } from '../items.js';

/** The eight objective kinds (GDD §8). */
export type ObjectiveKind =
  | 'kill' // slay `count` of an enemy id
  | 'collect' // gather `count` of a drop tag (from kills/loot)
  | 'gather' // gather `count` from world nodes (professions, Phase 4b)
  | 'deliver' // bring an item to an NPC (completes on talk to `target`)
  | 'talk' // speak with NPC id `target`
  | 'explore' // reach an area (`x,z` within `radius`)
  | 'use' // use a world object id `target` (e.g. a Waystone)
  | 'boss'; // slay a specific boss enemy id

export interface Objective {
  kind: ObjectiveKind;
  /** Target key by kind: enemyId | dropTag | npcId | areaId | objectId. */
  target: string;
  /** How many are required (default 1). */
  count?: number;
  /** Tracker label, e.g. "Thornback Boars slain". */
  label: string;
  /** Explore objectives: the area centre + reach radius (world coords). */
  x?: number;
  z?: number;
  radius?: number;
}

export interface QuestReward {
  xp: number;
  gold?: number;
  /** Items granted to everyone who completes the quest. */
  items?: GeneratedItemSpec[];
  /** Player picks exactly one of these (class-filtered at grant time). */
  choices?: GeneratedItemSpec[];
  /** A Waystone unlocked on completion (main-story chapters). */
  waystoneUnlock?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  /** Main-story chapter (1–6), or undefined for side/system quests. */
  chapter?: number;
  /** Chain/arc id for grouping a multi-quest arc; undefined = standalone. */
  chain?: string;
  /** NPC id that offers the quest. */
  giver: string;
  /** NPC id to turn in to (defaults to the giver). */
  turnIn?: string;
  /** Minimum level to accept. */
  minLevel: number;
  /** Quest ids that must be turned in before this becomes available. */
  prereq?: string[];
  objectives: Objective[];
  reward: QuestReward;
  /** Giver's offer text. */
  intro: string;
  /** Shown while in progress (giver "?" grey). */
  progress: string;
  /** Turn-in text (giver "?" yellow). */
  complete: string;
  /** Marks a repeatable daily bounty (Phase 4b). */
  repeatable?: boolean;
}

/** A named quest-giver NPC, placed deterministically in the world. */
export interface QuestGiver {
  id: string;
  name: string;
  /** Home settlement id (from settlements.ts) — the client anchors them here. */
  settlement: string;
  /** Offset from the settlement plaza centre (metres), so givers don't overlap. */
  dx: number;
  dz: number;
  /** NPC model kind + palette seed for the voxel build. */
  seed: number;
}
