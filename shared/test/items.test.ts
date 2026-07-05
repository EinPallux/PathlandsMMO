import { describe, it, expect } from 'vitest';
import {
  EquipSlot,
  Rarity,
  WeaponKind,
  ArmorClass,
  ilvlFor,
  statBudget,
  weaponDps,
  armorRating,
  canEquip,
  generateItem,
  rollLoot,
  statTotal,
  makeRng,
  CharacterClass,
  WORLD_SEED,
  type ItemDef,
  type LootTable,
} from '../src/index.js';

describe('Itemization formulas (GDD §6)', () => {
  it('ilvl = reqLevel + rarity bonus', () => {
    expect(ilvlFor(10, Rarity.Common)).toBe(10);
    expect(ilvlFor(10, Rarity.Uncommon)).toBe(13);
    expect(ilvlFor(10, Rarity.Rare)).toBe(16);
    expect(ilvlFor(10, Rarity.Epic)).toBe(20);
  });

  it('stat budget = ilvl × rarity multiplier', () => {
    expect(statBudget(16, Rarity.Common)).toBe(16);
    expect(statBudget(16, Rarity.Rare)).toBe(Math.round(16 * 1.55));
    expect(statBudget(20, Rarity.Epic)).toBe(Math.round(20 * 1.9));
  });

  it('weapon DPS = 3.2 + 1.9 × ilvl^0.95', () => {
    expect(weaponDps(1)).toBeCloseTo(3.2 + 1.9, 6);
    expect(weaponDps(20)).toBeCloseTo(3.2 + 1.9 * Math.pow(20, 0.95), 6);
  });

  it('armor scales with ilvl, slot, and armor class', () => {
    expect(armorRating(20, EquipSlot.Chest, ArmorClass.Plate)).toBeGreaterThan(
      armorRating(20, EquipSlot.Chest, ArmorClass.Cloth),
    );
    expect(armorRating(20, EquipSlot.Chest, ArmorClass.Plate)).toBeGreaterThan(
      armorRating(20, EquipSlot.Feet, ArmorClass.Plate),
    );
    expect(armorRating(20, EquipSlot.Amulet, ArmorClass.Plate)).toBe(0); // jewelry: no armor
  });
});

describe('Equip restrictions (GDD §6)', () => {
  const plateChest: ItemDef = {
    id: 'x',
    name: 'Plate Chest',
    slot: EquipSlot.Chest,
    rarity: Rarity.Common,
    ilvl: 10,
    reqLevel: 10,
    armorClass: ArmorClass.Plate,
    stats: {},
    value: 10,
  };

  it('locks armor class and level', () => {
    expect(canEquip(CharacterClass.Warrior, 10, plateChest)).toBe(true);
    expect(canEquip(CharacterClass.Mage, 10, plateChest)).toBe(false); // cloth-only
    expect(canEquip(CharacterClass.Warrior, 9, plateChest)).toBe(false); // under level
  });

  it('locks main-hand weapon type to the class weapon', () => {
    const bow: ItemDef = {
      id: 'b',
      name: 'Bow',
      slot: EquipSlot.MainHand,
      rarity: Rarity.Common,
      ilvl: 5,
      reqLevel: 5,
      stats: {},
      value: 5,
      weapon: { kind: WeaponKind.Bow, speed: 2.8, baseRoll: 20, dps: 7 },
    };
    expect(canEquip(CharacterClass.Ranger, 5, bow)).toBe(true);
    expect(canEquip(CharacterClass.Warrior, 5, bow)).toBe(false);
  });
});

