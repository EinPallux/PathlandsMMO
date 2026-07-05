import { describe, it, expect } from 'vitest';
import {
  weaponDamage,
  skillDamage,
  armorMitigation,
  mitigatePhysical,
  ARMOR_MITIGATION_CAP,
  levelDeltaDamageMultiplier,
  hitChance,
  applyCrit,
  isCritRoll,
  threatFromDamage,
  threatFromHeal,
  enemyMaxHP,
  enemyDamage,
  EnemyRank,
} from '../src/index.js';

describe('Weapon & skill damage (GDD §4)', () => {
  it('weaponDamage = baseRoll + AP/14 × speed', () => {
    expect(weaponDamage(10, 2.4, 14)).toBeCloseTo(12.4, 6);
    expect(weaponDamage(0, 3.0, 140)).toBeCloseTo(30, 6); // 140/14 × 3
  });

  it('skillDamage = coefficient × source × classModifier', () => {
    expect(skillDamage(1.3, 20)).toBeCloseTo(26, 6);
    expect(skillDamage(1.3, 20, 1.15)).toBeCloseTo(29.9, 6);
  });
});

describe('Armor mitigation (GDD §4)', () => {
  it('follows armor/(armor + 85·L + 400)', () => {
    expect(armorMitigation(400, 1)).toBeCloseTo(400 / (400 + 85 + 400), 6);
    expect(armorMitigation(0, 5)).toBe(0);
  });

  it('caps at 75%', () => {
    expect(armorMitigation(10_000_000, 1)).toBe(ARMOR_MITIGATION_CAP);
    expect(mitigatePhysical(100, 10_000_000, 1)).toBeCloseTo(25, 6);
  });

  it('higher-level attackers punch through armor more', () => {
    expect(armorMitigation(500, 1)).toBeGreaterThan(armorMitigation(500, 20));
  });
});

describe('Level delta damage (GDD §4)', () => {
  it('is ±5% per level, capped at ±25%', () => {
    expect(levelDeltaDamageMultiplier(5, 5)).toBe(1);
    expect(levelDeltaDamageMultiplier(10, 5)).toBeCloseTo(1.25, 6); // +5 → capped
    expect(levelDeltaDamageMultiplier(7, 5)).toBeCloseTo(1.1, 6);
    expect(levelDeltaDamageMultiplier(5, 15)).toBeCloseTo(0.75, 6); // −10 → capped
  });
});

describe('Hit chance vs higher mobs (GDD §4)', () => {
  it('is near-certain at or below level, worse 4+ above', () => {
    expect(hitChance(10, 10)).toBe(0.95);
    expect(hitChance(10, 13)).toBe(0.95); // 3 above still fine
    expect(hitChance(10, 14)).toBeLessThan(0.95); // 4 above → penalty
    expect(hitChance(10, 20)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('Crit (GDD §4)', () => {
  it('multiplies by 1.5', () => {
    expect(applyCrit(100, true)).toBe(150);
    expect(applyCrit(100, false)).toBe(100);
  });
  it('rolls against a [0,1) draw', () => {
    expect(isCritRoll(0.3, 0.29)).toBe(true);
    expect(isCritRoll(0.3, 0.3)).toBe(false);
  });
});

describe('Threat (GDD §4)', () => {
  it('is 1/pt for damage, 0.5/pt for heals; tank stance doubles', () => {
    expect(threatFromDamage(100)).toBe(100);
    expect(threatFromDamage(100, 2)).toBe(200);
    expect(threatFromHeal(100)).toBe(50);
  });
});

describe('Enemy baselines (GDD §4)', () => {
  // Raw (pre-round) HP formula; the implementation rounds base × multipliers once.
  const rawHP = (l: number): number => 35 + 22 * l + Math.pow(1.1, l) * 8;

  it('HP = 35 + 22·L + 1.1^L·8', () => {
    expect(enemyMaxHP(1)).toBe(Math.round(rawHP(1)));
    expect(enemyMaxHP(5)).toBe(Math.round(rawHP(5)));
  });

  it('damage = 6 + 4·L per swing', () => {
    expect(enemyDamage(1)).toBe(10);
    expect(enemyDamage(5)).toBe(26);
  });

  // Phase-3 solo tuning (GDD §4): elite ×2.4 HP / ×1.3 dmg, boss ×4.5 HP / ×1.25 dmg.
  // Softened from the original ×8/×2 so every Hollow is soloable at-level before
  // Phase 4 consumables + Phase 5's balance pass restore longer fights.
  it('elite ×2.4 HP ×1.3 dmg, boss ×4.5 HP ×1.25 dmg', () => {
    expect(enemyMaxHP(10, EnemyRank.Elite)).toBe(Math.round(rawHP(10) * 2.4));
    expect(enemyMaxHP(10, EnemyRank.Boss)).toBe(Math.round(rawHP(10) * 4.5));
    expect(enemyDamage(10, EnemyRank.Elite)).toBe(Math.round(enemyDamage(10) * 1.3));
    expect(enemyDamage(10, EnemyRank.Boss)).toBe(Math.round(enemyDamage(10) * 1.25));
  });

  it('group scaling: +60% HP, +15% dmg per extra player', () => {
    expect(enemyMaxHP(10, EnemyRank.Normal, 2)).toBe(Math.round(rawHP(10) * 1.6));
    expect(enemyMaxHP(10, EnemyRank.Normal, 3)).toBe(Math.round(rawHP(10) * 2.2));
    expect(enemyDamage(10, EnemyRank.Normal, 2)).toBe(Math.round(enemyDamage(10) * 1.15));
  });
});
