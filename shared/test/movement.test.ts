import { describe, it, expect } from 'vitest';
import {
  stepPlayerMovement,
  JUMP_SPEED,
  makePlayerPhysics,
  makeMoveIntent,
  type VoxelSampler,
} from '../src/sim/index.js';
import { TICK_DT } from '../src/core/constants.js';

/** Flat ground at y < groundTop; optional solid wall region; optional water. */
function makeSampler(opts: {
  groundTop?: number;
  wall?: (x: number, y: number, z: number) => boolean;
  water?: (x: number, y: number, z: number) => boolean;
}): VoxelSampler {
  const groundTop = opts.groundTop ?? 0; // topmost solid voxel index
  return {
    isSolid: (x, y, z) => y <= groundTop || (opts.wall?.(x, y, z) ?? false),
    isFluid: (x, y, z) => opts.water?.(x, y, z) ?? false,
  };
}

const idle = makeMoveIntent(0, 0, false, false, 0);

function simulate(
  sampler: VoxelSampler,
  p = makePlayerPhysics(0.5, 5, 0.5),
  intent = idle,
  ticks = 120,
) {
  for (let i = 0; i < ticks; i++) stepPlayerMovement(sampler, p, intent, TICK_DT);
  return p;
}

describe('player movement', () => {
  it('falls under gravity and settles on the ground', () => {
    const sampler = makeSampler({ groundTop: 0 }); // solid at y=0 → surface top is y=1
    const p = simulate(sampler);
    expect(p.onGround).toBe(true);
    // Feet rest just above the solid voxel at y=0 (i.e. y≈1).
    expect(p.y).toBeGreaterThanOrEqual(0.9);
    expect(p.y).toBeLessThanOrEqual(1.1);
    expect(Math.abs(p.vy)).toBeLessThan(0.5);
  });

  it('does not tunnel through the floor at terminal velocity', () => {
    const sampler = makeSampler({ groundTop: 0 });
    const p = simulate(sampler, makePlayerPhysics(0.5, 150, 0.5));
    expect(p.y).toBeGreaterThanOrEqual(0.9);
    expect(p.y).toBeLessThanOrEqual(1.2);
  });

  it('jumps when grounded and returns to the ground', () => {
    const sampler = makeSampler({ groundTop: 0 });
    const p = simulate(sampler); // land first
    const jump = makeMoveIntent(0, 0, true, false, 0);
    stepPlayerMovement(sampler, p, jump, TICK_DT);
    expect(p.vy).toBeCloseTo(JUMP_SPEED, 1);
    const landed = simulate(sampler, p, idle, 120);
    expect(landed.onGround).toBe(true);
  });

  it('is blocked by a solid wall (no pass-through)', () => {
    // Wall occupying x ≥ 2 for all heights.
    const sampler = makeSampler({ groundTop: 0, wall: (x) => x >= 2 });
    const p = makePlayerPhysics(0.5, 1, 0.5);
    const east = makeMoveIntent(1, 0, false, false, 0);
    for (let i = 0; i < 200; i++) stepPlayerMovement(sampler, p, east, TICK_DT);
    // Player's east face (x + half) must stay west of the wall at x=2.
    expect(p.x + 0.3).toBeLessThanOrEqual(2 + 1e-3);
  });

  it('steps up a single-voxel ledge', () => {
    // Ground at y=0 everywhere; a 1-voxel-high step for x ≥ 2 (top at y=1).
    const sampler: VoxelSampler = {
      isSolid: (x, y) => y <= 0 || (x >= 2 && y <= 1),
      isFluid: () => false,
    };
    const p = makePlayerPhysics(0.5, 1, 0.5);
    p.onGround = true;
    const east = makeMoveIntent(1, 0, false, false, 0);
    for (let i = 0; i < 120; i++) stepPlayerMovement(sampler, p, east, TICK_DT);
    expect(p.x).toBeGreaterThan(2.5); // climbed onto the ledge and continued
    expect(p.y).toBeGreaterThanOrEqual(1.9); // now standing on top (y≈2)
  });

  it('floats near the surface in water rather than sinking or flying', () => {
    // Water fills y ≤ 20; no solid ground within reach.
    const sampler: VoxelSampler = {
      isSolid: () => false,
      isFluid: (_x, y) => y <= 20,
    };
    const p = simulate(sampler, makePlayerPhysics(0.5, 25, 0.5), idle, 400);
    expect(p.moveState).toBe('swim');
    // Bobbing around the surface (y≈20), not plummeting or launching.
    expect(p.y).toBeGreaterThan(14);
    expect(p.y).toBeLessThan(26);
  });

  it('reports run vs walk move states from sprint', () => {
    const sampler = makeSampler({ groundTop: 0 });
    const p = simulate(sampler); // grounded
    stepPlayerMovement(sampler, p, makeMoveIntent(1, 0, false, false, 0), TICK_DT);
    expect(p.moveState).toBe('walk');
    stepPlayerMovement(sampler, p, makeMoveIntent(1, 0, false, true, 0), TICK_DT);
    expect(p.moveState).toBe('run');
  });

  it('applies a mount/perk speed multiplier to ground movement', () => {
    const sampler = makeSampler({ groundTop: 0 });
    const dist = (mult: number): number => {
      const p = makePlayerPhysics(0.5, 1, 0.5);
      p.onGround = true;
      const it = makeMoveIntent(1, 0, false, false, 0, mult);
      for (let i = 0; i < 60; i++) stepPlayerMovement(sampler, p, it, TICK_DT);
      return p.x - 0.5;
    };
    const walk = dist(1);
    const mounted = dist(1.6);
    expect(mounted).toBeGreaterThan(walk * 1.5);
    // Absurd client values are clamped, not trusted.
    expect(dist(100)).toBeLessThanOrEqual(dist(2) + 1e-6);
  });

  it('leaves swim speed unaffected by the ground multiplier', () => {
    // Deep water with no surface in reach → the player stays fully submerged, so
    // the mount/perk *ground* multiplier must not touch swim speed.
    const sampler: VoxelSampler = { isSolid: () => false, isFluid: (_x, y) => y <= 200 };
    const swim = (mult: number): number => {
      const p = makePlayerPhysics(0.5, 100, 0.5);
      const it = makeMoveIntent(1, 0, false, false, 0, mult);
      for (let i = 0; i < 20; i++) stepPlayerMovement(sampler, p, it, TICK_DT);
      return p.x - 0.5;
    };
    expect(swim(1.6)).toBeCloseTo(swim(1), 5);
  });

  it('is fully deterministic across two runs', () => {
    const s1 = makeSampler({ groundTop: 0, wall: (x) => x >= 3 });
    const s2 = makeSampler({ groundTop: 0, wall: (x) => x >= 3 });
    const run = (s: VoxelSampler) => {
      const p = makePlayerPhysics(0.5, 8, 0.5);
      const it = makeMoveIntent(1, 0.3, false, true, 0.4);
      for (let i = 0; i < 300; i++) stepPlayerMovement(s, p, it, TICK_DT);
      return p;
    };
    expect(run(s1)).toEqual(run(s2));
  });
});
