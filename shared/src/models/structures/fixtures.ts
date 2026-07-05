// Small stamped fixtures placed by the authored layer: Waystones, wells,
// signposts, bridges, market stalls, graves, ruins, fences. Material-typed
// VoxelSets (like buildings), so they become part of the continent mesh.

import { Voxel } from '../../core/constants.js';
import { VoxelSet } from '../builder.js';
import { type Building, makeBuilding } from './kit.js';

export type FixtureId =
  'waystone' | 'well' | 'signpost' | 'bridge' | 'marketStall' | 'grave' | 'ruin' | 'fence';

/** The Waystone obelisk — glowing Waymaker runes on standing stone. */
function buildWaystone(): Building {
  const s = new VoxelSet();
  s.box(-2, -1, -2, 5, 1, 5, Voxel.Cobble); // plinth
  s.box(-1, 0, -1, 3, 1, 3, Voxel.CobbleDark);
  s.box(-1, 1, -1, 3, 8, 3, Voxel.WaystoneStone); // shaft
  // glowing rune band + crowning light
  s.box(-1, 4, -1, 3, 1, 3, Voxel.WaystoneGlow);
  s.set(0, 4, -2, Voxel.WaystoneGlow);
  s.set(0, 4, 2, Voxel.WaystoneGlow);
  s.box(-1, 9, -1, 3, 1, 3, Voxel.WaystoneGlow);
  s.set(0, 10, 0, Voxel.WaystoneGlow);
  return makeBuilding('waystone', s, { x: 0, z: 0 });
}

function buildWell(): Building {
  const s = new VoxelSet();
  s.box(0, 0, 0, 4, 2, 4, Voxel.Cobble); // ring
  s.box(1, 0, 1, 2, 2, 2, Voxel.Water); // water
  // roof posts + little tile roof
  s.box(0, 2, 0, 1, 3, 1, Voxel.WoodDark);
  s.box(3, 2, 0, 1, 3, 1, Voxel.WoodDark);
  s.box(0, 2, 3, 1, 3, 1, Voxel.WoodDark);
  s.box(3, 2, 3, 1, 3, 1, Voxel.WoodDark);
  s.box(-1, 5, -1, 6, 1, 6, Voxel.RoofTile);
  s.box(0, 6, 0, 4, 1, 4, Voxel.RoofTile);
  return makeBuilding('well', s, { x: 2, z: 2 });
}

function buildSignpost(): Building {
  const s = new VoxelSet();
  s.box(0, 0, 0, 1, 4, 1, Voxel.WoodDark); // post
  s.box(1, 3, 0, 3, 1, 1, Voxel.WoodOak); // arm
  s.box(-3, 2, 0, 3, 1, 1, Voxel.WoodOak);
  return makeBuilding('signpost', s, { x: 0, z: 0 });
}

/** A plank bridge segment (spans ~6 along +z) for road river crossings. */
function buildBridge(): Building {
  const s = new VoxelSet();
  const len = 7;
  s.box(0, 0, 0, 5, 1, len, Voxel.WoodOak); // deck
  for (let z = 0; z < len; z += 2) {
    s.set(0, 1, z, Voxel.WoodDark); // rails
    s.set(4, 1, z, Voxel.WoodDark);
  }
  s.box(0, -3, 0, 1, 3, 1, Voxel.WoodDark); // piles
  s.box(4, -3, 0, 1, 3, 1, Voxel.WoodDark);
  s.box(0, -3, len - 1, 1, 3, 1, Voxel.WoodDark);
  s.box(4, -3, len - 1, 1, 3, 1, Voxel.WoodDark);
  return makeBuilding('bridge', s, { x: 2, z: 0 });
}

