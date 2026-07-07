// Interest management: who each player is allowed to see. Replication is a 3×3 chunk
// subscription around the viewer (ARCH §7) — a player receives updates only for others
// within one chunk cell in any direction (Chebyshev distance ≤ 1, CHUNK_SIZE metres per
// cell). This keeps per-client bandwidth bounded by local density rather than the whole
// server population, the shape that scales toward ~200 CCU.
//
// This is a REPLICATION policy (a knob), deliberately not a shared/ simulation rule —
// it changes what is sent, never what is true. The authoritative sim is unaffected.

import { CHUNK_SIZE, type NetEntity } from '@pathlands/shared';
import type { ServerPlayer } from './sim.js';

/** Chebyshev radius in cells: 1 ⇒ the 3×3 block of chunks around the viewer. */
export const INTEREST_RADIUS_CELLS = 1;

/** World coordinate → chunk-cell index (matches the client's chunk grid convention). */
export function cellOf(coord: number): number {
  return Math.floor(coord / CHUNK_SIZE);
}

/**
 * Pack a (cx, cz) cell into one integer map key. 8192 comfortably exceeds the world's
 * 96 chunks per axis, and in-bounds play keeps cells non-negative, so keys never
 * collide. (A string key would also work; the packed int avoids per-lookup allocation.)
 */
export function cellKey(cx: number, cz: number): number {
  return cx * 8192 + cz;
}

/** Bucket every player by chunk cell — O(P), rebuilt once per broadcast. */
export function buildCellIndex(players: Iterable<ServerPlayer>): Map<number, ServerPlayer[]> {
  const index = new Map<number, ServerPlayer[]>();
  for (const p of players) {
    const key = cellKey(cellOf(p.phys.x), cellOf(p.phys.z));
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [p]);
    else bucket.push(p);
  }
  return index;
}

/**
 * The ids `viewer` may see this tick: everyone in the 3×3 cells around it, plus the
 * viewer itself (own-player self-state is always replicated, regardless of interest,
 * so reconciliation never starves).
 */
export function visibleIds(viewer: ServerPlayer, index: Map<number, ServerPlayer[]>): Set<string> {
  const visible = new Set<string>([viewer.id]);
  const cx = cellOf(viewer.phys.x);
  const cz = cellOf(viewer.phys.z);
  const r = INTEREST_RADIUS_CELLS;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const bucket = index.get(cellKey(cx + dx, cz + dz));
      if (bucket !== undefined) for (const p of bucket) visible.add(p.id);
    }
  }
  return visible;
}

/** Bucket enemy entities by chunk cell — the entity analogue of buildCellIndex. */
export function buildEntityCellIndex(entities: readonly NetEntity[]): Map<number, NetEntity[]> {
  const index = new Map<number, NetEntity[]>();
  for (const e of entities) {
    const key = cellKey(cellOf(e.x), cellOf(e.z));
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [e]);
    else bucket.push(e);
  }
  return index;
}

/** The enemy entities within `viewer`'s 3×3 interest region (same policy as players). */
export function visibleEntities(
  viewer: ServerPlayer,
  index: Map<number, NetEntity[]>,
): NetEntity[] {
  const out: NetEntity[] = [];
  const cx = cellOf(viewer.phys.x);
  const cz = cellOf(viewer.phys.z);
  const r = INTEREST_RADIUS_CELLS;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const bucket = index.get(cellKey(cx + dx, cz + dz));
      if (bucket !== undefined) out.push(...bucket);
    }
  }
  return out;
}
