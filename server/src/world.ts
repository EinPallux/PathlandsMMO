// The server's view of the world. It runs the SAME deterministic worldgen as the
// client (shared `World`, keyed by the one `WORLD_SEED`) but only asks it collision
// questions — no meshing, no chunk streaming. Same seed + same code ⇒ the server and
// every client agree on solidity and water to the voxel (ARCH §5), which is exactly
// what authoritative movement validation and client prediction both depend on.

import { World, WORLD_SEED, type VoxelSampler } from '@pathlands/shared';

export interface ServerWorld {
  readonly world: World;
  readonly sampler: VoxelSampler;
  /** Resolve a feet-Y a couple of voxels above the surface column at (x, z). */
  surfaceSpawnY(x: number, z: number): number;
}

export function createServerWorld(seed: number = WORLD_SEED): ServerWorld {
  const world = new World(seed);
  const sampler: VoxelSampler = {
    isSolid: (x, y, z) => world.isSolidAt(x, y, z),
    isFluid: (x, y, z) => world.isFluidAt(x, y, z),
  };
  return {
    world,
    sampler,
    surfaceSpawnY: (x, z) => world.heightAt(Math.floor(x), Math.floor(z)) + 2,
  };
}
