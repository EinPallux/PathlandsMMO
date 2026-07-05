// Loot tables and seeded rolls (GDD §6). Enemies/chests reference a LootTable;
// rolling it with a per-encounter Rng yields gold + item drops. Drops are either
// curated (an itemId resolved against a registry) or generated on the fly. Pure +
// deterministic: same table + same Rng ⇒ same drops (client, test, Phase-6 server).

import type { Rng } from '../core/rng.js';
import { type CharacterClass } from '../models/characters/index.js';
import { generateItem, type GeneratedItemSpec, type ItemDef } from './items.js';

/** One possible drop, rolled independently by its chance. */
export interface LootDropSpec {
  /** Probability (0..1) this drop occurs. Default 1 (guaranteed). */
  chance?: number;
  /** A curated item id, resolved against the caller's registry. */
  itemId?: string;
  /** Or a random-item generator spec. */
  generate?: GeneratedItemSpec;
  /** Stack size: a fixed number or an inclusive [min,max] range. */
  qty?: number | [number, number];
}

/** A weighted "one of" group entry. */
export type LootWeighted = { weight: number } & LootDropSpec;

export interface LootTable {
  id: string;
  /** Copper range awarded (inclusive). */
  gold?: [number, number];
  /** Independent drops (each rolled by its own chance). */
  drops?: LootDropSpec[];
  /** Weighted single-pick group; `picks` picks, each gated by `chance`. */
  pickOne?: { picks: number; chance?: number; entries: LootWeighted[] };
}

export interface LootStack {
  item: ItemDef;
  qty: number;
}

export interface LootResult {
  gold: number;
  items: LootStack[];
}

/** Optional context to flavor generated drops. */
export interface LootContext {
  forClass?: CharacterClass;
}

export type ItemResolver = (id: string) => ItemDef | undefined;

function resolveQty(qty: LootDropSpec['qty'], rng: Rng): number {
  if (qty === undefined) return 1;
  if (typeof qty === 'number') return qty;
  return rng.int(qty[0], qty[1]);
}

function resolveDrop(
  spec: LootDropSpec,
  rng: Rng,
  ctx: LootContext,
  resolve?: ItemResolver,
): LootStack | null {
  let item: ItemDef | undefined;
  if (spec.generate) {
    const g: GeneratedItemSpec = spec.generate.forClass
      ? spec.generate
      : { ...spec.generate, forClass: ctx.forClass };
    item = generateItem(rng, g);
  } else if (spec.itemId && resolve) {
    item = resolve(spec.itemId);
  }
  if (!item) return null;
  return { item, qty: resolveQty(spec.qty, rng) };
}

/**
 * Roll a loot table. Independent `drops` roll by chance in order; the `pickOne`
 * group makes `picks` weighted selections. Deterministic in `rng`.
 */
export function rollLoot(
  table: LootTable,
  rng: Rng,
  ctx: LootContext = {},
  resolve?: ItemResolver,
): LootResult {
  const items: LootStack[] = [];
  const gold = table.gold ? rng.int(table.gold[0], table.gold[1]) : 0;

  for (const spec of table.drops ?? []) {
    if (rng.next() >= (spec.chance ?? 1)) continue;
    const stack = resolveDrop(spec, rng, ctx, resolve);
    if (stack) items.push(stack);
  }

  if (table.pickOne && table.pickOne.entries.length > 0) {
    const { picks, chance = 1, entries } = table.pickOne;
    const weights = entries.map((e) => e.weight);
    for (let i = 0; i < picks; i++) {
      if (rng.next() >= chance) continue;
      const idx = rng.weightedIndex(weights);
      const stack = resolveDrop(entries[idx]!, rng, ctx, resolve);
      if (stack) items.push(stack);
    }
  }

  return { gold, items };
}
