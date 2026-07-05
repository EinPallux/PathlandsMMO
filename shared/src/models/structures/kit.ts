// The building kit: reusable helpers that draw common medieval elements into a
// material-typed VoxelSet (voxel `c` holds a Voxel material id, not an RGB colour).
// Buildings compose these; the worldgen authored layer stamps the result into the
// chunk voxel field so structures are literally part of the continent mesh
// (collision + meshing + enterable interiors, all free). ART_GUIDE §2 / §7.
//
// Local space: x = width, z = depth, y = up (y=0 is the settlement platform top).
// Front of a building faces +z (the door side).

import { Voxel } from '../../core/constants.js';
import { type VoxelSet } from '../builder.js';

export interface Building {
  id: string;
  /** Material-typed voxels (c = Voxel id). */
  set: VoxelSet;
  width: number;
  depth: number;
  height: number;
  /** Local minimum corner (voxels can go slightly negative, e.g. foundations). */
  min: { x: number; y: number; z: number };
  /** Door cell (local x,z) on the +z front, for orienting NPCs / signposts. */
  entry: { x: number; z: number };
}

/** A hollow rectangular room: 4 perimeter walls (no floor/ceiling). */
export function walls(
  s: VoxelSet,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  mat: Voxel,
): void {
  s.box(x, y, z, w, h, 1, mat); // front (−z)
  s.box(x, y, z + d - 1, w, h, 1, mat); // back (+z)
  s.box(x, y, z, 1, h, d, mat); // left (−x)
  s.box(x + w - 1, y, z, 1, h, d, mat); // right (+x)
}

/** A solid horizontal slab (floor / ceiling / platform). */
export function slab(
  s: VoxelSet,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  mat: Voxel,
): void {
  s.box(x, y, z, w, 1, d, mat);
}

/**
 * A timber-framed plaster wall storey: plaster infill with dark-wood corner posts,
 * a mid-height rail, and top/bottom plates — the Tudor look of the house PNGs.
 */
export function timberStorey(
  s: VoxelSet,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
): void {
  walls(s, x, y, z, w, h, d, Voxel.Plaster);
  // corner posts
  const corners: Array<[number, number]> = [
    [x, z],
    [x + w - 1, z],
    [x, z + d - 1],
    [x + w - 1, z + d - 1],
  ];
  for (const [px, pz] of corners) {
    s.box(px, y, pz, 1, h, 1, Voxel.WoodDark);
  }
  // top & bottom plates
  walls(s, x, y, z, w, 1, d, Voxel.WoodDark);
  walls(s, x, y + h - 1, z, w, 1, d, Voxel.WoodDark);
  // mid rail
  const mid = y + Math.floor(h / 2);
  walls(s, x, mid, z, w, 1, d, Voxel.WoodDark);
  // a couple of vertical studs per long wall
  for (let sx = x + 3; sx < x + w - 1; sx += 4) {
    s.box(sx, y, z, 1, h, 1, Voxel.WoodDark);
    s.box(sx, y, z + d - 1, 1, h, 1, Voxel.WoodDark);
  }
}

/** A stepped gable roof (ridge runs along x). Overhangs by 1 on every side. */
export function gableRoof(
  s: VoxelSet,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  mat: Voxel,
): number {
  const ox = x - 1;
  const ow = w + 2;
  const half = Math.ceil(d / 2);
  for (let i = 0; i < half; i++) {
    const yy = y + i;
    const z0 = z - 1 + i;
    const z1 = z + d + 0 - i;
    s.box(ox, yy, z0, ow, 1, 1, mat); // south slope row
    s.box(ox, yy, z1, ow, 1, 1, mat); // north slope row
    // close the gable ends (triangular plaster infill under the slopes)
    if (i > 0) {
      s.box(x, yy, z0 + 1, 1, 1, z1 - z0 - 1, Voxel.Plaster);
      s.box(x + w - 1, yy, z0 + 1, 1, 1, z1 - z0 - 1, Voxel.Plaster);
    }
  }
  const ridgeY = y + half - 1;
  s.box(ox, ridgeY, z - 1 + half - 1, ow, 1, d - 2 * (half - 1) + 2, mat); // ridge cap
  return ridgeY + 1;
}

