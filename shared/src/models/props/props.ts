// Instanced decoration props: trees (per-biome), rocks, flora, and gathering-node
// shells. These are RGB VoxelModels (like characters) rendered as InstancedMesh by
// the client from the deterministic scatter — NOT stamped into the voxel field, so
// there can be thousands cheaply. Non-colliding decoration in Phase 2.

import type { VoxelModel } from '../types.js';
import { VoxelSet } from '../builder.js';
import { pal, shade } from '../palette.js';

function prop(id: string, scale: number, s: VoxelSet, emissive?: number[]): VoxelModel {
  return {
    id,
    scale,
    parts: [{ name: 'root', pivot: [0, 0, 0], voxels: s.voxels() }],
    ...(emissive ? { emissive } : {}),
  };
}

/** Fill a rough ellipsoid of leaves centred at (cx,cy,cz). */
function blob(
  s: VoxelSet,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  color: number,
): void {
  for (let y = -ry; y <= ry; y++) {
    for (let z = -rz; z <= rz; z++) {
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz);
        if (d <= 1.02) {
          // vary the leaf tone a touch by height for depth
          const f = 0.9 + ((y + ry) / (2 * ry)) * 0.2;
          s.set(cx + x, cy + y, cz + z, shade(color, f));
        }
      }
    }
  }
}

function trunk(s: VoxelSet, height: number, color: number, w = 2): void {
  s.box(0, 0, 0, w, height, w, color);
}

// --- Trees ------------------------------------------------------------------

function treeRound(id: string, trunkColor: number, leaf: number, h = 9, r = 4): VoxelModel {
  const s = new VoxelSet();
  trunk(s, h, trunkColor, 2);
  blob(s, 0, h + r - 1, 0, r, r, r, leaf);
  return prop(id, 0.5, s);
}

function treeConifer(id: string, trunkColor: number, leaf: number, layers = 4): VoxelModel {
  const s = new VoxelSet();
  trunk(s, 5, trunkColor, 2);
  let r = layers + 1;
  let y = 4;
  for (let i = 0; i < layers; i++) {
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        if (Math.abs(x) + Math.abs(z) <= r) s.set(x, y, z, shade(leaf, 0.9 + i * 0.04));
      }
    }
    y += 2;
    r -= 1;
  }
  s.set(0, y, 0, leaf);
  return prop(id, 0.5, s);
}

function treeDead(id: string, blight = false): VoxelModel {
  const s = new VoxelSet();
  trunk(s, 11, pal.woodDark, 2);
  // a few bare branches
  s.box(2, 8, 0, 3, 1, 1, pal.woodDark);
  s.box(-3, 6, 0, 3, 1, 1, pal.woodDark);
  s.box(0, 10, 2, 1, 1, 2, pal.woodDark);
  if (blight) {
    s.set(0, 11, 0, pal.blight);
    s.set(2, 8, 0, pal.blight);
    s.set(-1, 6, 0, pal.blight);
    return prop(id, 0.5, s, [pal.blight]);
  }
  return prop(id, 0.5, s);
}

function treePalm(): VoxelModel {
  const s = new VoxelSet();
  // leaning trunk
  for (let y = 0; y < 11; y++) s.box(Math.floor(y / 4), y, 0, 2, 1, 2, pal.woodOak);
  const tx = 2;
  const ty = 11;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let i = 1; i <= 4; i++) {
      s.set(tx + dx! * i, ty - (i > 2 ? i - 2 : 0), dz! * i, pal.grassCoast);
    }
  }
  return prop('treePalm', 0.5, s);
}

// --- Rocks ------------------------------------------------------------------

function rock(id: string, size: number, color: number, scale = 0.5): VoxelModel {
  const s = new VoxelSet();
  for (let y = 0; y <= size; y++) {
    const r = size - Math.floor(y / 1.6);
    for (let z = -r; z <= r; z++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + z * z <= r * r + 1) s.set(x, y, z, shade(color, 0.9 + (x + z + y) * 0.02));
      }
    }
  }
  return prop(id, scale, s);
}

function rockCrystal(): VoxelModel {
  const s = new VoxelSet();
  rockShardBase(s);
  // crystal shards
  s.box(0, 3, 0, 1, 5, 1, pal.crystalRock);
  s.box(2, 2, 1, 1, 4, 1, pal.crystalRock2);
  s.box(-2, 2, -1, 1, 3, 1, pal.crystalRock);
  return prop('rockCrystal', 0.5, s, [pal.crystalRock, pal.crystalRock2]);
}

function rockShardBase(s: VoxelSet): void {
  for (let z = -2; z <= 2; z++) {
    for (let x = -2; x <= 2; x++) {
      if (x * x + z * z <= 5) s.set(x, 0, z, pal.stoneDark);
    }
  }
  s.box(-1, 1, -1, 3, 1, 3, pal.stone);
}

// --- Flora ------------------------------------------------------------------

function bush(): VoxelModel {
  const s = new VoxelSet();
  blob(s, 0, 2, 0, 2, 2, 2, pal.grassWeald);
  s.set(0, 0, 0, pal.woodDark);
  return prop('bush', 0.4, s);
}

function fern(): VoxelModel {
  const s = new VoxelSet();
  for (const [dx, dz] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    s.box(dx!, 0, dz!, 1, 2 + (dx === 0 && dz === 0 ? 1 : 0), 1, pal.grassWeald);
  }
  return prop('fern', 0.4, s);
}

