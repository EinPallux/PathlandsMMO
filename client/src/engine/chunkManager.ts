// Main-thread chunk streaming: a pool of chunk workers generate+mesh chunks in a
// ring around the player; results become one Three.js mesh (one draw call) each.
// Chunks outside the ring are unloaded. Nearest-first dispatch keeps the world
// filling in around the player.

import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z, WORLD_SEED } from '@pathlands/shared';
import type { ChunkResponse, GroupPayload } from './chunkWorker.js';
import type { PropRenderer } from './propRenderer.js';

interface ChunkEntry {
  cx: number;
  cz: number;
  state: 'queued' | 'loading' | 'ready';
  mesh?: THREE.Mesh;
  emissiveMesh?: THREE.Mesh;
}

const chunkKey = (cx: number, cz: number): number => cx * 1000 + cz;

export class ChunkManager {
  private readonly scene: THREE.Scene;
  private readonly seed: number;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly emissiveMaterial: THREE.MeshBasicMaterial;
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly entries = new Map<number, ChunkEntry>();
  private readonly desired = new Set<number>();
  /** Chunk key each busy worker is currently meshing (for error recovery). */
  private readonly busy = new Map<Worker, number>();
  private queue: ChunkEntry[] = [];
  private lastCX = Number.NaN;
  private lastCZ = Number.NaN;
  private radius: number;
  private readonly props: PropRenderer | null;

  constructor(
    scene: THREE.Scene,
    seed = WORLD_SEED,
    radius = 7,
    props: PropRenderer | null = null,
    workerCount?: number,
  ) {
    this.scene = scene;
    this.seed = seed;
    this.radius = radius;
    this.props = props;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Emissive voxels (windows, lanterns, Waystones, blight) render full-bright,
    // unaffected by the sun — so they glow at night.
    this.emissiveMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

    const n = workerCount ?? Math.max(2, Math.min(6, (navigator.hardwareConcurrency ?? 4) - 1));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => this.onWorkerMessage(worker, e.data as ChunkResponse);
      worker.onerror = () => this.onWorkerError(worker);
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  setRadius(r: number): void {
    this.radius = Math.max(2, Math.min(16, Math.round(r)));
    this.lastCX = Number.NaN; // force a refresh
  }

  get loadedCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.state === 'ready') n++;
    return n;
  }

  get pendingCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.state !== 'ready') n++;
    return n;
  }

  /** True once the chunk containing (worldX, worldZ) has a mesh (or is provably empty). */
  isReadyAt(worldX: number, worldZ: number): boolean {
    const cx = Math.floor(worldX / CHUNK_SIZE);
    const cz = Math.floor(worldZ / CHUNK_SIZE);
    return this.entries.get(chunkKey(cx, cz))?.state === 'ready';
  }

  /** Recompute the desired ring when the player crosses a chunk boundary. */
  update(worldX: number, worldZ: number): void {
    const pcx = Math.floor(worldX / CHUNK_SIZE);
    const pcz = Math.floor(worldZ / CHUNK_SIZE);
    if (pcx === this.lastCX && pcz === this.lastCZ) {
      this.pump();
      return;
    }
    this.lastCX = pcx;
    this.lastCZ = pcz;

    this.desired.clear();
    const r = this.radius;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= WORLD_CHUNKS_X || cz >= WORLD_CHUNKS_Z) continue;
        const key = chunkKey(cx, cz);
        this.desired.add(key);
        if (!this.entries.has(key)) {
          this.entries.set(key, { cx, cz, state: 'queued' });
        }
      }
    }

    // Unload chunks beyond the keep radius (r + 1).
    const keep = (r + 1) * (r + 1);
    for (const [key, entry] of this.entries) {
      const dist = (entry.cx - pcx) * (entry.cx - pcx) + (entry.cz - pcz) * (entry.cz - pcz);
      if (dist > keep) {
        this.disposeEntryMeshes(entry);
        this.entries.delete(key);
        this.desired.delete(key);
      }
    }

    // Rebuild the queue nearest-first.
    this.queue = [];
    for (const key of this.desired) {
      const entry = this.entries.get(key)!;
      if (entry.state === 'queued') this.queue.push(entry);
    }
    this.queue.sort(
      (a, b) => (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2 - ((b.cx - pcx) ** 2 + (b.cz - pcz) ** 2),
    );
    this.pump();
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (entry.state !== 'queued') continue;
      const worker = this.idle.pop()!;
      entry.state = 'loading';
      this.busy.set(worker, chunkKey(entry.cx, entry.cz));
      worker.postMessage({
        reqId: chunkKey(entry.cx, entry.cz),
        cx: entry.cx,
        cz: entry.cz,
        seed: this.seed,
      });
    }
  }

  /** Recover from a worker crash: requeue its chunk and free the worker. */
  private onWorkerError(worker: Worker): void {
    const key = this.busy.get(worker);
    this.busy.delete(worker);
    if (key !== undefined) {
      const entry = this.entries.get(key);
      if (entry && entry.state === 'loading' && this.desired.has(key)) {
        entry.state = 'queued';
        this.queue.push(entry);
      }
    }
    if (!this.idle.includes(worker)) this.idle.push(worker);
    this.pump();
  }

  private buildMesh(g: GroupPayload, cx: number, cz: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(g.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  private disposeEntryMeshes(entry: ChunkEntry): void {
    if (entry.mesh) {
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh = undefined;
    }
    if (entry.emissiveMesh) {
      this.scene.remove(entry.emissiveMesh);
      entry.emissiveMesh.geometry.dispose();
      entry.emissiveMesh = undefined;
    }
    this.props?.removeChunk(chunkKey(entry.cx, entry.cz));
  }

  private onWorkerMessage(worker: Worker, resp: ChunkResponse): void {
    this.idle.push(worker);
    this.busy.delete(worker);
    const key = chunkKey(resp.cx, resp.cz);
    const entry = this.entries.get(key);
    // Discard only if the chunk was fully unloaded (entry gone). A kept-but-not-
    // desired chunk still gets its mesh so it never stalls in 'loading'.
    if (!entry) {
      this.pump();
      return;
    }
    // Drop any prior meshes first, in case a re-dispatch produced two results.
    this.disposeEntryMeshes(entry);
    entry.state = 'ready';
    if (resp.opaque) {
      entry.mesh = this.buildMesh(resp.opaque, resp.cx, resp.cz, this.material);
      this.scene.add(entry.mesh);
    }
    if (resp.emissive) {
      entry.emissiveMesh = this.buildMesh(resp.emissive, resp.cx, resp.cz, this.emissiveMaterial);
      this.scene.add(entry.emissiveMesh);
    }
    if (resp.props.length > 0) this.props?.addChunk(key, resp.props);
    this.pump();
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    for (const entry of this.entries.values()) this.disposeEntryMeshes(entry);
    this.entries.clear();
    this.material.dispose();
    this.emissiveMaterial.dispose();
  }
}
