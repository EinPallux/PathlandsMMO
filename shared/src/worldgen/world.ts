// Deterministic continent generation. Everything here is a pure function of the
// world seed: same seed + same code ⇒ byte-identical world on any machine
// (client worker, test, or the Phase-6 server). No Math.random, no wall-clock.

import {
  CHUNK_SIZE,
  CHUNK_AREA,
  WORLD_HEIGHT,
  SEA_LEVEL,
  BEACH_HEIGHT,
  SNOW_LINE,
  Voxel,
  isSolidVoxel,
} from '../core/constants.js';
import { Noise } from '../core/noise.js';
import { deriveSeed, hashFloat2, hashFloat3 } from '../core/rng.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { Biome, BIOMES, BIOME_LIST, normX, normZ } from './biomes.js';
import { AuthoredLayer } from './placement.js';
import type { PropId } from '../models/props/props.js';
import type { CreatureKind } from '../models/creatures/creatures.js';

/** One ambient wildlife spawn point (client renders & wanders it). */
export interface WildlifeSpawn {
  kind: CreatureKind;
  x: number;
  y: number;
  z: number;
}

/** One instanced decoration prop placed by the scatter (client renders it). */
export interface PropInstance {
  prop: PropId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface ColumnSample {
  /** Surface height (index of the topmost solid voxel). */
  readonly height: number;
  /** Dominant biome at this column. */
  readonly biome: Biome;
  /** Voxel material of the surface voxel. */
  readonly surface: Voxel;
  /** True when the surface is rock/snow/crystal (drives subsurface material). */
  readonly rocky: boolean;
}

export interface ChunkData {
  readonly cx: number;
  readonly cz: number;
  /** CHUNK_SIZE × CHUNK_SIZE × WORLD_HEIGHT voxel materials. */
  readonly voxels: Uint8Array;
  /** Per-column dominant biome (CHUNK_AREA entries), for mesh colouring. */
  readonly biomes: Uint8Array;
  /** Highest occupied voxel (terrain or water) in this chunk. */
  readonly maxY: number;
}

export function voxelIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * CHUNK_SIZE + ly * CHUNK_AREA;
}

interface BlendedParams {
  base: number;
  amp: number;
  ridgeAmp: number;
  primary: Biome;
  caves: boolean;
}

export class World {
  readonly seed: number;
  private readonly elev: Noise;
  private readonly warp: Noise;
  private readonly river: Noise;
  private readonly caveA: Noise;
  private readonly caveB: Noise;
  private readonly columnCache = new Map<number, ColumnSample>();
  /** Authored settlements/roads/structures layer (ARCH §4). */
  readonly authored: AuthoredLayer;

  constructor(seed: number) {
    this.seed = seed;
    this.elev = new Noise(deriveSeed(seed, 'elevation'));
    this.warp = new Noise(deriveSeed(seed, 'warp'));
    this.river = new Noise(deriveSeed(seed, 'river'));
    this.caveA = new Noise(deriveSeed(seed, 'caveA'));
    this.caveB = new Noise(deriveSeed(seed, 'caveB'));
    this.authored = new AuthoredLayer(seed, (x, z) => this.baseHeightAt(x, z));
  }

  // --- Biome blending -------------------------------------------------------

  /** Blend zone parameters by inverse-square proximity to the two nearest centres. */
  private blendedParams(x: number, z: number): BlendedParams {
    // Domain-warp normalised coords so zone borders wiggle rather than being straight.
    const wnx = normX(x) + this.warp.perlin2(x * 0.0009, z * 0.0009) * 0.06;
    const wnz = normZ(z) + this.warp.perlin2(x * 0.0009 + 53.1, z * 0.0009 + 53.1) * 0.06;

    let wsum = 0;
    let base = 0;
    let amp = 0;
    let ridgeAmp = 0;
    let bestW = -1;
    let primary = Biome.Vale;
    let primaryCaves = false;

    for (const p of BIOME_LIST) {
      const dx = wnx - p.cx;
      const dz = wnz - p.cz;
      const d2 = dx * dx + dz * dz + 1e-4;
      const w = 1 / (d2 * d2); // inverse 4th power → tight cells, smooth seams
      wsum += w;
      base += w * p.base;
      amp += w * p.amp;
      ridgeAmp += w * p.ridgeAmp;
      if (w > bestW) {
        bestW = w;
        primary = p.biome;
        primaryCaves = p.caves;
      }
    }

    return {
      base: base / wsum,
      amp: amp / wsum,
      ridgeAmp: ridgeAmp / wsum,
      primary,
      caves: primaryCaves,
    };
  }

