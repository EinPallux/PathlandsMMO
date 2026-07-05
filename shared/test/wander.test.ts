import { describe, it, expect } from 'vitest';
import { makeWanderState, wanderStep, type WanderConfig } from '../src/sim/wander.js';
import { makeRng } from '../src/core/rng.js';
import { TICK_DT, WORLD_SEED } from '../src/core/constants.js';

const CFG: WanderConfig = { homeRadius: 10, speed: 2, faceRadius: 8 };
const flat = (): number => 60;

function run(): { x: number; z: number; yaw: number } {
  const s = makeWanderState(100, 61, 100, makeRng(WORLD_SEED, 'ent', 'a'));
  for (let i = 0; i < 600; i++) wanderStep(s, TICK_DT, CFG, flat, 105, 105);
  return { x: s.x, z: s.z, yaw: s.yaw };
}

describe('wander AI', () => {
  it('is deterministic for the same seed + input sequence', () => {
    expect(run()).toEqual(run());
  });

  it('stays within its home radius (plus a small margin)', () => {
    const s = makeWanderState(100, 61, 100, makeRng(WORLD_SEED, 'ent', 'b'));
    let maxDist = 0;
    for (let i = 0; i < 2000; i++) {
      wanderStep(s, TICK_DT, CFG, flat, 500, 500);
      maxDist = Math.max(maxDist, Math.hypot(s.x - 100, s.z - 100));
    }
    expect(maxDist).toBeLessThanOrEqual(CFG.homeRadius + 1);
  });

  it('faces the player when idle nearby', () => {
    const s = makeWanderState(100, 61, 100, makeRng(WORLD_SEED, 'ent', 'c'));
    s.moveState = 'idle';
    s.targetX = 100;
    s.targetZ = 100;
    s.timer = 999; // stay put
    // Player due +x from the entity → desired yaw = atan2(1,0) = π/2.
    for (let i = 0; i < 120; i++) wanderStep(s, TICK_DT, CFG, flat, 104, 100);
    expect(Math.abs(s.yaw - Math.PI / 2)).toBeLessThan(0.2);
  });
});
