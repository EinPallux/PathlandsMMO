// The authored layer: turns settlement/road data into concrete world voxels and
// terrain modifications, deterministically. Owns:
//  - platform flattening (settlements) and road grading, applied inside heightAt
//  - road/plaza surface material selection
//  - stamped structures (buildings + fixtures) as world voxels, for both chunk
//    meshing and single-voxel collision queries
// Pure: constructed with a base-height callback; caches everything lazily.

import { Voxel } from '../core/constants.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import { makeRng } from '../core/rng.js';
import { getBuilding, type BuildingId } from '../models/structures/buildings.js';
import { getFixture, buildHollowEntrance } from '../models/structures/fixtures.js';
import type { Building } from '../models/structures/kit.js';
import type { NpcKind } from '../models/characters/npcs.js';
import { SETTLEMENTS, ROADS, WILD_WAYSTONES, HOLLOWS, type Settlement } from './settlements.js';

const HOLLOW_R = 11; // bowl radius
const HOLLOW_DEPTH = 7; // bowl depth at centre
const HOLLOW_FLATTEN_R = 16;

export interface NpcSpawn {
  id: string;
  kind: NpcKind;
  name: string;
  seed: number;
  x: number;
  y: number;
  z: number;
  dialogue: string[];
}

const NPC_NAMES = [
  'Alda',
  'Bram',
  'Corry',
  'Dunn',
  'Elsie',
  'Fenn',
  'Gwyn',
  'Harl',
  'Isolde',
  'Joss',
  'Kellen',
  'Lark',
  'Mabel',
  'Nolan',
  'Orin',
  'Petra',
];

const VILLAGER_LINES = [
  'Fair day on the Old Road, Wayfarer.',
  'They say a Waystone woke to the south. Strange times.',
  'Mind the Weald after dark — the moss glows green now.',
  'A Wayfarer! Not many can light the old stones these days.',
];
const GUARD_LINES = [
  'Keep to the paths, traveller.',
  'Trouble stirs beyond the walls. Stay sharp.',
];
const VENDOR_LINES = [
  'Wares? Come back when the coin flows, friend.',
  'Finest goods this side of Waymeet — soon as I restock.',
];

function linesFor(kind: NpcKind): string[] {
  if (kind === 'guard') return GUARD_LINES;
  if (kind === 'vendor') return VENDOR_LINES;
  return VILLAGER_LINES;
}

const PLOT = 18; // grid spacing between building plots
const ROAD_HALF = 3; // road half-width (metres)
const ROAD_RAMP = 5; // grading falloff beyond the road edge
const SETTLEMENT_APRON = 16; // graded ramp width beyond the flat building plateau

/**
 * Radius of the fully-flat settlement plateau. Buildings sit on a square
 * Chebyshev grid, so the outermost corner plots are `rings·PLOT·√2` from centre;
 * the plateau must reach at least that far plus a PLOT-wide margin for their
 * footprints, or outer-ring buildings stamp over unflattened terrain and float
 * (or bury). Deriving the flatten radius from the grid — rather than the authored
 * circular `radius`, which was smaller than the grid for several towns — keeps
 * the flat ground and the building layout in lockstep. Both `flatten` and scatter
 * exclusion use this.
 */
function settlementFlatRadius(s: Settlement): number {
  return s.rings * PLOT * Math.SQRT2 + PLOT;
}

interface PlacedStructure {
  worldVoxels: Int32Array; // packed [x,y,z,material] × n
  count: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface RoadSeg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hA: number;
  hB: number;
}

type Rot = 0 | 1 | 2 | 3;

function rotX(x: number, z: number, r: Rot): number {
  switch (r) {
    case 0:
      return x;
    case 1:
      return -z;
    case 2:
      return -x;
    case 3:
      return z;
  }
}
function rotZ(x: number, z: number, r: Rot): number {
  switch (r) {
    case 0:
      return z;
    case 1:
      return x;
    case 2:
      return -z;
    case 3:
      return -x;
  }
}

/**
 * Deterministic 2D Euclidean distance. `Math.hypot` is only
 * "implementation-approximated" by the spec and can diverge ~1 ULP across JS
 * engines; since these distances flow through `Math.round` into stamped terrain
 * and carve heights, that could produce a non-byte-identical world between a
 * non-V8 browser worker and the Phase-6 server. `Math.sqrt` is IEEE-754
 * correctly-rounded and identical everywhere (same reasoning as movement.ts).
 */