  /** Dominant biome at a world column. */
  biomeAt(x: number, z: number): Biome {
    return this.blendedParams(x, z).primary;
  }

  // --- Elevation ------------------------------------------------------------

  /** Raise crag walls at the north & east world edges (impassable borders). */
  private cragRise(nx: number, nz: number): number {
    const north = 1 - smoothstep(0.05, 0.13, nz);
    const east = smoothstep(0.87, 0.96, nx);
    return Math.max(north, east) * 82;
  }

  /** Drop terrain into the sea at the south & west world edges. */
  private seaFalloff(nx: number, nz: number): number {
    const south = smoothstep(0.88, 1.0, nz);
    const west = 1 - smoothstep(0.0, 0.1, nx);
    return Math.max(south, west) * 64;
  }

  /** Natural terrain height, before the authored layer flattens/grades it. */
  private baseHeightAt(x: number, z: number): number {
    const p = this.blendedParams(x, z);

    // Warp the sampling position for more organic hills.
    const wx = x + this.warp.perlin2(x * 0.004 + 11.7, z * 0.004 + 11.7) * 26;
    const wz = z + this.warp.perlin2(x * 0.004 + 71.3, z * 0.004 + 71.3) * 26;

    const hills = this.elev.fbm2(wx, wz, 5, 0.0055);
    let h = p.base + hills * p.amp;

    if (p.ridgeAmp > 0.5) {
      const ridge = this.elev.ridged2(wx, wz, 4, 0.0042);
      h += ridge * p.ridgeAmp;
    }

    const nx = normX(x);
    const nz = normZ(z);
    h += this.cragRise(nx, nz);
    h -= this.seaFalloff(nx, nz);

    // Rivers: carve meandering channels through lowlands down toward the water table.
    if (h < 88) {
      const r = Math.abs(this.river.perlin2(x * 0.0016, z * 0.0016));
      if (r < 0.03) {
        const t = smoothstep(0.03, 0.006, r);
        h = lerp(h, SEA_LEVEL - 2, t * 0.9);
      }
    }

    return Math.round(clamp(h, 3, WORLD_HEIGHT - 2));
  }

  /** Surface height with settlement platforms and road grading applied. */
  heightAt(x: number, z: number): number {
    return this.authored.flatten(x, z, this.baseHeightAt(x, z));
  }

  // --- Surface material -----------------------------------------------------

  private pickSurface(x: number, z: number, h: number, biome: Biome, slope: number): Voxel {
    if (h <= SEA_LEVEL) return Voxel.Sand; // seabed
    if (h <= SEA_LEVEL + BEACH_HEIGHT) return Voxel.Sand; // beach
    const road = this.authored.roadSurface(x, z);
    if (road !== null) return road; // roads & plazas
    if (biome === Biome.Peaks) {
      if (h > SNOW_LINE) return Voxel.Snow;
      return hashFloat2(x, z, this.seed ^ 0x51a1) < 0.14 ? Voxel.CrystalRock : Voxel.Rock;
    }
    if (slope >= 4) return Voxel.Rock; // exposed cliff band
    if (h > SNOW_LINE + 8) return Voxel.Snow; // snowy tops elsewhere (Trollmoor peaks)
    return Voxel.Grass;
  }

  /** Sample a column's height, biome, and surface material (memoised). */
  sampleColumn(x: number, z: number): ColumnSample {
    // Offset-packed key: collision-free for any coord in [-4096, 4092] (covers the
    // 3072-wide world plus out-of-bounds neighbour/camera queries).
    const key = ((x | 0) + 4096) * 8192 + ((z | 0) + 4096);
    const cached = this.columnCache.get(key);
    if (cached) return cached;

    const h = this.heightAt(x, z);
    const biome = this.biomeAt(x, z);
    const slope = Math.max(
      Math.abs(h - this.heightAt(x + 1, z)),
      Math.abs(h - this.heightAt(x - 1, z)),
      Math.abs(h - this.heightAt(x, z + 1)),
      Math.abs(h - this.heightAt(x, z - 1)),
    );
    const surface = this.pickSurface(x, z, h, biome, slope);
    const rocky = surface === Voxel.Rock || surface === Voxel.CrystalRock || surface === Voxel.Snow;

    const sample: ColumnSample = { height: h, biome, surface, rocky };
    if (this.columnCache.size > 24000) this.columnCache.clear();
    this.columnCache.set(key, sample);
    return sample;
  }

