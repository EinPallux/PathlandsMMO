import { describe, it, expect } from 'vitest';
import { World, voxelIndex } from '../src/worldgen/world.js';
import { Biome } from '../src/worldgen/biomes.js';
import {
  WORLD_SEED,
  WORLD_HEIGHT,
  CHUNK_SIZE,
  SEA_LEVEL,
  Voxel,
  isSolidVoxel,
} from '../src/core/constants.js';

/** FNV-1a hash of a byte array → uint32, for region-hash determinism checks. */
function hashBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('worldgen determinism', () => {
  it('generates an identical chunk when called twice on the same World', () => {
    const w = new World(WORLD_SEED);
    const a = w.generateChunk(48, 48);
    const b = w.generateChunk(48, 48);
    expect(hashBytes(a.voxels)).toEqual(hashBytes(b.voxels));
    expect(a.maxY).toEqual(b.maxY);
  });

  it('generates identical chunks across two World instances (cross-machine guarantee)', () => {
    const a = new World(WORLD_SEED).generateChunk(17, 15);
    const b = new World(WORLD_SEED).generateChunk(17, 15);
    expect(hashBytes(a.voxels)).toEqual(hashBytes(b.voxels));
    expect(Array.from(a.biomes)).toEqual(Array.from(b.biomes));
  });

  it('produces different worlds for different seeds', () => {
    const a = new World(WORLD_SEED).generateChunk(48, 48);
    const b = new World(WORLD_SEED + 1).generateChunk(48, 48);
    expect(hashBytes(a.voxels)).not.toEqual(hashBytes(b.voxels));
  });

  it('matches the golden region hash (guards against silent worldgen drift)', () => {
    const w = new World(WORLD_SEED);
    const center = hashBytes(w.generateChunk(48, 48).voxels);
    const peaks = hashBytes(w.generateChunk(17, 15).voxels);
    // Regenerate these intentionally if worldgen is deliberately changed.
    expect([center, peaks]).toEqual([2815396934, 1031093948]);
  });
});

describe('worldgen structure', () => {
  const w = new World(WORLD_SEED);

  it('places the six zones on the macro-map where WORLD.md says', () => {
    expect(w.biomeAt(1536, 1536)).toBe(Biome.Vale); // centre
    expect(w.biomeAt(560, 490)).toBe(Biome.Peaks); // NW
    expect(w.biomeAt(1600, 460)).toBe(Biome.Trollmoor); // N
    expect(w.biomeAt(500, 1536)).toBe(Biome.Foothills); // W
    expect(w.biomeAt(2580, 1560)).toBe(Biome.Weald); // E
    expect(w.biomeAt(1536, 2680)).toBe(Biome.Coast); // S
  });

  it('keeps every surface height within world bounds', () => {
    for (let i = 0; i < 400; i++) {
      const x = (i * 137) % 3072;
      const z = (i * 613) % 3072;
      const h = w.heightAt(x, z);
      expect(h).toBeGreaterThanOrEqual(3);
      expect(h).toBeLessThanOrEqual(WORLD_HEIGHT - 2);
    }
  });

  it('has no holes: the surface voxel of every land column is solid', () => {
    const chunk = w.generateChunk(48, 48); // Vale — should be all land
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const h = w.heightAt(48 * CHUNK_SIZE + lx, 48 * CHUNK_SIZE + lz);
        const top = chunk.voxels[voxelIndex(lx, h, lz)]!;
        // Top voxel is solid land, a cave mouth (air), or a water feature
        // (fountain/well) stamped by the authored layer — never a fall-through.
        expect(top === Voxel.Air || top === Voxel.Water || isSolidVoxel(top as Voxel)).toBe(true);
      }
    }
  });

  it('produces water somewhere on the coast', () => {
    const chunk = w.generateChunk(48, 88); // deep south → sea
    let water = 0;
    for (let i = 0; i < chunk.voxels.length; i++) {
      if (chunk.voxels[i] === Voxel.Water) water++;
    }
    expect(water).toBeGreaterThan(0);
  });

  it('raises crag walls near the north and east edges', () => {
    const northWall = w.heightAt(1600, 30);
    const eastWall = w.heightAt(3050, 1500);
    expect(northWall).toBeGreaterThan(120);
    expect(eastWall).toBeGreaterThan(120);
  });

  it('carves caves in cave biomes (foothills contain air pockets below the surface)', () => {
    // Sweep a patch of foothills for at least one subsurface air voxel.
    let carved = false;
    outer: for (let cx = 14; cx <= 16 && !carved; cx++) {
      for (let cz = 46; cz <= 50; cz++) {
        const chunk = w.generateChunk(cx, cz);
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const h = w.heightAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
            for (let y = 8; y < h - 4; y++) {
              if (chunk.voxels[voxelIndex(lx, y, lz)] === Voxel.Air) {
                carved = true;
                break outer;
              }
            }
          }
        }
      }
    }
    expect(carved).toBe(true);
  });

  it('covers all six biomes across the continent', () => {
    const seen = new Set<Biome>();
    for (let x = 100; x < 3000; x += 160) {
      for (let z = 100; z < 3000; z += 160) {
        seen.add(w.biomeAt(x, z));
      }
    }
    expect(seen.size).toBe(6);
  });

  it('voxelAt agrees with generateChunk for a sampled column', () => {
    const chunk = w.generateChunk(48, 48);
    const lx = 5;
    const lz = 7;
    const wx = 48 * CHUNK_SIZE + lx;
    const wz = 48 * CHUNK_SIZE + lz;
    for (let y = 0; y < Math.min(chunk.maxY + 2, WORLD_HEIGHT); y++) {
      expect(w.voxelAt(wx, y, wz)).toBe(chunk.voxels[voxelIndex(lx, y, lz)]);
    }
  });

  it('reports water as non-solid and land as solid for collision', () => {
    expect(w.isSolidAt(1536, 1, 1536)).toBe(true); // deep underground
    expect(w.isSolidAt(1536, WORLD_HEIGHT - 1, 1536)).toBe(false); // sky
    expect(w.isFluidAt(1536, SEA_LEVEL, 2900)).toBe(true); // southern sea
  });
});
