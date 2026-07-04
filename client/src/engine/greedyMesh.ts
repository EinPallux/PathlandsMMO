// Greedy voxel mesher with baked ambient occlusion and vertex colours (ARCH §5).
// Pure and THREE-free so it runs in a Web Worker and is unit-testable. Emits one
// interleaved buffer set per volume — one draw call per chunk on the main thread.
//
// Merging rule: adjacent faces merge only when material colour AND all four corner
// AO values match, so AO gradients stay crisp while flat runs collapse to few quads.

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export type SolidFn = (x: number, y: number, z: number) => boolean;
export type ColorFn = (x: number, y: number, z: number) => number; // 0xRRGGBB

// AO 0..3 → brightness multiplier (0 = deepest crevice).
const AO_BRIGHTNESS = [0.5, 0.7, 0.86, 1.0];

function aoValue(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

/**
 * Mesh a rectangular voxel volume [0..nx)×[0..ny)×[0..nz). `solid` and `color`
 * may be queried one voxel outside the volume (for correct border culling & AO).
 */
export function meshVolume(
  nx: number,
  ny: number,
  nz: number,
  solid: SolidFn,
  color: ColorFn,
): MeshBuffers {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

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

    const present = new Int8Array(U * V); // 0 none, +1 face toward +d, -1 toward -d
    const rgbMask = new Int32Array(U * V);
    const aoMask = new Int32Array(U * V); // packed 4×2-bit corner AO

    for (let slice = -1; slice < D; slice++) {
      // Build the mask for the boundary plane at d = slice+1.
      let i = 0;
      for (let vv = 0; vv < V; vv++) {
        for (let uu = 0; uu < U; uu++, i++) {
          pos[u] = uu;
          pos[v] = vv;
          pos[d] = slice;
          const a = slice >= 0 && solid(pos[0]!, pos[1]!, pos[2]!);
          pos[d] = slice + 1;
          const b = slice + 1 < D && solid(pos[0]!, pos[1]!, pos[2]!);
          if (a === b) {
            present[i] = 0;
            continue;
          }
          if (a) {
            pos[d] = slice; // owning voxel on −d side, face toward +d
            present[i] = 1;
            rgbMask[i] = color(pos[0]!, pos[1]!, pos[2]!);
            aoMask[i] = faceAO(pos, u, v, d, 1, solid);
          } else {
            pos[d] = slice + 1; // owning voxel on +d side, face toward −d
            present[i] = -1;
            rgbMask[i] = color(pos[0]!, pos[1]!, pos[2]!);
            aoMask[i] = faceAO(pos, u, v, d, -1, solid);
          }
        }
      }

      const plane = slice + 1;

      // 2D greedy merge of the mask.
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

          let w = 1;
          while (
            k + w < U &&
            present[j * U + k + w] === p &&
            rgbMask[j * U + k + w] === rgb &&
            aoMask[j * U + k + w] === ao
          ) {
            w++;
          }

          let h = 1;
          heightLoop: while (j + h < V) {
            for (let kk = 0; kk < w; kk++) {
              const id = (j + h) * U + k + kk;
              if (present[id] !== p || rgbMask[id] !== rgb || aoMask[id] !== ao) break heightLoop;
            }
            h++;
          }

          emitQuad(positions, normals, colors, indices, plane, k, j, w, h, eu, ev, ed, p, rgb, ao);

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

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
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
  n[d] = n[d]! + sign; // step to the outside plane
  const at = (su: number, sv: number): boolean => {
    const x = [n[0]!, n[1]!, n[2]!];
    x[u]! += su;
    x[v]! += sv;
    return solid(x[0]!, x[1]!, x[2]!);
  };
  // Corner order: c00(−u,−v), c10(+u,−v), c11(+u,+v), c01(−u,+v)
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
  positions: number[],
  normals: number[],
  colors: number[],
  indices: number[],
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
  // Base corner in 3D.
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

  const startVert = positions.length / 3;
  const corners = [c00, c10, c11, c01];
  const cornerAO = [a00, a10, a11, a01];
  for (let ci = 0; ci < 4; ci++) {
    const c = corners[ci]!;
    const ao = cornerAO[ci]!;
    positions.push(c[0]!, c[1]!, c[2]!);
    normals.push(nrm[0]!, nrm[1]!, nrm[2]!);
    colors.push(r * ao, g * ao, b * ao);
  }

  // Determine winding so the geometric normal matches the desired outward normal.
  const e1 = [c10[0]! - c00[0]!, c10[1]! - c00[1]!, c10[2]! - c00[2]!];
  const e2 = [c11[0]! - c00[0]!, c11[1]! - c00[1]!, c11[2]! - c00[2]!];
  const cross = [
    e1[1]! * e2[2]! - e1[2]! * e2[1]!,
    e1[2]! * e2[0]! - e1[0]! * e2[2]!,
    e1[0]! * e2[1]! - e1[1]! * e2[0]!,
  ];
  const dot = cross[0]! * nrm[0]! + cross[1]! * nrm[1]! + cross[2]! * nrm[2]!;

  // Flip the diagonal to reduce AO interpolation artifacts.
  const flipDiag = a00 + a11 > a10 + a01;

  let tris: number[];
  if (flipDiag) {
    tris = dot >= 0 ? [1, 2, 3, 1, 3, 0] : [1, 3, 2, 1, 0, 3];
  } else {
    tris = dot >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  }
  for (const t of tris) indices.push(startVert + t);
}