  // --- Caves ----------------------------------------------------------------

  private caveCarved(x: number, y: number, z: number, h: number): boolean {
    if (y < 6 || y > h - 4) return false;
    const c1 = this.caveA.perlin3(x * 0.028, y * 0.045, z * 0.028);
    const c2 = this.caveB.perlin3(x * 0.028, y * 0.045, z * 0.028);
    return c1 * c1 + c2 * c2 < 0.018;
  }

  /**
   * Deep-stone material for a column below the dirt/rock cap. Peaks sprinkles
   * CrystalRock veins into the stone; both the chunk mesher (`generateChunk`) and
   * the single-voxel collision path (`voxelAt`) must call this so they never
   * disagree on material (the "collision matches meshing" invariant — matters for
   * Phase 4 mining/harvest queries).
   */
  private deepStone(x: number, y: number, z: number, h: number, biome: Biome): Voxel {
    if (biome === Biome.Peaks && y < h - 6 && hashFloat3(x, y, z, this.seed) < 0.02) {
      return Voxel.CrystalRock;
    }
    return Voxel.Stone;
  }

  // --- Single-voxel query (collision) ---------------------------------------

  voxelAt(x: number, y: number, z: number): Voxel {
    if (y < 0) return Voxel.Stone;
    if (y >= WORLD_HEIGHT) return Voxel.Air;
    // Stamped structures (buildings, Waystones, Hollow portals…) override terrain.
    const st = this.authored.structureVoxelAt(x, y, z);
    if (st !== Voxel.Air) return st;
    const s = this.sampleColumn(x, z);
    const h = s.height;
    // Hollow bowls carve the terrain into a pit (flooded at/below sea level).
    const bf = this.authored.bowlFloorAt(x, z);
    if (bf !== null && y > bf && y <= h) {
      return y <= SEA_LEVEL ? Voxel.Water : Voxel.Air;
    }
    if (y <= h) {
      if (BIOMES[s.biome].caves && this.caveCarved(x, y, z, h)) return Voxel.Air;
      if (y === h) return s.surface;
      if (y > h - 3)
        return s.rocky ? Voxel.Stone : s.surface === Voxel.Sand ? Voxel.Sand : Voxel.Dirt;
      return this.deepStone(x, y, z, h, s.biome);
    }
    if (y <= SEA_LEVEL) return Voxel.Water;
    return Voxel.Air;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolidVoxel(this.voxelAt(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  isFluidAt(x: number, y: number, z: number): boolean {
    return this.voxelAt(Math.floor(x), Math.floor(y), Math.floor(z)) === Voxel.Water;
  }

  // --- Chunk generation -----------------------------------------------------

  generateChunk(cx: number, cz: number): ChunkData {
    const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    const biomes = new Uint8Array(CHUNK_AREA);
    let maxY = 0;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const s = this.sampleColumn(wx, wz);
        const h = s.height;
        const biome = s.biome;
        const hasCaves = BIOMES[biome].caves;
        biomes[lx + lz * CHUNK_SIZE] = biome;

        // Solid column, top-down, with optional cave carving.
        for (let y = 0; y <= h && y < WORLD_HEIGHT; y++) {
          if (hasCaves && this.caveCarved(wx, y, wz, h)) continue; // air pocket
          let v: Voxel;
          if (y === h) {
            v = s.surface;
          } else if (y > h - 3) {
            v = s.rocky ? Voxel.Stone : s.surface === Voxel.Sand ? Voxel.Sand : Voxel.Dirt;
          } else {
            v = this.deepStone(wx, y, wz, h, biome);
          }
          voxels[voxelIndex(lx, y, lz)] = v;
        }

        // Carve Hollow bowls (a pit down to the sealed portal), flooding any
        // carved space at/below sea level (the Sunken Crypt).
        const bf = this.authored.bowlFloorAt(wx, wz);
        if (bf !== null) {
          for (let y = bf + 1; y <= h && y < WORLD_HEIGHT; y++) {
            voxels[voxelIndex(lx, y, lz)] = y <= SEA_LEVEL ? Voxel.Water : Voxel.Air;
          }
        }

        // Water fill above terrain up to sea level (oceans, rivers, lakes).
        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) {
            if (voxels[voxelIndex(lx, y, lz)] === Voxel.Air) {
              voxels[voxelIndex(lx, y, lz)] = Voxel.Water;
            }
          }
        }

        const colTop = Math.max(h, h < SEA_LEVEL ? SEA_LEVEL : h);
        if (colTop > maxY) maxY = colTop;
      }
    }

