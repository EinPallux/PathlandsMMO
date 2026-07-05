import { describe, it, expect } from 'vitest';
import {
  DEEDS,
  PERKS,
  DeedCategory,
  createDeedState,
  applyDeedProgress,
  isDeedComplete,
  deedProgress,
  earnedPathPoints,
  buyPerk,
  canBuyPerk,
  perkMagnitude,
  perkById,
  deedById,
} from '../src/index.js';

describe('Deeds (GDD §10)', () => {
  it('advances a deed and awards Path Points once complete', () => {
    const s = createDeedState();
    // First Blood: slay 10 foes.
    let awarded = 0;
    for (let i = 0; i < 9; i++) awarded += applyDeedProgress(s, 'kill').length;
    expect(awarded).toBe(0);
    expect(isDeedComplete(s, 'd_first_blood')).toBe(false);
    const notices = applyDeedProgress(s, 'kill'); // 10th kill
    expect(notices.some((n) => n.deedId === 'd_first_blood')).toBe(true);
    expect(isDeedComplete(s, 'd_first_blood')).toBe(true);
  });

  it('does not re-award a completed deed', () => {
    const s = createDeedState();
    applyDeedProgress(s, 'boss'); // Hollow-Delver (threshold 1)
    expect(isDeedComplete(s, 'd_hollow_delver')).toBe(true);
    const again = applyDeedProgress(s, 'boss');
    expect(again.some((n) => n.deedId === 'd_hollow_delver')).toBe(false);
  });

  it('shares a metric across tiered deeds and clamps progress', () => {
    const s = createDeedState();
    applyDeedProgress(s, 'waystone', 3); // completes Wayfarer (3), progresses Pathfinder (8)
    expect(isDeedComplete(s, 'd_wayfarer')).toBe(true);
    expect(isDeedComplete(s, 'd_pathfinder')).toBe(false);
    expect(deedProgress(s, 'd_pathfinder')).toBe(3);
    applyDeedProgress(s, 'waystone', 99);
    expect(deedProgress(s, 'd_pathfinder')).toBe(8); // clamped to threshold
    expect(isDeedComplete(s, 'd_pathfinder')).toBe(true);
  });

  it('earnedPathPoints sums completed deeds', () => {
    const s = createDeedState();
    applyDeedProgress(s, 'boss'); // Hollow-Delver = 3 PP
    applyDeedProgress(s, 'waystone', 3); // Wayfarer = 1 PP
    expect(earnedPathPoints(s)).toBe(
      deedById('d_hollow_delver')!.pathPoints + deedById('d_wayfarer')!.pathPoints,
    );
  });
});

describe('Path perks (GDD §10)', () => {
  it('buys a perk rank and debits Path Points', () => {
    const res = buyPerk({}, 3, 'deepPockets');
    expect(res).not.toBeNull();
    expect(res!.perks.deepPockets).toBe(1);
    expect(res!.pathPoints).toBe(2); // deepPockets costs 1
  });

  it('refuses to buy when unaffordable or maxed', () => {
    expect(buyPerk({}, 0, 'waywise')).toBeNull(); // costs 2, have 0
    expect(buyPerk({ deepPockets: 4 }, 10, 'deepPockets')).toBeNull(); // maxRank 4
    expect(canBuyPerk(perkById('waywise')!, 0, 2)).toBe(true);
  });

  it('sums perk magnitudes across ranks', () => {
    expect(perkMagnitude({ deepPockets: 3 }, 'bagSlots')).toBe(6); // 2/rank × 3
    expect(perkMagnitude({ waywise: 2 }, 'travelFee')).toBeCloseTo(0.3, 6);
  });
});

describe('Meta content validity', () => {
  it('every deed has a category, positive threshold, and Path Points', () => {
    for (const d of DEEDS) {
      expect(Object.values(DeedCategory)).toContain(d.category);
      expect(d.threshold).toBeGreaterThan(0);
      expect(d.pathPoints).toBeGreaterThan(0);
      expect(deedById(d.id)).toBe(d);
    }
  });

  it('every perk has ranks + a cost', () => {
    for (const p of PERKS) {
      expect(p.maxRank).toBeGreaterThan(0);
      expect(p.cost).toBeGreaterThan(0);
      expect(perkById(p.id)).toBe(p);
    }
  });
});
