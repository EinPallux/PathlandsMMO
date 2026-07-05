// Greedy voxel mesher with baked ambient occlusion and vertex colours (ARCH §5).
// Pure and THREE-free so it runs in a Web Worker and is unit-testable. Emits one
// interleaved buffer set per material group (e.g. opaque vs emissive) so glowing
// voxels can render full-bright at night.
//
// Merging rule: adjacent faces merge only when group AND material colour AND all
// four corner AO values match, so AO gradients stay crisp while flat runs collapse.

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export type SolidFn = (x: number, y: number, z: number) => boolean;
export type ColorFn = (x: number, y: number, z: number) => number; // 0xRRGGBB
export type GroupFn = (x: number, y: number, z: number) => number; // material group id

// AO 0..3 → brightness multiplier (0 = deepest crevice).
const AO_BRIGHTNESS = [0.5, 0.7, 0.86, 1.0];

function aoValue(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

interface GroupArrays {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
}

function newGroup(): GroupArrays {
  return { positions: [], normals: [], colors: [], indices: [] };
}

function freezeGroup(g: GroupArrays): MeshBuffers {
  return {
    positions: new Float32Array(g.positions),
    normals: new Float32Array(g.normals),
    colors: new Float32Array(g.colors),
    indices: new Uint32Array(g.indices),
  };
}

/**
 * Mesh a rectangular voxel volume, splitting faces by material group. `solid`,
 * `color`, and `group` may be queried one voxel outside the volume (border culling
 * & AO). Returns a map of groupId → buffers (only groups with geometry appear).
 */
export function meshVolumeGrouped(
  nx: number,
  ny: number,
  nz: number,
  solid: SolidFn,
  color: ColorFn,
  group: GroupFn,
): Map<number, MeshBuffers> {
  const groups = new Map<number, GroupArrays>();
  const arraysFor = (g: number): GroupArrays => {
    let a = groups.get(g);
    if (!a) {
      a = newGroup();
      groups.set(g, a);
    }
    return a;
  };

  const dims = [nx, ny, nz];
  const pos = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const U = dims[u]!;
    const V = dims[v]!;
    const D = dims[d]!;

    const eu = [0, 0, 0];
    eu[u] = 1;
    const ev = [0, 0, 0];
    ev[v] = 1;
    const ed = [0, 0, 0];
    ed[d] = 1;

    const present = new Int8Array(U * V);
    const rgbMask = new Int32Array(U * V);
    const aoMask = new Int32Array(U * V);
    const grpMask = new Int32Array(U * V);

    for (let slice = -1; slice < D; slice++) {
      let i = 0;
      for (let vv = 0; vv < V; vv++) {
        for (let uu = 0; uu < U; uu++, i++) {
          pos[u] = uu;
          pos[v] = vv;
          // Query occupancy at the boundary planes too (solid() handles out-of-
          // volume: chunk mesher returns the neighbour chunk's voxel; model mesher
          // and tests return false). Without this, chunk borders are never culled
          // against neighbours and every chunk meshes as a closed shell with
          // doubled hidden faces + a hidden world floor.
          pos[d] = slice;
          const a = solid(pos[0]!, pos[1]!, pos[2]!);
          pos[d] = slice + 1;
          const b = solid(pos[0]!, pos[1]!, pos[2]!);
          if (a === b) {
            present[i] = 0;
            continue;
          }
          // Emit only faces OWNED by an in-volume voxel. A face at a boundary whose
          // owner is the neighbour chunk belongs to that chunk — emitting it here
          // would double it and read color()/AO out of range (the magenta default).
          if (a) {
            if (slice < 0) {
              present[i] = 0;
              continue;
            }
            pos[d] = slice;
            present[i] = 1;
            rgbMask[i] = color(pos[0]!, pos[1]!, pos[2]!);
            grpMask[i] = group(pos[0]!, pos[1]!, pos[2]!);
            aoMask[i] = faceAO(pos, u, v, d, 1, solid);
          } else {
            if (slice + 1 >= D) {
              present[i] = 0;
              continue;
            }
            pos[d] = slice + 1;
            present[i] = -1;
            rgbMask[i] = color(pos[0]!, pos[1]!, pos[2]!);
            grpMask[i] = group(pos[0]!, pos[1]!, pos[2]!);
            aoMask[i] = faceAO(pos, u, v, d, -1, solid);
          }
        }
      }

      const plane = slice + 1;

      for (let j = 0; j < V; j++) {
        for (let k = 0; k < U;) {
          const idx = j * U + k;
          const p = present[idx]!;
          if (p === 0) {
            k++;
            continue;
          }
          const rgb = rgbMask[idx]!;
          const ao = aoMask[idx]!;
          const grp = grpMask[idx]!;

          let w = 1;
          while (
            k + w < U &&
            present[j * U + k + w] === p &&
            rgbMask[j * U + k + w] === rgb &&
            aoMask[j * U + k + w] === ao &&
            grpMask[j * U + k + w] === grp
          ) {
            w++;
          }

          let h = 1;
          heightLoop: while (j + h < V) {
            for (let kk = 0; kk < w; kk++) {
              const id = (j + h) * U + k + kk;
              if (
                present[id] !== p ||
                rgbMask[id] !== rgb ||
                aoMask[id] !== ao ||
                grpMask[id] !== grp
              ) {
                break heightLoop;
              }
            }
            h++;
          }

          emitQuad(arraysFor(grp), plane, k, j, w, h, eu, ev, ed, p, rgb, ao);

          for (let hh = 0; hh < h; hh++) {
            for (let ww = 0; ww < w; ww++) {
              present[(j + hh) * U + k + ww] = 0;
            }
          }
          k += w;
        }
      }
    }
  }

  const out = new Map<number, MeshBuffers>();
  for (const [g, arrays] of groups) {
    if (arrays.indices.length > 0) out.set(g, freezeGroup(arrays));
  }
  return out;
}