/** A four-sided pyramid/hip roof (for towers). Returns the apex y. */
export function pyramidRoof(
  s: VoxelSet,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  mat: Voxel,
): number {
  let cx = x - 1;
  let cz = z - 1;
  let cw = w + 2;
  let cd = d + 2;
  let yy = y;
  while (cw >= 1 && cd >= 1) {
    s.box(cx, yy, cz, cw, 1, 1, mat);
    s.box(cx, yy, cz + cd - 1, cw, 1, 1, mat);
    s.box(cx, yy, cz, 1, 1, cd, mat);
    s.box(cx + cw - 1, yy, cz, 1, 1, cd, mat);
    cx += 1;
    cz += 1;
    cw -= 2;
    cd -= 2;
    yy += 1;
  }
  return yy;
}

/** A stone chimney from y0 to y1 with a brick cap. */
export function chimney(s: VoxelSet, x: number, z: number, y0: number, y1: number): void {
  s.box(x, y0, z, 2, y1 - y0, 2, Voxel.Cobble);
  s.box(x, y1, z, 2, 1, 2, Voxel.RoofTile);
}

/** Carve a door opening on the +z front wall and frame it. */
export function doorway(s: VoxelSet, x: number, z: number, frontZ: number, w = 2, h = 3): void {
  s.carve((v) => v.z === frontZ && v.x >= x && v.x < x + w && v.y >= 0 && v.y < h);
  // frame
  s.box(x - 1, 0, frontZ, 1, h + 1, 1, Voxel.WoodOak);
  s.box(x + w, 0, frontZ, 1, h + 1, 1, Voxel.WoodOak);
  s.box(x - 1, h, frontZ, w + 2, 1, 1, Voxel.WoodOak);
}

/** Place a framed glass window (emissive) on a wall cell facing ±z or ±x. */
export function window(s: VoxelSet, x: number, y: number, z: number, w = 2, h = 2): void {
  s.box(x, y, z, w, h, 1, Voxel.GlassWindow);
  // wood surround
  s.box(x - 1, y - 1, z, w + 2, 1, 1, Voxel.WoodDark);
  s.box(x - 1, y + h, z, w + 2, 1, 1, Voxel.WoodDark);
  s.box(x - 1, y, z, 1, h, 1, Voxel.WoodDark);
  s.box(x + w, y, z, 1, h, 1, Voxel.WoodDark);
}

/** Stone steps leading up to a door on the +z side. */
export function steps(s: VoxelSet, x: number, z: number, w: number, count: number): void {
  for (let i = 0; i < count; i++) {
    s.box(x, -1 - i, z - 1 - i, w, 1, 1, Voxel.Cobble);
  }
}

/** A hanging lantern (emissive) on a wall. */
export function lantern(s: VoxelSet, x: number, y: number, z: number): void {
  s.set(x, y, z, Voxel.IronDark);
  s.set(x, y - 1, z, Voxel.LanternGlow);
  s.set(x, y - 2, z, Voxel.IronDark);
}

/** Finalize a Building from a set, computing its bounding box. */
export function makeBuilding(id: string, s: VoxelSet, entry: { x: number; z: number }): Building {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const v of s.voxels()) {
    if (v.x < minX) minX = v.x;
    if (v.z < minZ) minZ = v.z;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.z > maxZ) maxZ = v.z;
  }
  let minY = Infinity;
  for (const v of s.voxels()) if (v.y < minY) minY = v.y;
  return {
    id,
    set: s,
    width: maxX - minX + 1,
    depth: maxZ - minZ + 1,
    height: maxY - minY + 1,
    min: { x: minX, y: minY, z: minZ },
    entry,
  };
}
