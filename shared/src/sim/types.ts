// Core simulation-facing types for the player entity. Kept plain and serialisable
// so the same shapes flow into saves (Phase 1) and network snapshots (Phase 6).

export type MoveState = 'idle' | 'walk' | 'run' | 'jump' | 'swim';

/** The player's kinematic state, advanced by the movement rules each tick. */
export interface PlayerPhysics {
  x: number;
  y: number; // feet (bottom of the capsule)
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing yaw in radians (0 = +z, increasing CCW), for orientation & animation. */
  yaw: number;
  onGround: boolean;
  inWater: boolean;
  moveState: MoveState;
}

export function makePlayerPhysics(x: number, y: number, z: number): PlayerPhysics {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    onGround: false,
    inWater: false,
    moveState: 'idle',
  };
}

/** Anything that can answer "is this voxel solid / fluid?" for collision. */
export interface VoxelSampler {
  isSolid(x: number, y: number, z: number): boolean;
  isFluid(x: number, y: number, z: number): boolean;
}