/** Single-group mesh (opaque). Convenience wrapper over meshVolumeGrouped. */
export function meshVolume(
  nx: number,
  ny: number,
  nz: number,
  solid: SolidFn,
  color: ColorFn,
): MeshBuffers {
  const groups = meshVolumeGrouped(nx, ny, nz, solid, color, () => 0);
  return (
    groups.get(0) ?? {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      colors: new Float32Array(0),
      indices: new Uint32Array(0),
    }
  );
}

/** Compute packed AO (4 corners) for the face of `voxel` toward sign·d. */
function faceAO(
  voxel: number[],
  u: number,
  v: number,
  d: number,
  sign: number,
  solid: SolidFn,
): number {
  const n = [voxel[0]!, voxel[1]!, voxel[2]!];
  n[d] = n[d]! + sign;
  const at = (su: number, sv: number): boolean => {
    const x = [n[0]!, n[1]!, n[2]!];
    x[u]! += su;
    x[v]! += sv;
    return solid(x[0]!, x[1]!, x[2]!);
  };
  const s_nu = at(-1, 0);
  const s_pu = at(1, 0);
  const s_nv = at(0, -1);
  const s_pv = at(0, 1);
  const a00 = aoValue(s_nu, s_nv, at(-1, -1));
  const a10 = aoValue(s_pu, s_nv, at(1, -1));
  const a11 = aoValue(s_pu, s_pv, at(1, 1));
  const a01 = aoValue(s_nu, s_pv, at(-1, 1));
  return a00 | (a10 << 2) | (a11 << 4) | (a01 << 6);
}

function emitQuad(
  out: GroupArrays,
  plane: number,
  k: number,
  j: number,
  w: number,
  h: number,
  eu: number[],
  ev: number[],
  ed: number[],
  sign: number,
  rgb: number,
  aoPacked: number,
): void {
  const base = [ed[0]! * plane, ed[1]! * plane, ed[2]! * plane];
  base[0]! += eu[0]! * k + ev[0]! * j;
  base[1]! += eu[1]! * k + ev[1]! * j;
  base[2]! += eu[2]! * k + ev[2]! * j;

  const c00 = base;
  const c10 = [base[0]! + eu[0]! * w, base[1]! + eu[1]! * w, base[2]! + eu[2]! * w];
  const c11 = [c10[0]! + ev[0]! * h, c10[1]! + ev[1]! * h, c10[2]! + ev[2]! * h];
  const c01 = [base[0]! + ev[0]! * h, base[1]! + ev[1]! * h, base[2]! + ev[2]! * h];

  const a00 = AO_BRIGHTNESS[aoPacked & 3]!;
  const a10 = AO_BRIGHTNESS[(aoPacked >> 2) & 3]!;
  const a11 = AO_BRIGHTNESS[(aoPacked >> 4) & 3]!;
  const a01 = AO_BRIGHTNESS[(aoPacked >> 6) & 3]!;

  const nrm = [ed[0]! * sign, ed[1]! * sign, ed[2]! * sign];
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;

  const startVert = out.positions.length / 3;
  const corners = [c00, c10, c11, c01];
  const cornerAO = [a00, a10, a11, a01];
  for (let ci = 0; ci < 4; ci++) {
    const c = corners[ci]!;
    const ao = cornerAO[ci]!;
    out.positions.push(c[0]!, c[1]!, c[2]!);
    out.normals.push(nrm[0]!, nrm[1]!, nrm[2]!);
    out.colors.push(r * ao, g * ao, b * ao);
  }

  const e1 = [c10[0]! - c00[0]!, c10[1]! - c00[1]!, c10[2]! - c00[2]!];
  const e2 = [c11[0]! - c00[0]!, c11[1]! - c00[1]!, c11[2]! - c00[2]!];
  const cross = [
    e1[1]! * e2[2]! - e1[2]! * e2[1]!,
    e1[2]! * e2[0]! - e1[0]! * e2[2]!,
    e1[0]! * e2[1]! - e1[1]! * e2[0]!,
  ];
  const dot = cross[0]! * nrm[0]! + cross[1]! * nrm[1]! + cross[2]! * nrm[2]!;
  const flipDiag = a00 + a11 > a10 + a01;

  let tris: number[];
  if (flipDiag) {
    tris = dot >= 0 ? [1, 2, 3, 1, 3, 0] : [1, 3, 2, 1, 0, 3];
  } else {
    tris = dot >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  }
  for (const t of tris) out.indices.push(startVert + t);
}
