// Web Worker: generates and meshes a chunk off the main thread, returning
// transferable buffers for the opaque and emissive material groups. One World is
// cached per seed so noise tables are built once.

import { World, type PropInstance } from '@pathlands/shared';
import { meshChunkData, GROUP_OPAQUE, GROUP_EMISSIVE } from './chunkMesher.js';

interface ChunkRequest {
  reqId: number;
  cx: number;
  cz: number;
  seed: number;
}

interface GroupPayload {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

interface ChunkResponse {
  reqId: number;
  cx: number;
  cz: number;
  opaque: GroupPayload | null;
  emissive: GroupPayload | null;
  props: PropInstance[];
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
  const groups = meshChunkData(world, chunk);
  const opaque = groups.get(GROUP_OPAQUE) ?? null;
  const emissive = groups.get(GROUP_EMISSIVE) ?? null;
  const props = world.scatterChunk(cx, cz);

  const response: ChunkResponse = { reqId, cx, cz, opaque, emissive, props };
  const transfer: Transferable[] = [];
  for (const g of [opaque, emissive]) {
    if (g) {
      transfer.push(
        g.positions.buffer as ArrayBuffer,
        g.normals.buffer as ArrayBuffer,
        g.colors.buffer as ArrayBuffer,
        g.indices.buffer as ArrayBuffer,
      );
    }
  }
  ctx.postMessage(response, transfer);
};

export type { ChunkRequest, ChunkResponse, GroupPayload };
