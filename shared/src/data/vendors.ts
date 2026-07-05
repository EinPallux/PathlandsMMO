// Vendor / general-goods merchant logic (GDD §6 "vendors: buy/sell/buyback").
// Data-driven and deterministic: a merchant's stock is generated from its seed and
// the level tier of its settlement, so the same vendor always offers the same wares
// on any machine. Pure — the buy/sell/buyback bookkeeping lives client-side (and
// server-side in Phase 6), but the stock and pricing come from here.

import { makeRng } from '../core/rng.js';
import { CharacterClass } from '../models/characters/index.js';
import { EquipSlot, Rarity, generateItem, buyPrice, type ItemDef } from './items.js';

export interface VendorStockItem {
  item: ItemDef;
  /** Copper the merchant charges the player (GDD §6: full item value). */
  price: number;
}

/**
 * The effective level tier of each settlement's wares (WORLD.md zone bands). A
 * town's merchant stocks gear a few levels around this, so upgrades are available
 * as the player progresses through the zones.
 */
export const SETTLEMENT_TIER: Record<string, number> = {
  brookhollow: 3,
  millstead: 3,
  waymeet: 8,
  mossgate: 8,
  fernwick: 9,
  grubbersRest: 15,
  glimmercamp: 20,
  cairnwick: 27,
};

/** The default tier for a merchant not tied to a known settlement. */
export const DEFAULT_VENDOR_TIER = 3;

// A fixed spread of offers so every class finds something useful, weighted toward
// cheap Common staples with a couple of Uncommon upgrades.
const VENDOR_OFFERS: ReadonlyArray<{
  slot: EquipSlot;
  rarity: Rarity;
  forClass?: CharacterClass;
}> = [
  { slot: EquipSlot.Chest, rarity: Rarity.Common, forClass: CharacterClass.Warrior },
  { slot: EquipSlot.Legs, rarity: Rarity.Common, forClass: CharacterClass.Ranger },
  { slot: EquipSlot.Head, rarity: Rarity.Common, forClass: CharacterClass.Priest },
  { slot: EquipSlot.Feet, rarity: Rarity.Common, forClass: CharacterClass.Mage },
  { slot: EquipSlot.Hands, rarity: Rarity.Uncommon, forClass: CharacterClass.Warrior },
  { slot: EquipSlot.MainHand, rarity: Rarity.Common, forClass: CharacterClass.Ranger },
  { slot: EquipSlot.MainHand, rarity: Rarity.Common, forClass: CharacterClass.Mage },
  { slot: EquipSlot.OffHand, rarity: Rarity.Common, forClass: CharacterClass.Warrior },
  { slot: EquipSlot.Amulet, rarity: Rarity.Common },
  { slot: EquipSlot.Ring1, rarity: Rarity.Uncommon },
];

const clampLevel = (n: number): number => Math.max(1, Math.min(30, n));

/**
 * Build a merchant's stock deterministically from `seed` and the settlement `tier`.
 * Stock is stable (infinite quantity, like a classic town vendor); buying does not
 * deplete it. Prices are the full item value (sell-back is a quarter, see items.ts).
 */
export function vendorStock(seed: number, tier: number): VendorStockItem[] {
  return VENDOR_OFFERS.map((offer, i) => {
    const rng = makeRng(seed, 'vendor', String(i));
    const reqLevel = clampLevel(tier - 2 + (i % 4));
    const item = generateItem(rng, {
      slot: offer.slot,
      rarity: offer.rarity,
      reqLevel,
      forClass: offer.forClass,
    });
    return { item, price: buyPrice(item) };
  });
}