    // Stamp authored structures (buildings, Waystones, wells…) into the chunk,
    // overwriting terrain/water and raising maxY so tall towers still mesh.
    this.authored.stampChunk(cx, cz, CHUNK_SIZE, (lx, ly, lz, m) => {
      if (ly < 0 || ly >= WORLD_HEIGHT) return;
      voxels[voxelIndex(lx, ly, lz)] = m;
      if (ly > maxY) maxY = ly;
    });

    return { cx, cz, voxels, biomes, maxY: Math.min(maxY, WORLD_HEIGHT - 1) };
  }

  // --- Deterministic prop scatter (instanced decoration) --------------------

  /**
   * Deterministic decoration props for a chunk (trees, rocks, flora, gathering-
   * node shells). Rendered as InstancedMesh by the client; not stamped into the
   * voxel field, so thousands are cheap. Avoids settlements, roads, and water.
   */
  scatterChunk(cx: number, cz: number): PropInstance[] {
    const out: PropInstance[] = [];
    const salt = (n: number): number => this.seed ^ n;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        if (
          this.authored.isInSettlement(wx, wz) ||
          this.authored.isNearRoad(wx, wz) ||
          this.authored.isNearHollow(wx, wz)
        )
          continue;
        const s = this.sampleColumn(wx, wz);
        if (s.height <= SEA_LEVEL) continue;
        const yaw = hashFloat2(wx, wz, salt(0x9e1)) * Math.PI * 2;
        const y = s.height + 1;

        if (s.surface === Voxel.Grass) {
          const rt = hashFloat2(wx, wz, salt(0x7a1));
          const density = TREE_DENSITY[s.biome];
          if (rt < density) {
            out.push(
              inst(treeForBiome(s.biome, wx, wz, this.seed), wx, y, wz, yaw, wx, wz, this.seed),
            );
            continue;
          }
          const rf = hashFloat2(wx, wz, salt(0x33b));
          if (rf < 0.05) {
            out.push(
              inst(floraForBiome(s.biome, wx, wz, this.seed), wx, y, wz, yaw, wx, wz, this.seed),
            );
            continue;
          }
          const rh = hashFloat2(wx, wz, salt(0x5c2));
          if (rh < 0.0016) {
            const herb = s.biome === Biome.Trollmoor ? 'herbFen' : 'herbMeadow';
            out.push(inst(herb, wx, y, wz, yaw, wx, wz, this.seed));
          }
        } else if (s.surface === Voxel.Rock || s.surface === Voxel.CrystalRock) {
          const rr = hashFloat2(wx, wz, salt(0x55f));
          if (rr < 0.03) {
            out.push(
              inst(rockForBiome(s.biome, wx, wz, this.seed), wx, y, wz, yaw, wx, wz, this.seed),
            );
            continue;
          }
          if (s.height < SNOW_LINE && hashFloat2(wx, wz, salt(0x7a1)) < 0.012) {
            const pine = s.biome === Biome.Peaks ? 'treeCrystalPine' : 'treePine';
            out.push(inst(pine, wx, y, wz, yaw, wx, wz, this.seed));
            continue;
          }
          const ro = hashFloat2(wx, wz, salt(0x0e1));
          if (ro < 0.0018) {
            out.push(
              inst(oreForBiome(s.biome, wx, wz, this.seed), wx, y, wz, yaw, wx, wz, this.seed),
            );
          }
        } else if (s.surface === Voxel.Sand && s.biome === Biome.Coast) {
          if (hashFloat2(wx, wz, salt(0x7a1)) < 0.01) {
            out.push(inst('treePalm', wx, y, wz, yaw, wx, wz, this.seed));
          }
        }
      }
    }
    return out;
  }

  /**
   * Deterministic ambient wildlife for a chunk (sparse). Deer/rabbits/birds in
   * grassland, fish in shallow water, a rare Dire Stag in the Weald.
   */
  wildlifeChunk(cx: number, cz: number): WildlifeSpawn[] {
    const out: WildlifeSpawn[] = [];
    for (let lz = 2; lz < CHUNK_SIZE; lz += 5) {
      const wz = cz * CHUNK_SIZE + lz;
      for (let lx = 2; lx < CHUNK_SIZE; lx += 5) {
        const wx = cx * CHUNK_SIZE + lx;
        if (this.authored.isInSettlement(wx, wz)) continue;
        const s = this.sampleColumn(wx, wz);
        const r = hashFloat2(wx, wz, this.seed ^ 0xa11e);
        if (s.surface === Voxel.Grass && s.height > SEA_LEVEL) {
          if (r < 0.02) {
            let kind: CreatureKind;
            if (s.biome === Biome.Weald && r < 0.0008) kind = 'direStag';
            else if (r < 0.008) kind = 'deer';
            else if (r < 0.014) kind = 'rabbit';
            else kind = 'bird';
            out.push({ kind, x: wx + 0.5, y: s.height + 1, z: wz + 0.5 });
          }
        } else if (s.height <= SEA_LEVEL && s.height > SEA_LEVEL - 8 && r < 0.02) {
          out.push({ kind: 'fish', x: wx + 0.5, y: SEA_LEVEL, z: wz + 0.5 });
        }
      }
    }
    return out;
  }
}

