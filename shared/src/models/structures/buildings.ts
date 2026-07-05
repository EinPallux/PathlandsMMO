// The twelve settlement buildings, reconstructed from public/assets/buildings/*.png
// as hollow, enterable voxel structures composed from the kit. Recognisable
// silhouettes over pixel-fidelity (ART_GUIDE §2 fidelity bar). Each is built once
// and memoised.

import { Voxel } from '../../core/constants.js';
import { VoxelSet } from '../builder.js';
import {
  type Building,
  makeBuilding,
  walls,
  timberStorey,
  gableRoof,
  pyramidRoof,
  chimney,
  doorway,
  window as kitWindow,
  steps,
  lantern,
} from './kit.js';

export type BuildingId =
  | 'house1'
  | 'house2'
  | 'house3'
  | 'house4'
  | 'bigHouse1'
  | 'bigHouse2'
  | 'inn'
  | 'church'
  | 'stable'
  | 'bathhouse'
  | 'workerHut'
  | 'fountain';

interface TownhouseOpts {
  w: number;
  d: number;
  chimneyRight?: boolean;
  windows?: boolean;
}

/** A stone-ground-floor, timber-upper, red-tile-roof townhouse (houses & big houses). */
function townhouse(id: string, o: TownhouseOpts): Building {
  const s = new VoxelSet();
  const { w, d } = o;
  s.box(0, -1, 0, w, 1, d, Voxel.CobbleDark); // foundation
  walls(s, 0, 0, 0, w, 4, d, Voxel.Cobble); // stone ground floor
  timberStorey(s, 0, 4, 0, w, 5, d); // timber upper storey
  const roofTop = gableRoof(s, 0, 9, 0, w, d, Voxel.RoofTile);
  chimney(s, o.chimneyRight ? w - 3 : 1, d - 3, 6, roofTop + 1);

  const doorX = Math.floor(w / 2) - 1;
  doorway(s, doorX, 0, 0);
  steps(s, doorX, 0, 2, 2);
  lantern(s, doorX + 2, 3, 0);

  if (o.windows !== false) {
    kitWindow(s, 2, 5, 0); // upper front
    kitWindow(s, w - 4, 5, 0);
    kitWindow(s, w - 4, 1, 0); // ground front
    kitWindow(s, 0, 5, 3); // side
    kitWindow(s, w - 1, 5, d - 5);
  }
  return makeBuilding(id, s, { x: doorX, z: 0 });
}

function buildInn(): Building {
  const s = new VoxelSet();
  const w = 14;
  const d = 11;
  s.box(0, -1, 0, w, 1, d, Voxel.CobbleDark);
  walls(s, 0, 0, 0, w, 4, d, Voxel.Cobble);
  timberStorey(s, 0, 4, 0, w, 6, d);
  const roofTop = gableRoof(s, 0, 10, 0, w, d, Voxel.RoofTile);
  chimney(s, w - 3, d - 3, 7, roofTop + 1);
  chimney(s, 1, 1, 7, roofTop + 1);

  const doorX = 6;
  doorway(s, doorX, 0, 0, 2, 3);
  steps(s, doorX, 0, 2, 2);

  // Covered porch: posts + a small tile awning over the entrance.
  for (const px of [doorX - 2, doorX + 3]) {
    s.box(px, 0, -2, 1, 4, 1, Voxel.WoodOak);
  }
  s.box(doorX - 3, 4, -2, 8, 1, 3, Voxel.RoofTile);

  // Hanging inn sign.
  s.box(doorX - 4, 4, -1, 1, 1, 1, Voxel.WoodOak);
  s.box(doorX - 5, 2, -1, 1, 3, 1, Voxel.WoodDark);
  s.set(doorX - 5, 3, -1, Voxel.GoldTrim);
  lantern(s, doorX - 3, 3, -2);
  lantern(s, doorX + 4, 3, -2);

  for (let wx = 2; wx < w - 2; wx += 4) {
    kitWindow(s, wx, 5, 0);
    kitWindow(s, wx, 1, 0);
  }
  return makeBuilding('inn', s, { x: doorX, z: 0 });
}

