// The Waystone network (GDD §7): ancient obelisks at every settlement + key wilds.
// Activating two lets a player pay to teleport between them; death respawns at the
// last activated one. Positions are derived from the authored settlement/wild data,
// so this stays a pure function of the world. ~15 total.

import { SETTLEMENTS, WILD_WAYSTONES } from './settlements.js';

export interface WaystonePoint {
  id: string;
  name: string;
  x: number;
  z: number;
}

/** Settlement Waystones are stamped just off the plaza centre (placement.ts: cx-7,cz-7). */
const SETTLEMENT_WAYSTONE_OFFSET = -7;

export const WAYSTONES: readonly WaystonePoint[] = [
  ...SETTLEMENTS.map((s) => ({
    id: `ws-${s.id}`,
    name: `${s.name} Waystone`,
    x: s.cx + SETTLEMENT_WAYSTONE_OFFSET,
    z: s.cz + SETTLEMENT_WAYSTONE_OFFSET,
  })),
  ...WILD_WAYSTONES.map((w) => ({ id: `ws-${w.id}`, name: w.name, x: w.x, z: w.z })),
];

const WAYSTONE_BY_ID = new Map<string, WaystonePoint>(WAYSTONES.map((w) => [w.id, w]));

export function waystoneById(id: string): WaystonePoint | undefined {
  return WAYSTONE_BY_ID.get(id);
}

/** Nearest Waystone to (x,z) within `maxDist` metres, or null. */
export function nearestWaystone(x: number, z: number, maxDist = Infinity): WaystonePoint | null {
  let best: WaystonePoint | null = null;
  let bestD = maxDist;
  for (const w of WAYSTONES) {
    const d = Math.sqrt((w.x - x) * (w.x - x) + (w.z - z) * (w.z - z));
    if (d <= bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Nearest Waystone from a set of ids (e.g. the ones a character has activated). */
export function nearestActivated(
  x: number,
  z: number,
  activated: ReadonlySet<string>,
): WaystonePoint | null {
  let best: WaystonePoint | null = null;
  let bestD = Infinity;
  for (const w of WAYSTONES) {
    if (!activated.has(w.id)) continue;
    const d = Math.sqrt((w.x - x) * (w.x - x) + (w.z - z) * (w.z - z));
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Teleport fee in copper between two Waystones (GDD §7: scales with distance + level). */
export function travelFee(from: WaystonePoint, to: WaystonePoint, level: number): number {
  const dist = Math.sqrt((from.x - to.x) * (from.x - to.x) + (from.z - to.z) * (from.z - to.z));
  return Math.min(1000, Math.max(10, Math.round(dist * 0.06) + level * 3));
}
