// Authoring helpers for code-built voxel models (ART_GUIDE §2). A VoxelSet is a
// mutable accumulator of coloured voxels with box/plate/set/mirror/translate ops.
// Later writes to the same cell overwrite earlier ones (paint-over semantics).

import type { ModelVoxel, ModelPart } from './types.js';

export class VoxelSet {
  private readonly cells = new Map<number, ModelVoxel>();

  private static key(x: number, y: number, z: number): number {
    // Pack into a single number; coords fit comfortably in ±512.
    return (x + 512) * 1_048_576 + (y + 512) * 1024 + (z + 512);
  }

  /** Set a single voxel (overwrites any existing colour at that cell). */
  set(x: number, y: number, z: number, c: number): this {
    this.cells.set(VoxelSet.key(x, y, z), { x, y, z, c });
    return this;
  }

  /** Fill an axis-aligned box: origin (x,y,z), size (w,h,d). */
  box(x: number, y: number, z: number, w: number, h: number, d: number, c: number): this {
    for (let dy = 0; dy < h; dy++) {
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) {
          this.set(x + dx, y + dy, z + dz, c);
        }
      }
    }
    return this;
  }

  /** Recolour existing voxels that satisfy a predicate (e.g. add stripes/masks). */
  paint(predicate: (v: ModelVoxel) => boolean, c: number): this {
    for (const v of this.cells.values()) {
      if (predicate(v)) v.c = c;
    }
    return this;
  }

  /** Remove voxels satisfying a predicate (carve openings). */
  carve(predicate: (v: ModelVoxel) => boolean): this {
    for (const [k, v] of this.cells) {
      if (predicate(v)) this.cells.delete(k);
    }
    return this;
  }

  /** Merge another set's voxels into this one (paint-over). */
  merge(other: VoxelSet): this {
    for (const v of other.cells.values()) this.set(v.x, v.y, v.z, v.c);
    return this;
  }

  /** Number of voxels currently in the set. */
  get size(): number {
    return this.cells.size;
  }

  /** Snapshot the voxels as a plain array. */
  voxels(): ModelVoxel[] {
    return Array.from(this.cells.values(), (v) => ({ ...v }));
  }

  /** Mirror voxels across the x = −0.5 plane, returning a NEW set (for L/R symmetry). */
  mirroredX(): VoxelSet {
    const out = new VoxelSet();
    for (const v of this.cells.values()) out.set(-1 - v.x, v.y, v.z, v.c);
    return out;
  }

  /** Translate all voxels, returning a NEW set. */
  translated(dx: number, dy: number, dz: number): VoxelSet {
    const out = new VoxelSet();
    for (const v of this.cells.values()) out.set(v.x + dx, v.y + dy, v.z + dz, v.c);
    return out;
  }
}

/** Build a part from a VoxelSet with a given pivot. */
export function part(name: string, pivot: [number, number, number], set: VoxelSet): ModelPart {
  return { name, pivot, voxels: set.voxels() };
}

/** Convenience: a fresh VoxelSet. */
export function vset(): VoxelSet {
  return new VoxelSet();
}
