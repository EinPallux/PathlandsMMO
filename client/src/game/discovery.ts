// Fog-of-discovery: a coarse grid over the continent, revealed as the player
// explores. Persisted to localStorage keyed by world seed (a Phase-2 stopgap;
// Phase 3 folds this into the versioned character save).

import { WORLD_SIZE_X, WORLD_SIZE_Z } from '@pathlands/shared';

export const DISCO_N = 48;
const REVEAL_RADIUS = 2; // cells (~128 m) revealed around the player

export class Discovery {
  readonly grid = new Uint8Array(DISCO_N * DISCO_N);
  readonly n = DISCO_N;
  private readonly key: string;
  private saveTimer = 0;
  private dirty = false;

  constructor(seed: number) {
    this.key = `pathlands.disco.${seed}`;
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return;
      const bin = atob(raw);
      for (let i = 0; i < this.grid.length && i < bin.length; i++) {
        this.grid[i] = bin.charCodeAt(i) ? 1 : 0;
      }
    } catch {
      // ignore corrupt / unavailable storage
    }
  }

  private save(): void {
    try {
      let s = '';
      for (let i = 0; i < this.grid.length; i++) s += String.fromCharCode(this.grid[i]! ? 1 : 0);
      localStorage.setItem(this.key, btoa(s));
    } catch {
      // ignore
    }
  }

  reveal(worldX: number, worldZ: number): void {
    const cx = Math.floor((worldX / WORLD_SIZE_X) * DISCO_N);
    const cz = Math.floor((worldZ / WORLD_SIZE_Z) * DISCO_N);
    for (let dz = -REVEAL_RADIUS; dz <= REVEAL_RADIUS; dz++) {
      for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= DISCO_N || z >= DISCO_N) continue;
        const idx = z * DISCO_N + x;
        if (!this.grid[idx]) {
          this.grid[idx] = 1;
          this.dirty = true;
        }
      }
    }
  }

  /** Call each frame with dt; flushes to storage a few seconds after changes. */
  tick(dt: number): void {
    if (!this.dirty) return;
    this.saveTimer += dt;
    if (this.saveTimer >= 3) {
      this.saveTimer = 0;
      this.dirty = false;
      this.save();
    }
  }
}
