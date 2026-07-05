// Deterministic wander AI for ambient NPCs and wildlife. Pure and seeded: an entity
// meanders within a home radius, pausing at random, and turns to face the player when
// idle nearby. Cosmetic in Phases 1–5; in Phase 6 the server drives the same function
// on fixed ticks. No wall-clock, no Math.random.

import type { Rng } from '../core/rng.js';
import { lerpAngle, angleDelta } from '../core/math.js';

export interface WanderState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  moveState: 'idle' | 'walk';
  homeX: number;
  homeZ: number;
  targetX: number;
  targetZ: number;
  /** Seconds until the next wander decision. */
  timer: number;
  rng: Rng;
}

export interface WanderConfig {
  homeRadius: number;
  speed: number;
  /** Turn to face the player when idle within this distance. */
  faceRadius: number;
}

export function makeWanderState(x: number, y: number, z: number, rng: Rng): WanderState {
  return {
    x,
    y,
    z,
    yaw: rng.float(0, Math.PI * 2),
    moveState: 'idle',
    homeX: x,
    homeZ: z,
    targetX: x,
    targetZ: z,
    timer: rng.float(0.5, 3),
    rng,
  };
}

/**
 * Advance one wander step. `heightAt` keeps the entity grounded. Deterministic for
 * a given (state, dt, player position) sequence.
 */
export function wanderStep(
  s: WanderState,
  dt: number,
  cfg: WanderConfig,
  heightAt: (x: number, z: number) => number,
  playerX: number,
  playerZ: number,
): void {
  s.timer -= dt;
  if (s.timer <= 0) {
    if (s.rng.chance(0.4)) {
      // Pause.
      s.targetX = s.x;
      s.targetZ = s.z;
      s.timer = s.rng.float(2, 5);
    } else {
      const a = s.rng.float(0, Math.PI * 2);
      const r = s.rng.float(0, cfg.homeRadius);
      s.targetX = s.homeX + Math.cos(a) * r;
      s.targetZ = s.homeZ + Math.sin(a) * r;
      s.timer = s.rng.float(2, 6);
    }
  }

  const dx = s.targetX - s.x;
  const dz = s.targetZ - s.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist > 0.4) {
    const step = Math.min(dist, cfg.speed * dt);
    s.x += (dx / dist) * step;
    s.z += (dz / dist) * step;
    s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
    s.moveState = 'walk';
  } else {
    s.moveState = 'idle';
    // Face the player when they linger nearby.
    const pdx = playerX - s.x;
    const pdz = playerZ - s.z;
    const pd = Math.sqrt(pdx * pdx + pdz * pdz);
    if (pd < cfg.faceRadius && pd > 0.1) {
      const desired = Math.atan2(pdx, pdz);
      if (Math.abs(angleDelta(s.yaw, desired)) > 0.05) {
        s.yaw = lerpAngle(s.yaw, desired, Math.min(1, dt * 4));
      }
    }
  }

  s.y = heightAt(Math.floor(s.x), Math.floor(s.z)) + 1;
}
