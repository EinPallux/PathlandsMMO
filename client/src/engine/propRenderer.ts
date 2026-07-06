// Instanced rendering of scattered decoration props (trees, rocks, flora, node
// shells). One InstancedMesh per prop type spans all loaded chunks; instances are
// added/removed per chunk as the ring streams. Geometry per prop is greedy-meshed
// once from the shared VoxelModel. Non-colliding decoration (ARCH §5).

import * as THREE from 'three';
import { getProp, type PropId, type PropInstance } from '@pathlands/shared';
import { meshVolume } from './greedyMesh.js';

// Wind sway (Phase 5 VFX): props bend in a light breeze, weighted by local vertex
// height (bases stay put, tops sway) and phased per instance so a grove ripples
// instead of moving as one. Short props (rocks) barely move; trees/flora read the
// wind. One shared uTime uniform, advanced by PropRenderer.tick().
const WIND_TIME = { value: 0 };
const PROP_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
PROP_MATERIAL.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = WIND_TIME;
  shader.vertexShader =
    'uniform float uTime;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float ph = iPos.x * 0.35 + iPos.z * 0.35;
        float h = max(position.y, 0.0);
        transformed.x += sin(uTime * 1.7 + ph) * 0.045 * h;
        transformed.z += cos(uTime * 1.3 + ph) * 0.035 * h;
      #endif`,
    );
};

interface PropEntry {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  capacity: number;
  chunks: Map<number, THREE.Matrix4[]>;
  dirty: boolean;
}

/** Greedy-mesh a single-part prop VoxelModel into a scaled BufferGeometry. */
function buildPropGeometry(id: PropId): THREE.BufferGeometry {
  const model = getProp(id);
  const part = model.parts[0]!;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  const map = new Map<number, number>();
  const key = (x: number, y: number, z: number): number =>
    (x + 64) * 262144 + (y + 64) * 512 + (z + 64);
  for (const v of part.voxels) {
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
  // Flat per-voxel colour (no jitter): props are instanced thousands of times, so
  // preserving greedy merging keeps their triangle count low. Depth comes from AO.
  const color = (lx: number, ly: number, lz: number): number =>
    map.get(key(lx + minX, ly + minY, lz + minZ)) ?? 0xffffff;
  const m = meshVolume(w, h, d, solid, color);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  // Centre horizontally on the model's base, and scale to world size.
  const cx = (minX + maxX + 1) / 2;
  const cz = (minZ + maxZ + 1) / 2;
  geo.translate(-cx, -minY, -cz);
  geo.scale(model.scale, model.scale, model.scale);
  geo.computeBoundingSphere();
  return geo;
}

export class PropRenderer {
  private readonly scene: THREE.Scene;
  private readonly entries = new Map<PropId, PropEntry>();
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly axisY = new THREE.Vector3(0, 1, 0);
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private entryFor(id: PropId): PropEntry {
    let e = this.entries.get(id);
    if (!e) {
      const geometry = buildPropGeometry(id);
      const capacity = 64;
      const mesh = new THREE.InstancedMesh(geometry, PROP_MATERIAL, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true; // trees/rocks/props cast sun shadows (Phase 5)
      mesh.receiveShadow = true;
      e = { mesh, geometry, capacity, chunks: new Map(), dirty: false };
      this.entries.set(id, e);
      this.scene.add(mesh);
    }
    return e;
  }

  addChunk(key: number, props: PropInstance[]): void {
    if (props.length === 0) return;
    const byProp = new Map<PropId, THREE.Matrix4[]>();
    for (const p of props) {
      let list = byProp.get(p.prop);
      if (!list) {
        list = [];
        byProp.set(p.prop, list);
      }
      this.q.setFromAxisAngle(this.axisY, p.yaw);
      this.pos.set(p.x, p.y, p.z);
      this.scl.set(p.scale, p.scale, p.scale);
      list.push(new THREE.Matrix4().compose(this.pos, this.q, this.scl));
    }
    for (const [id, mats] of byProp) {
      const e = this.entryFor(id);
      e.chunks.set(key, mats);
      e.dirty = true;
    }
  }

  removeChunk(key: number): void {
    for (const e of this.entries.values()) {
      if (e.chunks.delete(key)) e.dirty = true;
    }
  }

  /** Advance the shared wind clock (drives the foliage sway shader). */
  tick(dt: number): void {
    WIND_TIME.value += dt;
  }

  /** Rebuild instance buffers for any prop whose loaded chunks changed. */
  update(): void {
    for (const e of this.entries.values()) {
      if (!e.dirty) continue;
      e.dirty = false;
      let total = 0;
      for (const mats of e.chunks.values()) total += mats.length;

      if (total > e.capacity) {
        let cap = e.capacity;
        while (cap < total) cap *= 2;
        this.scene.remove(e.mesh);
        e.mesh.dispose();
        e.mesh = new THREE.InstancedMesh(e.geometry, PROP_MATERIAL, cap);
        e.mesh.frustumCulled = false;
        e.mesh.castShadow = true;
        e.mesh.receiveShadow = true;
        e.capacity = cap;
        this.scene.add(e.mesh);
      }

      let i = 0;
      for (const mats of e.chunks.values()) {
        for (const m of mats) e.mesh.setMatrixAt(i++, m);
      }
      e.mesh.count = total;
      e.mesh.instanceMatrix.needsUpdate = true;
      e.mesh.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      this.scene.remove(e.mesh);
      e.mesh.dispose();
      e.geometry.dispose();
    }
    this.entries.clear();
  }
}
