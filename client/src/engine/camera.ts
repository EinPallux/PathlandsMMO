// Third-person orbit camera with terrain-collision pull-in, plus a free-fly dev
// camera. The rig owns yaw/pitch/zoom; the player controller reads camera yaw to
// resolve WASD into a world-space move wish.

import * as THREE from 'three';

export type CameraMode = 'thirdPerson' | 'freeFly';

export type SolidFn = (x: number, y: number, z: number) => boolean;

const LOOK_SENS = 0.0032;
const MIN_DIST = 2.5;
const MAX_DIST = 13;
const PITCH_MIN = -1.35;
const PITCH_MAX = 1.35;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'thirdPerson';
  yaw = 0;
  pitch = 0.35;
  distance = 7;

  private readonly freePos = new THREE.Vector3(1536, 90, 1536);
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.1, 2000);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addLook(dx: number, dy: number): void {
    this.yaw -= dx * LOOK_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * LOOK_SENS, PITCH_MIN, PITCH_MAX);
  }

  zoom(deltaY: number): void {
    this.distance = THREE.MathUtils.clamp(
      this.distance * (1 + deltaY * 0.0015),
      MIN_DIST,
      MAX_DIST,
    );
  }

  /** Forward horizontal direction implied by the current yaw (for free-fly + move wish). */
  forwardXZ(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Move the free-fly camera by local input (units in world metres). */
  moveFree(forward: number, strafe: number, up: number): void {
    const f = this.forwardXZ(new THREE.Vector3());
    const right = new THREE.Vector3(f.z, 0, -f.x);
    this.freePos.addScaledVector(f, forward);
    this.freePos.addScaledVector(right, strafe);
    this.freePos.y += up;
  }

  /** Update the camera transform. In third-person, follows/collides around target. */
  update(playerX: number, playerY: number, playerZ: number, isSolid: SolidFn): void {
    if (this.mode === 'freeFly') {
      this.camera.position.copy(this.freePos);
      const dir = new THREE.Vector3(
        Math.cos(this.pitch) * Math.sin(this.yaw),
        Math.sin(this.pitch),
        Math.cos(this.pitch) * Math.cos(this.yaw),
      );
      this.camera.lookAt(this.freePos.clone().add(dir));
      return;
    }

    // Aim at the player's upper body.
    this.target.set(playerX, playerY + 1.5, playerZ);

    const dir = new THREE.Vector3(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.cos(this.yaw),
    );
    this.desired.copy(this.target).addScaledVector(dir, this.distance);

    // Pull the camera in if terrain occludes the line from target to desired.
    let dist = this.distance;
    const steps = Math.ceil(this.distance / 0.5);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * this.distance;
      const px = this.target.x + dir.x * t;
      const py = this.target.y + dir.y * t;
      const pz = this.target.z + dir.z * t;
      if (isSolid(px, py, pz)) {
        dist = Math.max(MIN_DIST * 0.6, t - 0.4);
        break;
      }
    }
    this.camera.position.copy(this.target).addScaledVector(dir, dist);
    this.camera.lookAt(this.target);
  }

  /** Sync the free-fly camera to the player's location (used when toggling in). */
  syncFreeToPlayer(x: number, y: number, z: number): void {
    this.freePos.set(x, y + 2, z);
  }
}
