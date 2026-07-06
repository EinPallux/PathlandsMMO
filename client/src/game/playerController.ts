// Client player controller: turns input into a MoveIntent and advances the shared,
// deterministic movement rules on the fixed sim tick. Keeps the previous tick's
// state so the renderer can interpolate for smooth motion between ticks (ARCH §7 —
// the same intent→sim path becomes client prediction in Phase 6).

import {
  stepPlayerMovement,
  makePlayerPhysics,
  makeMoveIntent,
  lerpAngle,
  lerp,
  type MoveIntent,
  type PlayerPhysics,
  type VoxelSampler,
  type MoveState,
} from '@pathlands/shared';
import type { Input } from './input.js';

export interface RenderState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  moveState: MoveState;
}

export class PlayerController {
  physics: PlayerPhysics;
  private prev: PlayerPhysics;
  /**
   * The MoveIntent applied on the most recent tick. In Phase 6 the NetClient sends
   * this to the server so the authoritative sim runs the exact same input the local
   * prediction ran — the intent → sim boundary going over the wire (ARCH §7).
   */
  lastIntent: MoveIntent = makeMoveIntent(0, 0, false, false, 0);

  constructor(x: number, y: number, z: number) {
    this.physics = makePlayerPhysics(x, y, z);
    this.prev = { ...this.physics };
  }

  teleport(x: number, y: number, z: number): void {
    this.physics = makePlayerPhysics(x, y, z);
    this.prev = { ...this.physics };
  }

  /**
   * Advance one fixed tick. cameraYaw resolves WASD to a world-space wish;
   * speedMult scales ground speed (mount + out-of-combat perks, clamped by the sim).
   */
  tick(sampler: VoxelSampler, input: Input, cameraYaw: number, dt: number, speedMult = 1): void {
    this.prev = { ...this.physics };

    let f = 0;
    let s = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) f += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) f -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) s += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) s -= 1;

    const fwdX = Math.sin(cameraYaw);
    const fwdZ = Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let wishX = fwdX * f + rightX * s;
    let wishZ = fwdZ * f + rightZ * s;
    // Match the simulation's deterministic length (sqrt, not approximated hypot).
    const len = Math.sqrt(wishX * wishX + wishZ * wishZ);
    const moving = len > 1e-3;
    if (moving) {
      wishX /= len;
      wishZ /= len;
    }

    // Face the movement direction; keep facing when idle.
    const yaw = moving ? Math.atan2(wishX, wishZ) : this.physics.yaw;

    const intent = makeMoveIntent(
      wishX,
      wishZ,
      input.isDown('Space'),
      input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      yaw,
      speedMult,
    );
    stepPlayerMovement(sampler, this.physics, intent, dt);
    this.lastIntent = intent;
  }

  /** Interpolated render state between the previous and current tick. */
  renderState(alpha: number): RenderState {
    return {
      x: lerp(this.prev.x, this.physics.x, alpha),
      y: lerp(this.prev.y, this.physics.y, alpha),
      z: lerp(this.prev.z, this.physics.z, alpha),
      yaw: lerpAngle(this.prev.yaw, this.physics.yaw, alpha),
      moveState: this.physics.moveState,
    };
  }
}
