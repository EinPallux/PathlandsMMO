import { describe, it, expect } from 'vitest';
import {
  RECIPES,
  CONSUMABLES,
  MATERIALS,
  Profession,
  canCraft,
  craft,
  recipeById,
  consumableById,
  materialById,
  makeRng,
  WORLD_SEED,
  EQUIP_SLOTS,
} from '../src/index.js';

describe('Crafting engine (GDD §9)', () => {
  it('gates a craft on materials and skill', () => {
    const smelt = recipeById('r_copperBar')!;
    expect(canCraft(smelt, { copperOre: 2 }, 1)).toBe(true);
    expect(canCraft(smelt, { copperOre: 1 }, 1)).toBe(false); // not enough ore
    const ironBar = recipeById('r_ironBar')!;
    expect(canCraft(ironBar, { ironOre: 4 }, 10)).toBe(false); // skill too low (needs 25)
  });

  it('consumes inputs and yields the output + a skill-up', () => {
    const mats: Record<string, number> = { copperOre: 5 };
    const res = craft(makeRng(WORLD_SEED, 'c'), recipeById('r_copperBar')!, mats, 1);
    expect(res).not.toBeNull();
    expect(mats.copperOre).toBe(3); // 2 consumed
    expect(res!.output).toEqual({ kind: 'material', id: 'copperBar', qty: 1 });
    expect(res!.newSkill).toBe(2); // orange → +1
  });

  it('deletes a material key when it hits zero', () => {
    const mats: Record<string, number> = { meadowbloom: 1 };
    craft(makeRng(WORLD_SEED, 'c'), recipeById('r_lesserHealthPotion')!, mats, 1);
    expect('meadowbloom' in mats).toBe(false);
  });

  it('refuses to craft without the inputs (stash untouched)', () => {
    const mats: Record<string, number> = { copperBar: 2 };
    const res = craft(makeRng(WORLD_SEED, 'c'), recipeById('r_copperSword')!, mats, 20);
    expect(res).toBeNull(); // needs 3 bars + 1 stone
    expect(mats.copperBar).toBe(2); // untouched
  });

  it('is deterministic for the same seed', () => {
    const a: Record<string, number> = { fenweed: 4, gemShard: 2 };
    const b: Record<string, number> = { fenweed: 4, gemShard: 2 };
    const ra = craft(makeRng(WORLD_SEED, 'x'), recipeById('r_mightElixir')!, a, 30);
    const rb = craft(makeRng(WORLD_SEED, 'x'), recipeById('r_mightElixir')!, b, 30);
    expect(ra).toEqual(rb);
    expect(a).toEqual(b);
  });
});

describe('Recipe + consumable content validity', () => {
  it('every recipe input + output references real data', () => {
    const matIds = new Set(MATERIALS.map((m) => m.id));
    const slots = new Set<string>(EQUIP_SLOTS);
    for (const r of RECIPES) {
      expect(Object.values(Profession)).toContain(r.profession);
      for (const i of r.inputs) expect(matIds.has(i.id), `${r.id} input ${i.id}`).toBe(true);
      if (r.output.kind === 'material') expect(matIds.has(r.output.id), r.id).toBe(true);
      if (r.output.kind === 'consumable') expect(consumableById(r.output.id), r.id).toBeDefined();
      if (r.output.kind === 'equipment') expect(slots.has(r.output.slot), r.id).toBe(true);
    }
  });

  it('the gather→smelt→smith chain is coherent (ore → bar → gear)', () => {
    // Copper ore is gathered, smelted to a bar, and the bar forges a sword.
    expect(materialById('copperOre')).toBeDefined();
    expect(recipeById('r_copperBar')!.output).toMatchObject({ id: 'copperBar' });
    expect(recipeById('r_copperSword')!.inputs.some((i) => i.id === 'copperBar')).toBe(true);
  });

  it('consumables cover heal / resource / buff effects', () => {
    const kinds = new Set(CONSUMABLES.map((c) => c.effect.kind));
    expect(kinds.has('heal')).toBe(true);
    expect(kinds.has('resource')).toBe(true);
    expect(kinds.has('buff')).toBe(true);
  });
});
