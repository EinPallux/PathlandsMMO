// Pure, deterministic, tick-based player movement & voxel collision. No wall-clock,
// no randomness — the same inputs always produce the same motion, which is exactly
// what Phase-6 client prediction and server authority both require (ARCH §7).
//
// The player is an axis-aligned capsule approximated by an AABB. Collision is a
// substepped per-axis sweep against the voxel field, with a step-up assist so
// gentle terrain and 1-voxel ledges are walkable.

import type { MoveIntent } from './intents.js';
import type { PlayerPhysics, VoxelSampler, MoveState } from './types.js';

// --- Tunable movement constants (documented in GAME_DESIGN §2 movement) ---
export const PLAYER_HALF = 0.3; // half width/depth (metres)
export const PLAYER_HEIGHT = 1.75;
export const STEP_HEIGHT = 1.05; // auto-climb up to ~1 voxel
export const WALK_SPEED = 4.6;
export const RUN_SPEED = 7.6;
export const SWIM_SPEED = 3.6;
export const GRAVITY = -25;
export const JUMP_SPEED = 8.2;
export const SWIM_UP_SPEED = 4.0;
export const BUOYANCY = 32; // upward accel while submerged (floats toward surface)
export const WATER_DRAG = 0.82;
export const TERMINAL_VELOCITY = -60;
const EPS = 1e-3;
const MAX_SUBSTEP = 0.2;

/** AABB overlap test against the voxel field, at feet position (x, y, z). */
function collides(s: VoxelSampler, x: number, y: number, z: number): boolean {
  const x0 = Math.floor(x - PLAYER_HALF);
  const x1 = Math.floor(x + PLAYER_HALF);
  const z0 = Math.floor(z - PLAYER_HALF);
  const z1 = Math.floor(z + PLAYER_HALF);
  const y0 = Math.floor(y + EPS);
  const y1 = Math.floor(y + PLAYER_HEIGHT - EPS);
  for (let vy = y0; vy <= y1; vy++) {
    for (let vz = z0; vz <= z1; vz++) {
      for (let vx = x0; vx <= x1; vx++) {
        if (s.isSolid(vx, vy, vz)) return true;
      }
    }
  }
  return false;
}

/** Move along one horizontal axis with substeps + step-up assist. */
function moveHorizontal(s: VoxelSampler, p: PlayerPhysics, dx: number, dz: number): void {
  const move = (axis: 'x' | 'z', delta: number): void => {
    if (delta === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / MAX_SUBSTEP));
    const inc = delta / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === 'x' ? p.x + inc : p.x;
      const nz = axis === 'z' ? p.z + inc : p.z;
      if (!collides(s, nx, p.y, nz)) {
        p.x = nx;
        p.z = nz;
        continue;
      }
      // Blocked — try a step-up if grounded and the obstacle is ≤ STEP_HEIGHT tall.
      if (
        p.onGround &&
        !collides(s, nx, p.y + STEP_HEIGHT, nz) &&
        !collides(s, p.x, p.y + STEP_HEIGHT, p.z)
      ) {
        p.y += STEP_HEIGHT;
        p.x = nx;
        p.z = nz;
        continue;
      }
      // Solid wall: stop this axis.
      if (axis === 'x') p.vx = 0;
      else p.vz = 0;
      break;
    }
  };
  move('x', dx);
  move('z', dz);
}

/** Move vertically with substeps; sets onGround on a downward contact. */
function moveVertical(s: VoxelSampler, p: PlayerPhysics, dy: number): void {
  p.onGround = false;
  if (dy === 0) {
    // Still detect resting-on-ground for animation/jump when not moving vertically.
    if (collides(s, p.x, p.y - 0.06, p.z)) p.onGround = true;
    return;
  }
  const steps = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SUBSTEP));
  const inc = dy / steps;
  for (let i = 0; i < steps; i++) {
    const ny = p.y + inc;
    if (!collides(s, p.x, ny, p.z)) {
      p.y = ny;
    } else {
      if (dy < 0) {
        // Snap the feet flush to the surface instead of resting a substep above it.
        let guard = 0;
        while (!collides(s, p.x, p.y - 0.03, p.z) && guard++ < 40) p.y -= 0.03;
        p.onGround = true;
      }
      p.vy = 0;
      break;
    }
  }
}

function deriveMoveState(p: PlayerPhysics, sprint: boolean, moving: boolean): MoveState {
  if (p.inWater) return 'swim';
  if (!p.onGround) return 'jump';
  if (moving) return sprint ? 'run' : 'walk';
  return 'idle';
}

/**
 * Advance the player one tick. Mutates and returns `p`. `dt` is seconds per tick
 * (TICK_DT). Deterministic given the same sampler, state, intent, and dt.
 */
export function stepPlayerMovement(
  sampler: VoxelSampler,
  p: PlayerPhysics,
  intent: MoveIntent,
  dt: number,
): PlayerPhysics {
  // Submerged check at the capsule's midriff.
  p.inWater = sampler.isFluid(p.x, p.y + PLAYER_HEIGHT * 0.5, p.z);
  const feetInWater = sampler.isFluid(p.x, p.y + 0.1, p.z);

  // Horizontal wish → velocity (arcade-direct for crisp control).
  // Math.sqrt is IEEE-754 correctly-rounded (identical across JS engines);
  // Math.hypot is only "implementation-approximated" and could diverge a client
  // (browser) from the Phase-6 server (Node) — breaking prediction. Keep it sqrt.
  const wishLen = Math.sqrt(intent.wishX * intent.wishX + intent.wishZ * intent.wishZ);
  const speed = p.inWater ? SWIM_SPEED : intent.sprint ? RUN_SPEED : WALK_SPEED;
  if (wishLen > 1e-4) {
    const norm = Math.min(1, wishLen);
    p.vx = (intent.wishX / wishLen) * speed * norm;
    p.vz = (intent.wishZ / wishLen) * speed * norm;
  } else {
    p.vx = 0;
    p.vz = 0;
  }
  p.yaw = intent.yaw;

  // Vertical dynamics.
  if (p.inWater || feetInWater) {
    if (intent.jump) {
      p.vy = SWIM_UP_SPEED; // actively swim up
    } else {
      // Buoyancy floats the player toward the surface, then settles once the
      // head clears the water. Water drag damps the bob.
      const submerged = sampler.isFluid(p.x, p.y + PLAYER_HEIGHT * 0.7, p.z);
      p.vy += (submerged ? BUOYANCY : GRAVITY * 0.2) * dt;
      p.vy *= WATER_DRAG;
      p.vy = Math.max(-SWIM_SPEED, Math.min(SWIM_SPEED, p.vy));
    }
  } else {
    p.vy += GRAVITY * dt;
    if (p.vy < TERMINAL_VELOCITY) p.vy = TERMINAL_VELOCITY;
    if (p.onGround && intent.jump) p.vy = JUMP_SPEED;
  }

  // Integrate with collision (horizontal first, then vertical).
  moveHorizontal(sampler, p, p.vx * dt, p.vz * dt);
  moveVertical(sampler, p, p.vy * dt);

  p.moveState = deriveMoveState(p, intent.sprint, wishLen > 1e-4);
  return p;
}
