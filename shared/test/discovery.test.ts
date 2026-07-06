// Recipe discovery (GDD §9, Phase 4 Part 18). Advanced "discovery" recipes are
// hidden until learned: they can't be crafted unknown, and a small chance on each
// craft in the same profession (at sufficient skill) learns one. These verify the
// gate, the learn roll, and that non-discovery recipes are unaffected.

import { describe, it, expect } from 'vitest';
import {
  RECIPES,
  DISCOVERY_RECIPES,
  recipeById,
  craft,
  makeRng,
  WORLD_SEED,
  Profession,
} from '../src/index.js';

describe('Recipe discovery (GDD §9)', () => {
  it('ships discovery recipes, all high-skill and Epic-tier', () => {
    expect(DISCOVERY_RECIPES.length).toBeGreaterThanOrEqual(2);
    for (const r of DISCOVERY_RECIPES) {
      expect(r.discovery).toBe(true);
      expect(r.skillReq).toBeGreaterThanOrEqual(80); // never eligible in low-skill crafts
    }
  });

  it('refuses to craft an unknown discovery recipe, even with mats + skill', () => {
    const r = recipeById('r_crystaliumBlade')!;
    const mats: Record<string, number> = { crystaliumBar: 8, gemShard: 4 };
    // Skilled + supplied, but not learned → null, and materials are untouched.
    expect(craft(makeRng(WORLD_SEED, 'd'), r, mats, 90, new Set())).toBeNull();
    expect(mats.crystaliumBar).toBe(8);
    // Once learned, it crafts.
    const res = craft(makeRng(WORLD_SEED, 'd'), r, mats, 90, new Set(['r_crystaliumBlade']));
    expect(res).not.toBeNull();
    expect(mats.crystaliumBar).toBe(4); // 4 consumed
  });

  it('learns an unknown discovery recipe over many crafts at sufficient skill', () => {
    // Craft copper bars at skill 90 (Blacksmithing) many times; discovery should fire.
    const smelt = recipeById('r_copperBar')!;
    const learned = new Set<string>();
    let discoveries = 0;
    for (let i = 0; i < 400 && learned.size < 2; i++) {
      const mats: Record<string, number> = { copperOre: 2 };
      const res = craft(makeRng(WORLD_SEED, 'learn', String(i)), smelt, mats, 90, learned);
      if (res?.discovered) {
        learned.add(res.discovered);
        discoveries++;
      }
    }
    // Both Blacksmithing discovery recipes are learnable at skill 90.
    expect(discoveries).toBeGreaterThan(0);
    for (const id of learned) {
      expect(recipeById(id)!.profession).toBe(Profession.Blacksmithing);
      expect(recipeById(id)!.discovery).toBe(true);
    }
  });

  it('never discovers a recipe above the crafter’s skill', () => {
    // At skill 60 no Blacksmithing discovery recipe (skillReq 80/85) is eligible.
    const smelt = recipeById('r_copperBar')!;
    for (let i = 0; i < 200; i++) {
      const mats: Record<string, number> = { copperOre: 2 };
      const res = craft(makeRng(WORLD_SEED, 'lowskill', String(i)), smelt, mats, 60, new Set());
      expect(res?.discovered).toBeUndefined();
    }
  });

  it('a non-discovery craft is byte-identical whether or not a set is passed', () => {
    // Sub-cap, low-skill craft: adding the (empty) known set changes nothing.
    const a: Record<string, number> = { copperOre: 4 };
    const b: Record<string, number> = { copperOre: 4 };
    const ra = craft(makeRng(WORLD_SEED, 'x'), recipeById('r_copperBar')!, a, 5);
    const rb = craft(makeRng(WORLD_SEED, 'x'), recipeById('r_copperBar')!, b, 5, new Set());
    expect(ra).toEqual(rb);
    expect(ra!.discovered).toBeUndefined();
  });

  it('every discovery recipe is reachable (its profession has a craftable base recipe below its skillReq)', () => {
    for (const d of DISCOVERY_RECIPES) {
      const enabler = RECIPES.some(
        (r) => !r.discovery && r.profession === d.profession && r.skillReq <= d.skillReq,
      );
      expect(enabler, `${d.id} has no enabling base recipe`).toBe(true);
    }
  });
});
