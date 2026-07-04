// Web Worker: generates and meshes a chunk off the main thread, returning
// transferable buffers. One World is cached per seed so noise tables are built once.

import { World } from '@pathlands/shared';
import { meshChunkData } from './chunkMesher.js';

interface ChunkRequest {
  reqId: number;
  cx: number;
  cz: number;
  seed: number;
}

interface ChunkResponse {
  reqId: number;
  cx: number;
  cz: number;
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  empty: boolean;
}

let world: World | null = null;
let currentSeed = Number.NaN;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent): void => {
  const { reqId, cx, cz, seed } = event.data as ChunkRequest;
  if (world === null || currentSeed !== seed) {
    world = new World(seed);
    currentSeed = seed;
  }
  const chunk = world.generateChunk(cx, cz);
  const m = meshChunkData(world, chunk);
  const response: ChunkResponse = {
    reqId,
    cx,
    cz,
    positions: m.positions,
    normals: m.normals,
    colors: m.colors,
    indices: m.indices,
    empty: m.indices.length === 0,
  };
  ctx.postMessage(response, [
    m.positions.buffer,
    m.normals.buffer,
    m.colors.buffer,
    m.indices.buffer,
  ]);
};

export type { ChunkRequest, ChunkResponse };
