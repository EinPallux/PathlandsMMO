// Crafting resolution (GDD §9). Pure: validates a recipe against the player's
// material stash + skill, consumes the inputs, and returns the output plus the new
// skill. The client applies the output (bar/consumable to a stash, gear to the bag)
// and the Phase-6 server runs the same code.

import type { Rng } from '../core/rng.js';
import { skillUpForReq } from './skill.js';
import type { RecipeDef, RecipeOutput } from '../data/recipes.js';

/** Whether the player can craft `recipe` given their materials + profession skill. */
export function canCraft(
  recipe: RecipeDef,
  materials: Record<string, number>,
  skill: number,
): boolean {
  if (skill < recipe.skillReq) return false;
  return recipe.inputs.every((i) => (materials[i.id] ?? 0) >= i.qty);
}

export interface CraftResult {
  output: RecipeOutput;
  newSkill: number;
}

/**
 * Consume the recipe's inputs from `materials` (mutated in place) and return its
 * output + the new profession skill. Returns null if the craft isn't possible.
 */
export function craft(
  rng: Rng,
  recipe: RecipeDef,
  materials: Record<string, number>,
  skill: number,
): CraftResult | null {
  if (!canCraft(recipe, materials, skill)) return null;
  for (const i of recipe.inputs) {
    const left = (materials[i.id] ?? 0) - i.qty;
    if (left > 0) materials[i.id] = left;
    else delete materials[i.id];
  }
  return { output: recipe.output, newSkill: skillUpForReq(rng, skill, recipe.skillReq) };
}