function buildChurch(): Building {
  const s = new VoxelSet();
  const naveW = 9;
  const naveD = 16;
  s.box(0, -1, 0, naveW, 1, naveD, Voxel.CobbleDark);
  walls(s, 0, 0, 0, naveW, 9, naveD, Voxel.Cobble); // tall stone nave
  const roofTop = gableRoof(s, 0, 9, 0, naveW, naveD, Voxel.RoofTile);

  // Tall arched windows along the nave sides.
  for (let z = 3; z < naveD - 2; z += 3) {
    s.box(0, 3, z, 1, 4, 1, Voxel.GlassWindow);
    s.box(naveW - 1, 3, z, 1, 4, 1, Voxel.GlassWindow);
  }
  // Rose window on the front gable.
  s.box(3, 10, 0, 3, 3, 1, Voxel.GlassWindow);
  s.set(4, 11, 0, Voxel.WoodDark);

  // Porch + door.
  const doorX = 3;
  doorway(s, doorX, 0, 0, 2, 4);
  steps(s, doorX, 0, 4, 3);
  s.box(doorX - 2, 0, -2, 1, 4, 1, Voxel.WoodOak);
  s.box(doorX + 3, 0, -2, 1, 4, 1, Voxel.WoodOak);
  s.box(doorX - 2, 4, -2, 6, 1, 3, Voxel.RoofTile);
  lantern(s, doorX - 1, 3, 0);
  lantern(s, doorX + 3, 3, 0);
  // gable cross
  s.box(4, roofTop, 1, 1, 3, 1, Voxel.WoodDark);
  s.box(3, roofTop + 1, 1, 3, 1, 1, Voxel.WoodDark);

  // Bell tower at the back.
  const tx = naveW - 6;
  const tz = naveD - 5;
  const tw = 6;
  const td = 5;
  walls(s, tx, 0, tz, tw, 20, td, Voxel.Cobble);
  // belfry openings (arched)
  for (const [ox, oz] of [
    [tx + 1, tz],
    [tx + 3, tz],
  ]) {
    s.box(ox!, 14, oz!, 2, 3, 1, Voxel.GlassWindow);
  }
  s.set(tx + 2, 12, tz, Voxel.IronDark); // hanging bell
  s.set(tx + 2, 11, tz, Voxel.GoldTrim);
  const apex = pyramidRoof(s, tx, 20, tz, tw, td, Voxel.RoofTile);
  // tower cross
  s.box(tx + 2, apex, tz + 2, 1, 3, 1, Voxel.WoodDark);
  s.box(tx + 1, apex + 1, tz + 2, 3, 1, 1, Voxel.WoodDark);
  s.set(tx + 2, apex + 2, tz + 2, Voxel.GoldTrim);

  return makeBuilding('church', s, { x: doorX, z: 0 });
}

function buildStable(): Building {
  const s = new VoxelSet();
  const w = 11;
  const d = 8;
  s.box(0, -1, 0, w, 1, d, Voxel.CobbleDark);
  // Three stone walls; open front with timber posts.
  s.box(0, 0, d - 1, w, 4, 1, Voxel.Cobble); // back
  s.box(0, 0, 0, 1, 4, d, Voxel.WoodDark); // left
  s.box(w - 1, 0, 0, 1, 4, d, Voxel.WoodDark); // right
  for (let x = 2; x < w - 1; x += 3) s.box(x, 0, 0, 1, 4, 1, Voxel.WoodOak); // front posts
  s.box(0, 4, 0, w, 1, d, Voxel.WoodDark); // top plate
  const roofTop = gableRoof(s, 0, 5, 0, w, d, Voxel.RoofTile);
  // Hay + stalls.
  s.box(1, 0, d - 2, 2, 1, 1, Voxel.Thatch);
  s.box(w - 3, 0, d - 2, 2, 1, 1, Voxel.Thatch);
  s.box(Math.floor(w / 2), 0, 1, 1, 3, d - 2, Voxel.WoodOak); // stall divider
  void roofTop;
  return makeBuilding('stable', s, { x: Math.floor(w / 2), z: 0 });
}

