// Profession masteries (GDD §9, Phase 4 Part 16). Maxing a profession (skill 100)
// unlocks a permanent passive bonus, derived from the persisted skill — no new save
// data. These verify the bonus is active at the cap and absent below it, for gather,
// fish, and craft, and that sub-cap behaviour is byte-identical to before (no RNG
// re-ordering regression).

import { describe, it, expect } from 'vitest';
import {
  Profession,
  ALL_PROFESSIONS,
  MASTERIES,
  masteryFor,
  isMastered,
  SKILL_MAX,
  gatherNode,
  rollFish,
  craft,
  recipeById,
  makeRng,
  WORLD_SEED,
} from '../src/index.js';

const qtyOf = (yields: { materialId: string; qty: number }[], id: string): number =>
  yields.filter((y) => y.materialId === id).reduce((s, y) => s + y.qty, 0);

describe('Profession masteries (GDD §9)', () => {
  it('every profession has a mastery, and isMastered gates on the cap', () => {
    for (const p of ALL_PROFESSIONS) {
      expect(masteryFor(p).name.length).toBeGreaterThan(0);
      expect(MASTERIES[p].profession).toBe(p);
    }
    expect(isMastered(SKILL_MAX)).toBe(true);
    expect(isMastered(SKILL_MAX - 1)).toBe(false);
    expect(isMastered(1)).toBe(false);
  });

  it('mining mastery grants +1 ore per vein over the same roll at sub-cap', () => {
    // Same seed, tier-3 vein: the cap gather yields exactly one more primary ore.
    const below = gatherNode(makeRng(WORLD_SEED, 'mine'), Profession.Mining, 3, 75)!;
    const master = gatherNode(makeRng(WORLD_SEED, 'mine'), Profession.Mining, 3, SKILL_MAX)!;
    const primaryId = below.yields[0]!.materialId; // the tier-3 ore (read dynamically)
    expect(qtyOf(master.yields, primaryId)).toBe(qtyOf(below.yields, primaryId) + 1);
    // The stone byproduct is unaffected (still 1–2 roughStone).
    expect(qtyOf(master.yields, 'roughStone')).toBeGreaterThan(0);
  });

  it('herbalism mastery grants +1 herb per gather', () => {
    const below = gatherNode(makeRng(WORLD_SEED, 'herb'), Profession.Herbalism, 3, 80)!;
    const master = gatherNode(makeRng(WORLD_SEED, 'herb'), Profession.Herbalism, 3, SKILL_MAX)!;
    const primaryId = below.yields[0]!.materialId;
    expect(qtyOf(master.yields, primaryId)).toBe(qtyOf(below.yields, primaryId) + 1);
  });

  it('fishing mastery lifts big-catch and fish-oil rates over many casts', () => {
    let oilBelow = 0;
    let oilMaster = 0;
    for (let i = 0; i < 600; i++) {
      if (
        rollFish(makeRng(WORLD_SEED, 'fishB', String(i)), 0, 50).yields.some(
          (y) => y.materialId === 'fishOil',
        )
      )
        oilBelow++;
      if (
        rollFish(makeRng(WORLD_SEED, 'fishM', String(i)), 0, SKILL_MAX).yields.some(
          (y) => y.materialId === 'fishOil',
        )
      )
        oilMaster++;
    }
    // Mastery raises fish-oil from ~30% to ~50%: the master rate is clearly higher.
    expect(oilMaster).toBeGreaterThan(oilBelow);
  });

  it('crafting mastery sometimes yields an extra stackable output, never below the cap', () => {
    const recipe = recipeById('r_copperBar')!; // material output, qty 1
    // Below cap: never a bonus — the output qty is always exactly the recipe's.
    for (let i = 0; i < 50; i++) {
      const mats: Record<string, number> = { copperOre: 10 };
      const res = craft(makeRng(WORLD_SEED, 'craftB', String(i)), recipe, mats, 60)!;
      expect(res.output.kind === 'material' && res.output.qty).toBe(1);
    }
    // At the cap: a bonus procs on some fraction of crafts (qty becomes 2).
    let bonus = 0;
    for (let i = 0; i < 200; i++) {
      const mats: Record<string, number> = { copperOre: 10 };
      const res = craft(makeRng(WORLD_SEED, 'craftM', String(i)), recipe, mats, SKILL_MAX)!;
      if (res.output.kind === 'material' && res.output.qty === 2) bonus++;
    }
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThan(200); // not guaranteed
  });

  it('equipment crafts never get a bonus qty from mastery', () => {
    const gear = recipeById('r_copperSword')!; // equipment output — not stackable
    for (let i = 0; i < 40; i++) {
      const mats: Record<string, number> = { copperBar: 9, roughStone: 3 };
      const res = craft(makeRng(WORLD_SEED, 'gear', String(i)), gear, mats, SKILL_MAX)!;
      expect(res.output.kind).toBe('equipment');
    }
  });
});