// --- scatter helpers --------------------------------------------------------

const TREE_DENSITY: Record<Biome, number> = {
  [Biome.Vale]: 0.018,
  [Biome.Weald]: 0.042,
  [Biome.Foothills]: 0.012,
  [Biome.Peaks]: 0.0,
  [Biome.Trollmoor]: 0.011,
  [Biome.Coast]: 0.008,
};

function pick3(a: PropId, b: PropId, c: PropId, x: number, z: number, seed: number): PropId {
  const r = hashFloat2(x, z, seed ^ 0x1234) * 3;
  return r < 1 ? a : r < 2 ? b : c;
}

function treeForBiome(biome: Biome, x: number, z: number, seed: number): PropId {
  switch (biome) {
    case Biome.Weald:
      return pick3('treeMosswood', 'treeMosswood', 'treeOak', x, z, seed);
    case Biome.Foothills:
      return pick3('treeOak', 'treeDead', 'treePine', x, z, seed);
    case Biome.Trollmoor:
      return pick3('treeDead', 'treeBlighted', 'treeDead', x, z, seed);
    case Biome.Coast:
      return pick3('treeOak', 'treeBirch', 'treeOak', x, z, seed);
    default:
      return pick3('treeOak', 'treeBirch', 'treeOak', x, z, seed);
  }
}

function floraForBiome(biome: Biome, x: number, z: number, seed: number): PropId {
  if (biome === Biome.Weald) return pick3('fern', 'bush', 'fern', x, z, seed);
  if (biome === Biome.Trollmoor) return pick3('reeds', 'bush', 'flowerYellow', x, z, seed);
  if (biome === Biome.Vale) return pick3('flowerRed', 'flowerYellow', 'bush', x, z, seed);
  return pick3('bush', 'flowerYellow', 'fern', x, z, seed);
}

function rockForBiome(biome: Biome, x: number, z: number, seed: number): PropId {
  if (biome === Biome.Peaks) return pick3('rockCrystal', 'rockLarge', 'rockSmall', x, z, seed);
  return pick3('rockSmall', 'rockLarge', 'rockSmall', x, z, seed);
}

function oreForBiome(biome: Biome, x: number, z: number, seed: number): PropId {
  if (biome === Biome.Peaks) return pick3('oreSilver', 'oreCrystal', 'oreIron', x, z, seed);
  return pick3('oreCopper', 'oreIron', 'oreCopper', x, z, seed);
}

function inst(
  prop: PropId,
  x: number,
  y: number,
  z: number,
  yaw: number,
  hx: number,
  hz: number,
  seed: number,
): PropInstance {
  const scale = 0.82 + hashFloat2(hx, hz, seed ^ 0x2b7) * 0.42;
  return { prop, x: x + 0.5, y, z: z + 0.5, yaw, scale };
}