function flower(id: string, petal: number): VoxelModel {
  const s = new VoxelSet();
  s.box(0, 0, 0, 1, 2, 1, pal.grassVale); // stem
  s.set(0, 2, 0, petal);
  s.set(1, 2, 0, petal);
  s.set(-1, 2, 0, petal);
  s.set(0, 2, 1, petal);
  s.set(0, 2, -1, petal);
  s.set(0, 3, 0, pal.gold);
  return prop(id, 0.28, s);
}

function wheat(): VoxelModel {
  const s = new VoxelSet();
  for (let x = 0; x < 3; x++) {
    for (let z = 0; z < 3; z++) {
      s.box(x, 0, z, 1, 3 + ((x + z) % 2), 1, pal.wheat);
    }
  }
  return prop('wheat', 0.35, s);
}

function reeds(): VoxelModel {
  const s = new VoxelSet();
  for (const [x, z, h] of [
    [0, 0, 4],
    [1, 0, 3],
    [0, 1, 5],
    [-1, 0, 3],
  ]) {
    s.box(x!, 0, z!, 1, h!, 1, pal.grassTrollmoor);
  }
  return prop('reeds', 0.4, s);
}

// --- Gathering-node shells (Phase 4 activates them) -------------------------

function oreVein(id: string, ore: number): VoxelModel {
  const s = new VoxelSet();
  rockShardBase(s);
  s.box(-1, 1, -1, 3, 2, 3, pal.stoneDark);
  // ore specks
  for (const [x, y, z] of [
    [0, 2, 1],
    [1, 1, 0],
    [-1, 2, 0],
    [0, 1, -1],
  ]) {
    s.set(x!, y!, z!, ore);
  }
  return prop(id, 0.5, s, ore === pal.crystalRock ? [ore] : undefined);
}

function herbNode(id: string, flowerColor: number): VoxelModel {
  const s = new VoxelSet();
  blob(s, 0, 1, 0, 2, 1, 2, pal.grassVale);
  s.set(0, 2, 0, flowerColor);
  s.set(1, 2, 0, flowerColor);
  s.set(-1, 2, 1, flowerColor);
  return prop(id, 0.4, s);
}

function fishingSpot(): VoxelModel {
  const s = new VoxelSet();
  // subtle bubbling ripple marker (rendered just above water)
  for (const [x, z] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    s.set(x!, 0, z!, 0x9fd0f0);
  }
  return prop('fishingSpot', 0.5, s);
}

// --- Registry ---------------------------------------------------------------

export type PropId =
  | 'treeOak'
  | 'treeBirch'
  | 'treeMosswood'
  | 'treePine'
  | 'treeCrystalPine'
  | 'treePalm'
  | 'treeDead'
  | 'treeBlighted'
  | 'rockSmall'
  | 'rockLarge'
  | 'rockCrystal'
  | 'bush'
  | 'fern'
  | 'flowerRed'
  | 'flowerYellow'
  | 'wheat'
  | 'reeds'
  | 'oreCopper'
  | 'oreIron'
  | 'oreSilver'
  | 'oreCrystal'
  | 'herbMeadow'
  | 'herbFen'
  | 'fishingSpot';

let cache: Map<PropId, VoxelModel> | null = null;

function buildAll(): Map<PropId, VoxelModel> {
  const m = new Map<PropId, VoxelModel>();
  m.set('treeOak', treeRound('treeOak', pal.woodOak, 0x5c9a40, 9, 4));
  m.set('treeBirch', treeRound('treeBirch', 0xd8d2c2, 0x7fb84e, 10, 3));
  m.set('treeMosswood', treeRound('treeMosswood', pal.woodDark, pal.grassWeald, 11, 5));
  m.set('treePine', treeConifer('treePine', pal.woodDark, 0x3f6b3a, 4));
  m.set('treeCrystalPine', treeConifer('treeCrystalPine', pal.woodDark, 0x5b8f86, 4));
  m.set('treePalm', treePalm());
  m.set('treeDead', treeDead('treeDead', false));
  m.set('treeBlighted', treeDead('treeBlighted', true));
  m.set('rockSmall', rock('rockSmall', 2, pal.stone, 0.45));
  m.set('rockLarge', rock('rockLarge', 4, pal.stone, 0.55));
  m.set('rockCrystal', rockCrystal());
  m.set('bush', bush());
  m.set('fern', fern());
  m.set('flowerRed', flower('flowerRed', 0xc4463a));
  m.set('flowerYellow', flower('flowerYellow', 0xe6c34a));
  m.set('wheat', wheat());
  m.set('reeds', reeds());
  m.set('oreCopper', oreVein('oreCopper', 0xc07b4a));
  m.set('oreIron', oreVein('oreIron', pal.iron));
  m.set('oreSilver', oreVein('oreSilver', 0xd7dbe0));
  m.set('oreCrystal', oreVein('oreCrystal', pal.crystalRock));
  m.set('herbMeadow', herbNode('herbMeadow', 0x7fc9e8));
  m.set('herbFen', herbNode('herbFen', 0xb07fe8));
  m.set('fishingSpot', fishingSpot());
  return m;
}

export function getProp(id: PropId): VoxelModel {
  if (!cache) cache = buildAll();
  return cache.get(id)!;
}

export const PROP_IDS: readonly PropId[] = [
  'treeOak',
  'treeBirch',
  'treeMosswood',
  'treePine',
  'treeCrystalPine',
  'treePalm',
  'treeDead',
  'treeBlighted',
  'rockSmall',
  'rockLarge',
  'rockCrystal',
  'bush',
  'fern',
  'flowerRed',
  'flowerYellow',
  'wheat',
  'reeds',
  'oreCopper',
  'oreIron',
  'oreSilver',
  'oreCrystal',
  'herbMeadow',
  'herbFen',
  'fishingSpot',
];
