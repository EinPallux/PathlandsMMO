import { describe, it, expect } from 'vitest';
import {
  vendorStock,
  buyPrice,
  sellPrice,
  SETTLEMENT_TIER,
  DEFAULT_VENDOR_TIER,
  EquipSlot,
  Rarity,
  generateItem,
  makeRng,
  WORLD_SEED,
  CharacterClass,
  type ItemDef,
} from '../src/index.js';

describe('Vendor pricing (GDD §6)', () => {
  const item: ItemDef = generateItem(makeRng(WORLD_SEED, 'v'), {
    slot: EquipSlot.Chest,
    rarity: Rarity.Uncommon,
    reqLevel: 10,
    forClass: CharacterClass.Warrior,
  });

  it('buy price is full value; sell price is a quarter (min 1)', () => {
    expect(buyPrice(item)).toBe(Math.round(item.value));
    expect(sellPrice(item)).toBe(Math.max(1, Math.floor(item.value / 4)));
    expect(sellPrice(item, 3)).toBe(Math.max(1, Math.floor((item.value / 4) * 3)));
    // Selling always nets less than re-buying (the classic vendor spread).
    expect(sellPrice(item)).toBeLessThan(buyPrice(item));
  });

  it('a 1-copper item never sells for 0', () => {
    const cheap: ItemDef = { ...item, value: 1 };
    expect(sellPrice(cheap)).toBe(1);
  });
});

describe('Vendor stock (GDD §6)', () => {
  it('is deterministic for the same seed + tier', () => {
    expect(vendorStock(4242, 8)).toEqual(vendorStock(4242, 8));
  });

  it('varies by seed', () => {
    const a = vendorStock(1, 8).map((s) => s.item.id);
    const b = vendorStock(2, 8).map((s) => s.item.id);
    expect(a).not.toEqual(b);
  });

  it('prices every ware at its buy value and stocks a useful spread', () => {
    const stock = vendorStock(777, 8);
    expect(stock.length).toBeGreaterThanOrEqual(8);
    for (const s of stock) {
      expect(s.price).toBe(buyPrice(s.item));
      expect(s.price).toBeGreaterThanOrEqual(1);
      expect(s.item.value).toBeGreaterThan(0);
    }
    const slots = new Set(stock.map((s) => s.item.slot));
    expect(slots.has(EquipSlot.MainHand)).toBe(true); // sells a weapon
    expect(slots.has(EquipSlot.Chest)).toBe(true); // and armor
  });

  it('stocks gear appropriate to the settlement tier', () => {
    const tier = 15;
    for (const s of vendorStock(9, tier)) {
      expect(s.item.reqLevel).toBeGreaterThanOrEqual(1);
      expect(s.item.reqLevel).toBeLessThanOrEqual(tier + 1);
    }
  });

  it('has a tier for every settlement, with a sane default', () => {
    for (const id of ['brookhollow', 'waymeet', 'grubbersRest', 'cairnwick']) {
      expect(SETTLEMENT_TIER[id]).toBeGreaterThan(0);
    }
    expect(DEFAULT_VENDOR_TIER).toBeGreaterThan(0);
  });
});
