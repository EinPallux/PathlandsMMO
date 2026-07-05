// Profession skill + gather resolution (GDD §9). Pure and deterministic: gathering
// takes a seeded Rng (the client forks one per action), so yields and skill-ups are
// reproducible and the Phase-6 server runs the same code. Skill 1–100, classic
// orange/yellow/green/gray skill-up curve.

import type { Rng } from '../core/rng.js';
import {
  Profession,
  SKILL_MAX,
  TIER_SKILL,
  primaryMaterial,
  type MaterialDef,
} from '../data/professions.js';

export type Difficulty = 'orange' | 'yellow' | 'green' | 'gray';

/** Skill required to gather a tier's node. */
export function tierReq(tier: number): number {
  return TIER_SKILL[Math.max(0, Math.min(TIER_SKILL.length - 1, tier))]!;
}

export function canGather(skill: number, tier: number): boolean {
  return skill >= tierReq(tier);
}

const TIER_SPAN = 25; // skill width of a tier band

/** Difficulty colour of a node at the player's skill (drives the skill-up curve). */
export function difficulty(skill: number, tier: number): Difficulty {
  const req = tierReq(tier);
  if (skill < req) return 'gray'; // can't gather — treated as no skill-up
  const over = skill - req;
  if (over >= TIER_SPAN) return 'gray';
  if (over < TIER_SPAN * 0.34) return 'orange';
  if (over < TIER_SPAN * 0.67) return 'yellow';
  return 'green';
}

/** New skill after one gather: +1 at orange/yellow, ~half at green, none at gray. */
export function skillUp(rng: Rng, skill: number, tier: number): number {
  if (skill >= SKILL_MAX) return SKILL_MAX;
  const d = difficulty(skill, tier);
  let up = 0;
  if (d === 'orange' || d === 'yellow') up = 1;
  else if (d === 'green') up = rng.next() < 0.5 ? 1 : 0;
  return Math.min(SKILL_MAX, skill + up);
}

export interface GatherYield {
  materialId: string;
  qty: number;
}

export interface GatherResult {
  yields: GatherYield[];
  /** Skill after the gather (>= input skill). */
  newSkill: number;
}

/**
 * Resolve mining/herbalism at a node of `tier` for a player of `skill`. Returns null
 * if the node is above the player's skill. Mining adds a stone byproduct and a rare
 * gem proc; herbalism yields the herb (occasionally two).
 */
export function gatherNode(
  rng: Rng,
  prof: Profession,
  tier: number,
  skill: number,
): GatherResult | null {
  if (!canGather(skill, tier)) return null;
  const primary = primaryMaterial(prof, tier);
  if (!primary) return null;

  const yields: GatherYield[] = [{ materialId: primary.id, qty: rng.int(1, 2) }];
  if (prof === Profession.Mining) {
    yields.push({ materialId: 'roughStone', qty: rng.int(1, 2) });
    if (rng.next() < 0.06) yields.push({ materialId: 'gemShard', qty: 1 });
  }
  return { yields, newSkill: skillUp(rng, skill, tier) };
}

// --- Fishing minigame ---------------------------------------------------------

/** Seconds from cast until the bobber bites (client schedules the reaction window). */
export function fishBiteDelaySeconds(rng: Rng): number {
  return 1.5 + rng.float(0, 2.5);
}

/**
 * Resolve a successful fishing catch at a water `tier` for a player of `skill`.
 * Yields a fish (rare chance of the next tier's fish) plus an occasional fish oil.
 */
export function rollFish(rng: Rng, tier: number, skill: number): GatherResult {
  const fish = primaryMaterial(Profession.Fishing, tier);
  const yields: GatherYield[] = [];
  if (fish) {
    // Rare "big catch": a fish one tier up.
    const bigTier = rng.next() < 0.08 ? Math.min(3, tier + 1) : tier;
    const caught = primaryMaterial(Profession.Fishing, bigTier) ?? fish;
    yields.push({ materialId: caught.id, qty: 1 });
  }
  if (rng.next() < 0.3) yields.push({ materialId: 'fishOil', qty: 1 });
  return { yields, newSkill: skillUp(rng, skill, tier) };
}

/** A fresh per-profession skill map (all professions start at skill 1, GDD §9). */
export function initialSkills(): Record<string, number> {
  return { mining: 1, herbalism: 1, fishing: 1, blacksmithing: 1, alchemy: 1 };
}

export type { MaterialDef };