function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Squared distance from point to segment plus the clamped param t along it. */
function segDist(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: dist2(px, pz, cx, cz), t };
}

function packKey(x: number, y: number, z: number): number {
  return ((x + 4096) * 8192 + (z + 4096)) * 256 + (y & 0xff);
}

export class AuthoredLayer {
  private readonly seed: number;
  private readonly baseHeightAt: (x: number, z: number) => number;
  private readonly platformCache = new Map<string, number>();
  private placed: PlacedStructure[] | null = null;
  private voxelMap: Map<number, Voxel> | null = null;
  private roadSegments: RoadSeg[] | null = null;

  constructor(seed: number, baseHeightAt: (x: number, z: number) => number) {
    this.seed = seed;
    this.baseHeightAt = baseHeightAt;
  }

  /** Flattened platform height for a settlement (base terrain at its centre). */
  platformY(s: Settlement): number {
    const cached = this.platformCache.get(s.id);
    if (cached !== undefined) return cached;
    // Average a few points so a single noisy spot doesn't set the platform.
    const h = Math.round(
      (this.baseHeightAt(s.cx, s.cz) +
        this.baseHeightAt(s.cx + 8, s.cz) +
        this.baseHeightAt(s.cx, s.cz + 8) +
        this.baseHeightAt(s.cx - 8, s.cz - 8)) /
        4,
    );
    this.platformCache.set(s.id, h);
    return h;
  }

