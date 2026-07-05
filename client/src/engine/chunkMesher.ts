// Bridges deterministic worldgen (shared) to the greedy mesher. Given a generated
// chunk, produces render buffers per material group (0 = opaque, 1 = emissive),
// culling correctly across chunk borders by querying the World for out-of-chunk
// neighbours. Pure — runs inside the chunk Web Worker.

import {
  voxelIndex,
  isSolidVoxel,
  isEmissiveVoxel,
  terrainColor,
  CHUNK_SIZE,
  WORLD_HEIGHT,
  type World,
  type ChunkData,
  type Voxel,
  type Biome,
} from '@pathlands/shared';
import { meshVolumeGrouped, type MeshBuffers } from './greedyMesh.js';

export const GROUP_OPAQUE = 0;
export const GROUP_EMISSIVE = 1;

export function meshChunkData(world: World, chunk: ChunkData): Map<number, MeshBuffers> {
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
    return world.isSolidAt(baseX + lx, ly, baseZ + lz);
  };

  const color = (lx: number, ly: number, lz: number): number => {
    const v = voxels[voxelIndex(lx, ly, lz)]! as Voxel;
    const biome = biomes[lx + lz * CHUNK_SIZE]! as Biome;
    return terrainColor(v, biome);
  };

  const group = (lx: number, ly: number, lz: number): number =>
    isEmissiveVoxel(voxels[voxelIndex(lx, ly, lz)]! as Voxel) ? GROUP_EMISSIVE : GROUP_OPAQUE;

  return meshVolumeGrouped(CHUNK_SIZE, ny, CHUNK_SIZE, solid, color, group);
}
