// VFX particle system (ROADMAP Phase 5, ARCHITECTURE §5). One pooled THREE.Points
// object of additive soft dots drives every effect — hit sparks, death puffs, skill
// casts, the level-up fountain, Waystone activation. Particles are CPU-simulated
// (gravity + drag + fade) and uploaded each frame; a ring buffer recycles slots, so
// the whole thing is a single draw call with a fixed memory budget. Colour fades to
// black over life (additive → invisible), so no per-particle alpha channel is needed.

import * as THREE from 'three';

const MAX = 700;

const VERT = `
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
attribute vec3 position;
attribute vec3 acolor;
attribute float size;
varying vec3 vColor;
void main() {
  vColor = acolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * 220.0 / -mv.z, 1.0, 48.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
precision highp float;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float mask = smoothstep(0.25, 0.0, r2);
  gl_FragColor = vec4(vColor * mask, 1.0);
}
`;

export interface BurstOpts {
  /** Number of particles (clamped to the pool). */
  count: number;
  /** Base RGB (0..1); fades to black over life. */
  color: [number, number, number];
  /** Outward speed (m/s). */
  speed?: number;
  /** Extra upward velocity bias (m/s). */
  up?: number;
  /** Lifetime seconds. */
  life?: number;
  /** Point size (world-ish units). */
  size?: number;
  /** Gravity (m/s², negative pulls down). Default a light −6. */
  gravity?: number;
  /** Position jitter radius. */
  spread?: number;
}

export class Vfx {
  private readonly points: THREE.Points;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.RawShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly siz: Float32Array;
  // Per-particle CPU-only state.
  private readonly vel = new Float32Array(MAX * 3);
  private readonly base = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private head = 0;
  private readonly scene: THREE.Scene;
  /** Burst-count multiplier from the VFX-density graphics setting (0 mutes). */
  private density = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.siz = new Float32Array(MAX);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'acolor',
      new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'size',
      new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.mat = new THREE.RawShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false; // particles roam; skip the stale-bounds cull
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  /** Density multiplier for burst sizes (VFX-density graphics setting): 0..1. */
  setDensity(mult: number): void {
    this.density = Math.max(0, Math.min(1, mult));
  }

  /** Spawn a burst of particles at a world position. */
  burst(x: number, y: number, z: number, o: BurstOpts): void {
    const n = Math.min(Math.round(o.count * this.density), MAX);
    if (n <= 0) return;
    const speed = o.speed ?? 2.5;
    const up = o.up ?? 0;
    const life = o.life ?? 0.5;
    const size = o.size ?? 0.18;
    const gravity = o.gravity ?? -6;
    const spread = o.spread ?? 0.1;
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % MAX;
      // Random direction on a sphere, biased upward.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);
      const s = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x + dx * spread;
      this.pos[i * 3 + 1] = y + dy * spread;
      this.pos[i * 3 + 2] = z + dz * spread;
      this.vel[i * 3] = dx * s;
      this.vel[i * 3 + 1] = dy * s + up;
      this.vel[i * 3 + 2] = dz * s;
      this.base[i * 3] = o.color[0];
      this.base[i * 3 + 1] = o.color[1];
      this.base[i * 3 + 2] = o.color[2];
      this.col[i * 3] = o.color[0];
      this.col[i * 3 + 1] = o.color[1];
      this.col[i * 3 + 2] = o.color[2];
      this.siz[i] = size;
      const l = life * (0.7 + Math.random() * 0.5);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.grav[i] = gravity;
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.attributes.acolor!.needsUpdate = true;
    this.geo.attributes.size!.needsUpdate = true;
  }

  /** Advance every live particle and re-upload the changed buffers. */
  update(dt: number): void {
    if (dt <= 0) return;
    let any = false;
    const drag = 1 - Math.min(1, 1.2 * dt);
    for (let i = 0; i < MAX; i++) {
      const l = this.life[i]!;
      if (l <= 0) continue;
      any = true;
      const i3 = i * 3;
      const nl = l - dt;
      if (nl <= 0) {
        this.life[i] = 0;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0; // dead → invisible
        continue;
      }
      this.life[i] = nl;
      const vx = this.vel[i3]! * drag;
      const vy = this.vel[i3 + 1]! * drag + this.grav[i]! * dt;
      const vz = this.vel[i3 + 2]! * drag;
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] = this.pos[i3]! + vx * dt;
      this.pos[i3 + 1] = this.pos[i3 + 1]! + vy * dt;
      this.pos[i3 + 2] = this.pos[i3 + 2]! + vz * dt;
      const f = nl / this.maxLife[i]!; // fade out
      this.col[i3] = this.base[i3]! * f;
      this.col[i3 + 1] = this.base[i3 + 1]! * f;
      this.col[i3 + 2] = this.base[i3 + 2]! * f;
    }
    if (any) {
      this.geo.attributes.position!.needsUpdate = true;
      this.geo.attributes.acolor!.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// --- effect palette ----------------------------------------------------------

/** Cast/skill colour by damage school (GDD §4). */
export const SCHOOL_COLOR: Record<string, [number, number, number]> = {
  physical: [1.0, 0.9, 0.7],
  nature: [0.45, 0.9, 0.45],
  holy: [1.0, 0.95, 0.6],
  fire: [1.0, 0.5, 0.2],
  frost: [0.5, 0.8, 1.0],
  arcane: [0.8, 0.5, 1.0],
  shadow: [0.6, 0.4, 0.85],
};
