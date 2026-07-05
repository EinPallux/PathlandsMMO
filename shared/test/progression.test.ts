import { describe, it, expect } from 'vitest';
import {
  LEVEL_CAP,
  xpToCompleteLevel,
  totalXpToReachLevel,
  levelProgressFromTotalXp,
  killXp,
  killXpMultiplier,
  applyRested,
  restedCap,
  baseStatsAtLevel,
  deriveCombatStats,
  combatStatsForLevel,
  ResourceKind,
  CharacterClass,
  statTotal,
} from '../src/index.js';

describe('XP curve (GDD §5)', () => {
  it('anchors at 400 for level 1 and rises monotonically to the cap', () => {
    expect(xpToCompleteLevel(1)).toBe(400);
    for (let l = 1; l < LEVEL_CAP - 1; l++) {
      expect(xpToCompleteLevel(l + 1)).toBeGreaterThan(xpToCompleteLevel(l));
    }
    expect(xpToCompleteLevel(LEVEL_CAP)).toBe(Infinity);
  });

  it('total XP to cap matches the summed curve (~878k)', () => {
    // The authoritative per-level formula 400·L^1.55 sums to ~878k over 1→30.
    // (The GDD's original "≈530k" parenthetical under-counted the sum; corrected
    // there. XP sources — quests ~55%, kills ~35% — must supply this; Phase-5 tune.)
    const total = totalXpToReachLevel(LEVEL_CAP);
    expect(total).toBeGreaterThan(860_000);
    expect(total).toBeLessThan(895_000);
  });

  it('level derivation round-trips every level boundary', () => {
    for (let l = 1; l <= LEVEL_CAP; l++) {
      const p = levelProgressFromTotalXp(totalXpToReachLevel(l));
      expect(p.level).toBe(l);
      expect(p.xpIntoLevel).toBe(0);
    }
  });

  it('tracks progress inside a level', () => {
    expect(levelProgressFromTotalXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0 });
    expect(levelProgressFromTotalXp(399)).toMatchObject({ level: 1, xpIntoLevel: 399 });
    expect(levelProgressFromTotalXp(400)).toMatchObject({ level: 2, xpIntoLevel: 0 });
  });

  it('clamps beyond the cap', () => {
    const p = levelProgressFromTotalXp(totalXpToReachLevel(LEVEL_CAP) + 999_999);
    expect(p.level).toBe(LEVEL_CAP);
    expect(p.xpForLevel).toBe(Infinity);
  });
});

describe('Kill XP with level delta (GDD §4)', () => {
  it('awards 12 + 6·L at level', () => {
    expect(killXp(5, 5)).toBe(42);
    expect(killXp(10, 10)).toBe(72);
  });

  it('scales up for tougher mobs (capped +40%)', () => {
    expect(killXpMultiplier(5)).toBeCloseTo(1.4, 5); // capped
    expect(killXp(5, 10)).toBe(Math.round((12 + 60) * 1.4));
  });

  it('fades to zero at gray (−6)', () => {
    expect(killXpMultiplier(-6)).toBe(0);
    expect(killXp(10, 4)).toBe(0);
    expect(killXp(10, 5)).toBeGreaterThan(0);
    expect(killXp(10, 5)).toBeLessThan(killXp(10, 10));
  });
});

describe('Rested XP (GDD §5)', () => {
  it('doubles kill XP while the pool lasts', () => {
    expect(applyRested(42, 100)).toEqual({ xp: 84, restedSpent: 42 });
    expect(applyRested(42, 20)).toEqual({ xp: 62, restedSpent: 20 });
    expect(applyRested(42, 0)).toEqual({ xp: 42, restedSpent: 0 });
  });

  it('caps at ~1.5 levels of XP', () => {
    const cap = restedCap(10);
    expect(cap).toBe(Math.round(xpToCompleteLevel(10) * 1.5));
  });
});

describe('Class stat growth (GDD §4)', () => {
  it('starts at the class base and grows deterministically', () => {
    expect(baseStatsAtLevel(CharacterClass.Warrior, 1)).toEqual({
      might: 11,
      agility: 6,
      intellect: 4,
      spirit: 5,
      stamina: 11,
    });
    // level 2 adds floor(growth·1)
    expect(baseStatsAtLevel(CharacterClass.Warrior, 2)).toEqual({
      might: 12,
      agility: 6,
      intellect: 4,
      spirit: 5,
      stamina: 12,
    });
  });

  it('is monotonic non-decreasing to the cap', () => {
    for (const cls of Object.values(CharacterClass)) {
      let prev = baseStatsAtLevel(cls, 1);
      for (let l = 2; l <= LEVEL_CAP; l++) {
        const cur = baseStatsAtLevel(cls, l);
        expect(statTotal(cur)).toBeGreaterThanOrEqual(statTotal(prev));
        prev = cur;
      }
    }
  });
});

describe('Derived combat stats (GDD §4)', () => {
  it('warrior L1: HP from stamina, AP from might, Rage resource', () => {
    const cs = combatStatsForLevel(CharacterClass.Warrior, 1);
    expect(cs.maxHP).toBe(60 + 11 * 10);
    expect(cs.attackPower).toBe(11);
    expect(cs.spellPower).toBe(4);
    expect(cs.resourceKind).toBe(ResourceKind.Rage);
    expect(cs.maxResource).toBe(100);
    expect(cs.critChance).toBeCloseTo(0.05 + 6 * (0.01 / 20), 6);
  });

  it('ranger gets bonus AP from agility', () => {
    const cs = combatStatsForLevel(CharacterClass.Ranger, 1);
    // might 8 + floor(agility 11 × 0.5) = 8 + 5
    expect(cs.attackPower).toBe(13);
    expect(cs.resourceKind).toBe(ResourceKind.Focus);
    expect(cs.maxResource).toBe(100);
  });

  it('caster Mana scales with Intellect', () => {
    const mage = combatStatsForLevel(CharacterClass.Mage, 1);
    expect(mage.resourceKind).toBe(ResourceKind.Mana);
    expect(mage.maxResource).toBe(120 + 12 * 15);
    expect(mage.spellPower).toBe(12);
    expect(mage.maxHP).toBe(30 + 6 * 10);
  });

  it('gear adds on top of base + growth', () => {
    const bare = combatStatsForLevel(CharacterClass.Warrior, 10);
    const geared = combatStatsForLevel(
      CharacterClass.Warrior,
      10,
      { stamina: 20, might: 15 },
      { armor: 300, bonusCritChance: 0.03 },
    );
    expect(geared.maxHP).toBe(bare.maxHP + 200);
    expect(geared.attackPower).toBe(bare.attackPower + 15);
    expect(geared.armor).toBe(300);
    expect(geared.critChance).toBeCloseTo(bare.critChance + 0.03, 6);
  });
});

describe('deriveCombatStats direct', () => {
  it('is a pure function of its inputs', () => {
    const stats = { might: 10, agility: 10, intellect: 10, spirit: 10, stamina: 10 };
    const a = deriveCombatStats(stats, CharacterClass.Priest);
    const b = deriveCombatStats(stats, CharacterClass.Priest);
    expect(a).toEqual(b);
  });
});