function buildMarketStall(): Building {
  const s = new VoxelSet();
  s.box(0, 0, 0, 4, 1, 1, Voxel.WoodOak); // counter
  s.box(0, 0, 0, 1, 3, 1, Voxel.WoodDark); // posts
  s.box(3, 0, 0, 1, 3, 1, Voxel.WoodDark);
  s.box(0, 0, 2, 1, 3, 1, Voxel.WoodDark);
  s.box(3, 0, 2, 1, 3, 1, Voxel.WoodDark);
  // striped awning
  for (let x = 0; x < 4; x++) {
    s.box(x, 3, 0, 1, 1, 3, x % 2 === 0 ? Voxel.RoofTile : Voxel.Plaster);
  }
  return makeBuilding('marketStall', s, { x: 2, z: 0 });
}

function buildGrave(): Building {
  const s = new VoxelSet();
  s.box(0, 0, 0, 2, 1, 3, Voxel.Dirt); // mound
  s.box(0, 1, 0, 2, 1, 1, Voxel.CobbleDark); // headstone base
  s.box(0, 1, 0, 2, 2, 1, Voxel.Cobble);
  return makeBuilding('grave', s, { x: 0, z: 0 });
}

function buildRuin(): Building {
  const s = new VoxelSet();
  // A broken L of mossy stone wall.
  s.box(0, 0, 0, 6, 3, 1, Voxel.Cobble);
  s.carve((v) => v.x >= 3 && v.y >= 2); // broken top
  s.box(0, 0, 0, 1, 4, 5, Voxel.Cobble);
  s.carve((v) => v.z >= 3 && v.y >= 3);
  s.set(1, 0, 2, Voxel.BlightMoss); // moss
  s.set(2, 2, 0, Voxel.BlightMoss);
  return makeBuilding('ruin', s, { x: 0, z: 0 });
}

function buildFence(): Building {
  const s = new VoxelSet();
  const len = 4;
  for (let z = 0; z < len; z++) {
    if (z % 2 === 0) s.box(0, 0, z, 1, 2, 1, Voxel.WoodOak); // posts
  }
  s.box(0, 1, 0, 1, 1, len, Voxel.WoodDark); // top rail
  return makeBuilding('fence', s, { x: 0, z: 0 });
}

/** A themed stone archway over a sealed passage — a Hollow entrance (Phase 2). */
export function buildHollowEntrance(theme: string): Building {
  const s = new VoxelSet();
  const accent =
    theme === 'goblin'
      ? Voxel.BlightMoss
      : theme === 'crystal'
        ? Voxel.WaystoneGlow
        : theme === 'crypt'
          ? Voxel.WaystoneGlow
          : theme === 'iron'
            ? Voxel.IronDark
            : Voxel.Thatch;
  // Arch pillars + lintel.
  s.box(-3, 0, 0, 2, 6, 2, Voxel.Cobble);
  s.box(2, 0, 0, 2, 6, 2, Voxel.Cobble);
  s.box(-3, 6, 0, 7, 2, 2, Voxel.Cobble);
  s.set(-3, 5, 1, accent);
  s.set(3, 5, 1, accent);
  s.box(-1, 7, 0, 3, 1, 1, accent);
  // Sealed door of dark stone (opens in Phase 3 when the Hollow is populated).
  s.box(-2, 0, 1, 5, 6, 1, Voxel.CobbleDark);
  s.set(0, 3, 1, accent);
  // Rubble steps in front.
  s.box(-3, -1, 2, 7, 1, 2, Voxel.Cobble);
  return makeBuilding('hollow', s, { x: 0, z: 0 });
}

let cache: Map<FixtureId, Building> | null = null;

function buildAll(): Map<FixtureId, Building> {
  const m = new Map<FixtureId, Building>();
  m.set('waystone', buildWaystone());
  m.set('well', buildWell());
  m.set('signpost', buildSignpost());
  m.set('bridge', buildBridge());
  m.set('marketStall', buildMarketStall());
  m.set('grave', buildGrave());
  m.set('ruin', buildRuin());
  m.set('fence', buildFence());
  return m;
}

export function getFixture(id: FixtureId): Building {
  if (!cache) cache = buildAll();
  return cache.get(id)!;
}
