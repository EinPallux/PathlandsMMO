// Main-thread chunk streaming: a pool of chunk workers generate+mesh chunks in a
// ring around the player; results become one Three.js mesh (one draw call) each.
// Chunks outside the ring are unloaded. Nearest-first dispatch keeps the world
// filling in around the player.

import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_CHUNKS_X, WORLD_CHUNKS_Z, WORLD_SEED } from '@pathlands/shared';
import type { ChunkResponse } from './chunkWorker.js';

interface ChunkEntry {
  cx: number;
  cz: number;
  state: 'queued' | 'loading' | 'ready';
  mesh?: THREE.Mesh;
}

const chunkKey = (cx: number, cz: number): number => cx * 1000 + cz;

export class ChunkManager {
  private readonly scene: THREE.Scene;
  private readonly seed: number;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly entries = new Map<number, ChunkEntry>();
  private readonly desired = new Set<number>();
  private queue: ChunkEntry[] = [];
  private lastCX = Number.NaN;
  private lastCZ = Number.NaN;
  private radius: number;

  constructor(scene: THREE.Scene, seed = WORLD_SEED, radius = 7, workerCount?: number) {
    this.scene = scene;
    this.seed = seed;
    this.radius = radius;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });

    const n = workerCount ?? Math.max(2, Math.min(6, (navigator.hardwareConcurrency ?? 4) - 1));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent) => this.onWorkerMessage(worker, e.data as ChunkResponse);
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
    for (const e of this.entries.values()) if (e.state === 'ready' && e.mesh) n++;
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
        if (entry.mesh) {
          this.scene.remove(entry.mesh);
          entry.mesh.geometry.dispose();
        }
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
      worker.postMessage({
        reqId: chunkKey(entry.cx, entry.cz),
        cx: entry.cx,
        cz: entry.cz,
        seed: this.seed,
      });
    }
  }

  private onWorkerMessage(worker: Worker, resp: ChunkResponse): void {
    this.idle.push(worker);
    const key = chunkKey(resp.cx, resp.cz);
    const entry = this.entries.get(key);
    // Discard results for chunks unloaded while in flight.
    if (!entry || !this.desired.has(key)) {
      this.pump();
      return;
    }
    entry.state = 'ready';
    if (!resp.empty) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(resp.positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(resp.normals, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(resp.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(resp.indices, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(resp.cx * CHUNK_SIZE, 0, resp.cz * CHUNK_SIZE);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      entry.mesh = mesh;
      this.scene.add(mesh);
    }
    this.pump();
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    for (const entry of this.entries.values()) {
      if (entry.mesh) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
      }
    }
    this.entries.clear();
    this.material.dispose();
  }
}