function buildBathhouse(): Building {
  const s = new VoxelSet();
  const w = 9;
  const d = 9;
  s.box(0, -1, 0, w, 1, d, Voxel.CobbleDark);
  walls(s, 0, 0, 0, w, 5, d, Voxel.Cobble);
  // Low hip roof.
  pyramidRoof(s, 0, 5, 0, w, d, Voxel.RoofTile);
  chimney(s, w - 3, 1, 5, 9);
  // Interior bathing pool (water) inset in the floor.
  s.box(2, 0, 2, w - 4, 1, d - 4, Voxel.Water);
  const doorX = Math.floor(w / 2) - 1;
  doorway(s, doorX, 0, 0, 2, 3);
  steps(s, doorX, 0, 2, 1);
  kitWindow(s, 1, 2, 0);
  kitWindow(s, w - 3, 2, 0);
  lantern(s, doorX + 2, 3, 0);
  return makeBuilding('bathhouse', s, { x: doorX, z: 0 });
}

function buildWorkerHut(): Building {
  const s = new VoxelSet();
  const w = 6;
  const d = 6;
  s.box(0, -1, 0, w, 1, d, Voxel.CobbleDark);
  walls(s, 0, 0, 0, w, 2, d, Voxel.Cobble); // low stone base
  timberStorey(s, 0, 2, 0, w, 3, d);
  const roofTop = gableRoof(s, 0, 5, 0, w, d, Voxel.Thatch); // thatched
  chimney(s, w - 3, d - 3, 3, roofTop + 1);
  const doorX = 2;
  doorway(s, doorX, 0, 0, 1, 3);
  kitWindow(s, w - 2, 2, 0, 1, 1);
  return makeBuilding('workerHut', s, { x: doorX, z: 0 });
}

function buildFountain(): Building {
  const s = new VoxelSet();
  const w = 7;
  const d = 7;
  // Stone basin ring.
  walls(s, 0, 0, 0, w, 2, d, Voxel.Cobble);
  s.box(0, -1, 0, w, 1, d, Voxel.Cobble);
  // Water pool.
  s.box(1, 0, 1, w - 2, 1, d - 2, Voxel.Water);
  // Central tiered column.
  s.box(2, 0, 2, 3, 3, 3, Voxel.Cobble);
  s.box(3, 3, 3, 1, 2, 1, Voxel.Cobble);
  s.set(3, 5, 3, Voxel.Water);
  s.box(2, 3, 2, 3, 1, 3, Voxel.Water); // upper basin spill
  return makeBuilding('fountain', s, { x: 3, z: 0 });
}

let cache: Map<BuildingId, Building> | null = null;

function buildAll(): Map<BuildingId, Building> {
  const m = new Map<BuildingId, Building>();
  m.set('house1', townhouse('house1', { w: 9, d: 8, chimneyRight: true }));
  m.set('house2', townhouse('house2', { w: 8, d: 10 }));
  m.set('house3', townhouse('house3', { w: 10, d: 7, chimneyRight: true }));
  m.set('house4', townhouse('house4', { w: 7, d: 9 }));
  m.set('bigHouse1', townhouse('bigHouse1', { w: 12, d: 10, chimneyRight: true }));
  m.set('bigHouse2', townhouse('bigHouse2', { w: 11, d: 12 }));
  m.set('inn', buildInn());
  m.set('church', buildChurch());
  m.set('stable', buildStable());
  m.set('bathhouse', buildBathhouse());
  m.set('workerHut', buildWorkerHut());
  m.set('fountain', buildFountain());
  return m;
}

/** Get a memoised building by id. */
export function getBuilding(id: BuildingId): Building {
  if (!cache) cache = buildAll();
  return cache.get(id)!;
}

export const BUILDING_IDS: readonly BuildingId[] = [
  'house1',
  'house2',
  'house3',
  'house4',
  'bigHouse1',
  'bigHouse2',
  'inn',
  'church',
  'stable',
  'bathhouse',
  'workerHut',
  'fountain',
];
