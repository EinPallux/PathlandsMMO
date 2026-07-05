import { describe, it, expect } from 'vitest';
import {
  WAYSTONES,
  waystoneById,
  nearestWaystone,
  nearestActivated,
  travelFee,
  SETTLEMENTS,
  WILD_WAYSTONES,
} from '../src/index.js';

describe('Waystone network (GDD §7)', () => {
  it('has one per settlement plus every wild stone, with unique ids', () => {
    expect(WAYSTONES.length).toBe(SETTLEMENTS.length + WILD_WAYSTONES.length);
    expect(new Set(WAYSTONES.map((w) => w.id)).size).toBe(WAYSTONES.length);
    expect(waystoneById('ws-brookhollow')).toBeDefined();
  });

  it('finds the nearest stone within range', () => {
    const bh = waystoneById('ws-brookhollow')!;
    const found = nearestWaystone(bh.x + 3, bh.z - 2, 7);
    expect(found?.id).toBe('ws-brookhollow');
    // Nothing within a tiny radius far from any stone.
    expect(nearestWaystone(0, 0, 5)).toBeNull();
  });

  it('restricts nearestActivated to the discovered set', () => {
    const activated = new Set(['ws-waymeet']);
    const wm = waystoneById('ws-waymeet')!;
    expect(nearestActivated(wm.x, wm.z, activated)?.id).toBe('ws-waymeet');
    expect(nearestActivated(wm.x, wm.z, new Set())).toBeNull();
  });

  it('scales the travel fee with distance + level, clamped', () => {
    const a = waystoneById('ws-brookhollow')!;
    const b = waystoneById('ws-waymeet')!;
    const near = travelFee(a, a, 10);
    const far = travelFee(a, b, 10);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThanOrEqual(10);
    expect(travelFee(a, b, 30)).toBeGreaterThan(travelFee(a, b, 1));
    expect(travelFee(a, b, 10)).toBeLessThanOrEqual(1000);
  });
});