  private ensureRoads(): void {
    if (this.roadSegments) return;
    const segs: RoadSeg[] = [];
    for (const road of ROADS) {
      // Height at each node: settlement platform if a node coincides with one,
      // else base terrain.
      const nodeH = road.nodes.map((n) => {
        const s = SETTLEMENTS.find((st) => dist2(st.cx, st.cz, n.x, n.z) < 4);
        return s ? this.platformY(s) : this.baseHeightAt(n.x, n.z);
      });
      for (let i = 0; i < road.nodes.length - 1; i++) {
        const a = road.nodes[i]!;
        const b = road.nodes[i + 1]!;
        segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, hA: nodeH[i]!, hB: nodeH[i + 1]! });
      }
    }
    this.roadSegments = segs;
  }

  /** Base terrain height at a Hollow's mouth (cached). */
  private hollowPlatformY(id: string, x: number, z: number): number {
    const key = `hollow-${id}`;
    const cached = this.platformCache.get(key);
    if (cached !== undefined) return cached;
    const h = Math.round(this.baseHeightAt(x, z));
    this.platformCache.set(key, h);
    return h;
  }

  /**
   * If (x,z) is inside a Hollow bowl, the carved ground height there (a shallow
   * pit descending to a sealed portal); otherwise null.
   */
  bowlFloorAt(x: number, z: number): number | null {
    for (const hollow of HOLLOWS) {
      const d = dist2(x, z, hollow.x, hollow.z);
      if (d < HOLLOW_R) {
        const h0 = this.hollowPlatformY(hollow.id, hollow.x, hollow.z);
        return h0 - Math.round(HOLLOW_DEPTH * (1 - d / HOLLOW_R));
      }
    }
    return null;
  }

  /** Apply settlement flattening and road grading to a base height. */
  flatten(x: number, z: number, baseH: number): number {
    let h = baseH;
    // Settlement platforms: flat plateau covering the whole building grid, then a
    // graded apron ramping back to natural terrain (nearest wins).
    for (const s of SETTLEMENTS) {
      const coreR = settlementFlatRadius(s);
      const apronR = coreR + SETTLEMENT_APRON;
      const d = dist2(x, z, s.cx, s.cz);
      if (d < apronR) {
        const t = d <= coreR ? 1 : smoothstep(apronR, coreR, d);
        h = lerp(h, this.platformY(s), t);
      }
    }
    // Hollow entrance aprons (flat rim around each pit).
    for (const hollow of HOLLOWS) {
      const d = dist2(x, z, hollow.x, hollow.z);
      if (d < HOLLOW_FLATTEN_R) {
        const t = smoothstep(HOLLOW_FLATTEN_R, HOLLOW_FLATTEN_R * 0.5, d);
        h = lerp(h, this.hollowPlatformY(hollow.id, hollow.x, hollow.z), t);
      }
    }
    // Road grading.
    this.ensureRoads();
    for (const seg of this.roadSegments!) {
      const { d, t } = segDist(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      if (d < ROAD_HALF + ROAD_RAMP) {
        const target = lerp(seg.hA, seg.hB, t);
        const w = smoothstep(ROAD_HALF + ROAD_RAMP, ROAD_HALF, d);
        h = lerp(h, target, w * 0.85);
      }
    }
    return Math.round(h);
  }

  /** Surface material override for roads and settlement plazas (or null). */
  roadSurface(x: number, z: number): Voxel | null {
    for (const s of SETTLEMENTS) {
      if (dist2(x, z, s.cx, s.cz) < s.radius * 0.42) return Voxel.Path;
    }
    this.ensureRoads();
    for (const seg of this.roadSegments!) {
      if (segDist(x, z, seg.ax, seg.az, seg.bx, seg.bz).d < ROAD_HALF) return Voxel.Path;
    }
    return null;
  }

  /** True if (x,z) lies on any settlement's flat plateau (keeps scatter out of towns). */
  isInSettlement(x: number, z: number): boolean {
    for (const s of SETTLEMENTS) {
      if (dist2(x, z, s.cx, s.cz) < settlementFlatRadius(s)) return true;
    }
    return false;
  }

  /** True if (x,z) is inside a Hollow's carved bowl or flattened apron (keeps scatter
   * out of the pit so props don't hover over the void or clip the entrance portal). */
  isNearHollow(x: number, z: number): boolean {
    for (const hollow of HOLLOWS) {
      if (dist2(x, z, hollow.x, hollow.z) < HOLLOW_FLATTEN_R) return true;
    }
    return false;
  }

  isNearRoad(x: number, z: number): boolean {
    this.ensureRoads();
    for (const seg of this.roadSegments!) {
      if (segDist(x, z, seg.ax, seg.az, seg.bx, seg.bz).d < ROAD_HALF + 2) return true;
    }
    return false;
  }

  // --- Structure stamping ---------------------------------------------------

  private facingRotation(gx: number, gz: number): Rot {
    if (Math.abs(gx) >= Math.abs(gz)) return gx > 0 ? 3 : 1;
    return gz > 0 ? 0 : 2;
  }

  private stamp(
    out: PlacedStructure[],
    map: Map<number, Voxel>,
    b: Building,
    pcx: number,
    pcz: number,
    py: number,
    r: Rot,
  ): void {
    const cx = b.min.x + b.width / 2 - 0.5;
    const cz = b.min.z + b.depth / 2 - 0.5;
    const vox = b.set.voxels();
    const arr = new Int32Array(vox.length * 4);
    let n = 0;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const v of vox) {
      const rx = v.x - cx;
      const rz = v.z - cz;
      const wx = Math.round(pcx + rotX(rx, rz, r));
      const wz = Math.round(pcz + rotZ(rx, rz, r));
      const wy = py + v.y;
      if (wy < 0 || wy > 255) continue;
      arr[n * 4] = wx;
      arr[n * 4 + 1] = wy;
      arr[n * 4 + 2] = wz;
      arr[n * 4 + 3] = v.c;
      n++;
      map.set(packKey(wx, wy, wz), v.c as Voxel);
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
    out.push({ worldVoxels: arr, count: n, minX, maxX, minZ, maxZ });
  }

  private ensurePlaced(): void {
    if (this.placed) return;
    const out: PlacedStructure[] = [];
    const map = new Map<number, Voxel>();

    for (const s of SETTLEMENTS) {
      const py = this.platformY(s);
      const rng = makeRng(this.seed, 'settle', s.id);

      // Plaza centre fixture + a Waystone just off-centre.
      const centre = s.centre === 'fountain' ? getBuilding('fountain') : getFixture('well');
      this.stamp(out, map, centre, s.cx, s.cz, py, 0);
      this.stamp(out, map, getFixture('waystone'), s.cx - 7, s.cz - 7, py, 0);
      this.stamp(out, map, getFixture('signpost'), s.cx + 5, s.cz + s.radius * 0.6, py, 0);

      // Reserved plaza-adjacent plots.
      const reserved = new Set<string>();
      if (s.hasChurch) {
        this.stamp(out, map, getBuilding('church'), s.cx, s.cz - PLOT, py, 0);
        reserved.add('0,-1');
      }
      if (s.hasInn) {
        this.stamp(out, map, getBuilding('inn'), s.cx, s.cz + PLOT, py, 2);
        reserved.add('0,1');
      }

      // Ring plots filled from the palette.
      for (let ring = 1; ring <= s.rings; ring++) {
        for (let gz = -ring; gz <= ring; gz++) {
          for (let gx = -ring; gx <= ring; gx++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== ring) continue;
            const keyStr = `${gx},${gz}`;
            if (reserved.has(keyStr)) continue;
            // leave the plaza-front axis a bit open for the road
            if (gx === 0 && Math.abs(gz) === ring && ring > 1 && rng.chance(0.35)) continue;
            const bId = s.palette[rng.int(0, s.palette.length - 1)] as BuildingId;
            const r = this.facingRotation(gx, gz);
            this.stamp(out, map, getBuilding(bId), s.cx + gx * PLOT, s.cz + gz * PLOT, py, r);
          }
        }
      }
    }

    // Wilderness Waystones sit on the natural ground.
    for (const w of WILD_WAYSTONES) {
      const py = this.baseHeightAt(w.x, w.z);
      this.stamp(out, map, getFixture('waystone'), w.x, w.z, py, 0);
    }

    // Hollow entrance portals sit at the bottom of their carved bowls.
    for (const hollow of HOLLOWS) {
      const py = this.hollowPlatformY(hollow.id, hollow.x, hollow.z) - HOLLOW_DEPTH;
      this.stamp(out, map, buildHollowEntrance(hollow.theme), hollow.x, hollow.z, py, 0);
    }

    this.placed = out;
    this.voxelMap = map;
  }

  private npcCache: NpcSpawn[] | null = null;

  /** Deterministic ambient NPCs standing around each settlement's plaza. */
  npcSpawns(): NpcSpawn[] {
    if (this.npcCache) return this.npcCache;
    const out: NpcSpawn[] = [];
    for (const s of SETTLEMENTS) {
      const py = this.platformY(s) + 1;
      const rng = makeRng(this.seed, 'npc', s.id);
      const count = 2 + s.rings * 2;
      for (let i = 0; i < count; i++) {
        let kind: NpcKind = 'villager';
        // Every town has a merchant (all settlements carry a vendor tier). The inn
        // is no longer required — it left millstead/mossgate/glimmercamp shopless.
        // (RNG-safe: vendor and villager both draw one name int, so downstream NPC
        // positions/seeds are unchanged; only NPC 0's kind/name flips.)
        if (i === 0) kind = 'vendor';
        else if (i === 1) kind = 'guard';
        const a = rng.float(0, Math.PI * 2);
        const r = rng.float(8, s.radius * 0.6);
        const x = Math.round(s.cx + Math.cos(a) * r);
        const z = Math.round(s.cz + Math.sin(a) * r);
        const name =
          kind === 'guard'
            ? 'Guard'
            : kind === 'vendor'
              ? `${NPC_NAMES[rng.int(0, NPC_NAMES.length - 1)]} the Merchant`
              : NPC_NAMES[rng.int(0, NPC_NAMES.length - 1)]!;
        out.push({
          id: `${s.id}-npc${i}`,
          kind,
          name,
          seed: rng.int(0, 9999),
          x,
          y: py,
          z,
          dialogue: linesFor(kind),
        });
      }
    }
    this.npcCache = out;
    return out;
  }

  /** Material of a stamped structure at (x,y,z), or Air. O(1). */
  structureVoxelAt(x: number, y: number, z: number): Voxel {
    this.ensurePlaced();
    return this.voxelMap!.get(packKey(x, y, z)) ?? Voxel.Air;
  }

  /** Stamp all structures overlapping a chunk into its voxel array. */
  stampChunk(
    cx: number,
    cz: number,
    chunkSize: number,
    write: (lx: number, ly: number, lz: number, m: Voxel) => void,
  ): void {
    this.ensurePlaced();
    const x0 = cx * chunkSize;
    const z0 = cz * chunkSize;
    const x1 = x0 + chunkSize - 1;
    const z1 = z0 + chunkSize - 1;
    for (const st of this.placed!) {
      if (st.maxX < x0 || st.minX > x1 || st.maxZ < z0 || st.minZ > z1) continue;
      const a = st.worldVoxels;
      for (let i = 0; i < st.count; i++) {
        const wx = a[i * 4]!;
        const wz = a[i * 4 + 2]!;
        if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
        write(wx - x0, a[i * 4 + 1]!, wz - z0, a[i * 4 + 3]! as Voxel);
      }
    }
  }
}
