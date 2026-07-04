// Bridges deterministic worldgen (shared) to the greedy mesher. Given a generated
// chunk, produces render buffers, culling correctly across chunk borders by querying
// the World for out-of-chunk neighbours. Pure — runs inside the chunk Web Worker.

import {
  voxelIndex,
  isSolidVoxel,
  terrainColor,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  type World,
  type ChunkData,
  type Voxel,
  type Biome,
} from '@pathlands/shared';
import { meshVolume, type MeshBuffers } from './greedyMesh.js';

export function meshChunkData(world: World, chunk: ChunkData): MeshBuffers {
  const { cx, cz, voxels, biomes, maxY } = chunk;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const ny = Math.min(WORLD_HEIGHT, maxY + 2);

  const solid = (lx: number, ly: number, lz: number): boolean => {
    if (ly < 0) return true;
    if (ly >= WORLD_HEIGHT) return false;
    if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) {
      return isSolidVoxel(voxels[voxelIndex(lx, ly, lz)]! as Voxel);
    }
    // Neighbour chunk — deterministic single-voxel query.
    return world.isSolidAt(baseX + lx, ly, baseZ + lz);
  };

  const color = (lx: number, ly: number, lz: number): number => {
    const v = voxels[voxelIndex(lx, ly, lz)]! as Voxel;
    const biome = biomes[lx + lz * CHUNK_SIZE]! as Biome;
    return terrainColor(v, biome);
  };

  return meshVolume(CHUNK_SIZE, ny, CHUNK_SIZE, solid, color);
}
