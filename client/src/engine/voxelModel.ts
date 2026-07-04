// Renders a code-authored AnimatedModel (shared/models) as a Three.js object tree:
// one mesh per part, parented so each part rotates about its pivot, driven by the
// shared keyframe clips. Part meshes are greedy-meshed with self-AO + shade jitter
// for the "beaded" Cube-World look (ART_GUIDE §1).

import * as THREE from 'three';
import {
  hashFloat3,
  shade,
  type AnimatedModel,
  type ClipName,
  type ModelPart,
  type PartKeyframe,
} from '@pathlands/shared';
import { meshVolume } from './greedyMesh.js';

const MODEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

interface PartObject {
  obj: THREE.Group;
  pivot: [number, number, number];
}

function buildPartMesh(partData: ModelPart, jitterSeed: number): THREE.Mesh | null {
  if (partData.voxels.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  const map = new Map<number, number>();
  const key = (x: number, y: number, z: number): number =>
    (x + 64) * 262144 + (y + 64) * 512 + (z + 64);
  for (const v of partData.voxels) {
    map.set(key(v.x, v.y, v.z), v.c);
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const d = maxZ - minZ + 1;

  const solid = (lx: number, ly: number, lz: number): boolean =>
    map.has(key(lx + minX, ly + minY, lz + minZ));
  const color = (lx: number, ly: number, lz: number): number => {
    const base = map.get(key(lx + minX, ly + minY, lz + minZ)) ?? 0xffffff;
    // Subtle deterministic value jitter (±6%).
    const j = 0.94 + hashFloat3(lx + minX, ly + minY, lz + minZ, jitterSeed) * 0.12;
    return shade(base, j);
  };

  const m = meshVolume(w, h, d, solid, color);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  // Shift so the part's pivot sits at the local origin (rotation centre).
  geo.translate(minX - partData.pivot[0], minY - partData.pivot[1], minZ - partData.pivot[2]);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, MODEL_MATERIAL);
}

function sampleTrack(
  track: PartKeyframe[] | undefined,
  t: number,
  outPos: THREE.Vector3,
  outRot: THREE.Euler,
): void {
  if (!track || track.length === 0) {
    outPos.set(0, 0, 0);
    outRot.set(0, 0, 0);
    return;
  }
  if (t <= track[0]!.t) {
    applyKf(track[0]!, outPos, outRot);
    return;
  }
  const last = track[track.length - 1]!;
  if (t >= last.t) {
    applyKf(last, outPos, outRot);
    return;
  }
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      const ap = a.pos ?? [0, 0, 0];
      const bp = b.pos ?? [0, 0, 0];
      const ar = a.rot ?? [0, 0, 0];
      const br = b.rot ?? [0, 0, 0];
      outPos.set(
        ap[0] + (bp[0] - ap[0]) * f,
        ap[1] + (bp[1] - ap[1]) * f,
        ap[2] + (bp[2] - ap[2]) * f,
      );
      outRot.set(
        ar[0] + (br[0] - ar[0]) * f,
        ar[1] + (br[1] - ar[1]) * f,
        ar[2] + (br[2] - ar[2]) * f,
      );
      return;
    }
  }
}

function applyKf(kf: PartKeyframe, outPos: THREE.Vector3, outRot: THREE.Euler): void {
  const p = kf.pos ?? [0, 0, 0];
  const r = kf.rot ?? [0, 0, 0];
  outPos.set(p[0], p[1], p[2]);
  outRot.set(r[0], r[1], r[2]);
}

export class ModelObject {
  readonly group = new THREE.Group();
  private readonly parts = new Map<string, PartObject>();
  private readonly animated: AnimatedModel;
  private clipName: ClipName = 'idle';
  private time = 0;
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpRot = new THREE.Euler();

  constructor(animated: AnimatedModel, jitterSeed = 1337) {
    this.animated = animated;
    for (const partData of animated.model.parts) {
      const obj = new THREE.Group();
      obj.position.set(partData.pivot[0], partData.pivot[1], partData.pivot[2]);
      const mesh = buildPartMesh(partData, jitterSeed);
      if (mesh) obj.add(mesh);
      this.group.add(obj);
      this.parts.set(partData.name, { obj, pivot: partData.pivot });
    }
    this.group.scale.setScalar(animated.model.scale);
  }

  /** Switch the active clip. One-shot clips restart; loops keep their phase. */
  setClip(name: ClipName): void {
    if (name === this.clipName) return;
    if (!this.animated.clips[name]) return;
    this.clipName = name;
    if (!this.animated.clips[name]!.loop) this.time = 0;
  }

  setTransform(x: number, y: number, z: number, yaw: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  update(dt: number): void {
    const clip = this.animated.clips[this.clipName];
    if (!clip) return;
    this.time += dt;
    let phase: number;
    if (clip.loop) {
      phase = (this.time % clip.duration) / clip.duration;
    } else {
      phase = Math.min(1, this.time / clip.duration);
    }
    for (const [name, part] of this.parts) {
      sampleTrack(clip.tracks[name], phase, this.tmpPos, this.tmpRot);
      part.obj.position.set(
        part.pivot[0] + this.tmpPos.x,
        part.pivot[1] + this.tmpPos.y,
        part.pivot[2] + this.tmpPos.z,
      );
      part.obj.rotation.copy(this.tmpRot);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