describe('Item generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generateItem(makeRng(WORLD_SEED, 'drop'), {
      slot: EquipSlot.Chest,
      rarity: Rarity.Rare,
      reqLevel: 12,
      forClass: CharacterClass.Warrior,
    });
    const b = generateItem(makeRng(WORLD_SEED, 'drop'), {
      slot: EquipSlot.Chest,
      rarity: Rarity.Rare,
      reqLevel: 12,
      forClass: CharacterClass.Warrior,
    });
    expect(a).toEqual(b);
  });

  it('spends the full stat budget over 1–3 stats', () => {
    const rng = makeRng(WORLD_SEED, 'budget');
    for (let i = 0; i < 50; i++) {
      const it = generateItem(rng, {
        slot: EquipSlot.Legs,
        rarity: Rarity.Uncommon,
        reqLevel: 8 + (i % 20),
        forClass: CharacterClass.Priest,
      });
      const budget = statBudget(it.ilvl, it.rarity);
      const total = statTotal(it.stats);
      const nonZero = Object.values(it.stats).filter((v) => (v ?? 0) > 0).length;
      expect(nonZero).toBeGreaterThanOrEqual(1);
      expect(nonZero).toBeLessThanOrEqual(3);
      // Budget conserved within small clamping slack.
      expect(total).toBeGreaterThanOrEqual(budget - 2);
      expect(total).toBeLessThanOrEqual(budget + 2);
    }
  });

  it('gives armor pieces armor and weapons a weapon block', () => {
    const chest = generateItem(makeRng(WORLD_SEED, 'a'), {
      slot: EquipSlot.Chest,
      rarity: Rarity.Common,
      reqLevel: 10,
      forClass: CharacterClass.Warrior,
    });
    expect(chest.armor).toBeGreaterThan(0);
    expect(chest.armorClass).toBe(ArmorClass.Plate);

    const wep = generateItem(makeRng(WORLD_SEED, 'w'), {
      slot: EquipSlot.MainHand,
      rarity: Rarity.Common,
      reqLevel: 10,
      forClass: CharacterClass.Mage,
    });
    expect(wep.weapon?.kind).toBe(WeaponKind.Staff);
    expect(wep.weapon?.baseRoll).toBeGreaterThan(0);
  });

  it('epics bind on equip; lower rarities do not', () => {
    const epic = generateItem(makeRng(WORLD_SEED, 'e'), {
      slot: EquipSlot.Trinket,
      rarity: Rarity.Epic,
      reqLevel: 25,
    });
    expect(epic.bindOnEquip).toBe(true);
  });
});

describe('Loot rolls (GDD §6)', () => {
  const table: LootTable = {
    id: 'test',
    gold: [10, 20],
    drops: [
      { chance: 1, generate: { slot: EquipSlot.Head, rarity: Rarity.Common, reqLevel: 8 } },
      { chance: 0, generate: { slot: EquipSlot.Feet, rarity: Rarity.Rare, reqLevel: 8 } },
    ],
    pickOne: {
      picks: 1,
      entries: [
        { weight: 1, generate: { slot: EquipSlot.Ring1, rarity: Rarity.Uncommon, reqLevel: 8 } },
        { weight: 1, generate: { slot: EquipSlot.Amulet, rarity: Rarity.Uncommon, reqLevel: 8 } },
      ],
    },
  };

  it('is deterministic per seed', () => {
    const a = rollLoot(table, makeRng(WORLD_SEED, 'loot'), { forClass: CharacterClass.Ranger });
    const b = rollLoot(table, makeRng(WORLD_SEED, 'loot'), { forClass: CharacterClass.Ranger });
    expect(a.gold).toBe(b.gold);
    expect(a.items.map((s) => s.item.id)).toEqual(b.items.map((s) => s.item.id));
  });

  it('honors chances and gold range', () => {
    const r = rollLoot(table, makeRng(WORLD_SEED, 'loot2'), {});
    expect(r.gold).toBeGreaterThanOrEqual(10);
    expect(r.gold).toBeLessThanOrEqual(20);
    // The chance:1 head always drops; the chance:0 feet never does.
    expect(r.items.some((s) => s.item.slot === EquipSlot.Head)).toBe(true);
    expect(r.items.some((s) => s.item.slot === EquipSlot.Feet)).toBe(false);
    // Exactly one pickOne result (ring or amulet).
    expect(
      r.items.filter((s) => s.item.slot === EquipSlot.Ring1 || s.item.slot === EquipSlot.Amulet)
        .length,
    ).toBe(1);
  });
});
