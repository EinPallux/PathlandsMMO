// Authored settlement & road layout (ARCH §4 authored layer). Positions are world
// voxel coords (x east, z south; z=0 is north — see WORLD.md §2). Building layouts
// are generated deterministically around each centre from this data, so the world
// stays a pure function while feeling designed. Platform heights are derived from
// the base terrain at run time (no need to author elevations).

import type { BuildingId } from '../models/structures/buildings.js';

export interface Settlement {
  id: string;
  name: string;
  cx: number;
  cz: number;
  /** Flatten + building-layout radius (metres). */
  radius: number;
  /** Number of building rings around the plaza. */
  rings: number;
  /** Buildings cycled through for filler plots. */
  palette: BuildingId[];
  centre: 'fountain' | 'well';
  hasInn: boolean;
  hasChurch: boolean;
}

export const SETTLEMENTS: readonly Settlement[] = [
  {
    id: 'brookhollow',
    name: 'Brookhollow',
    cx: 1536,
    cz: 1536,
    radius: 46,
    rings: 2,
    palette: ['house1', 'house2', 'house4', 'workerHut', 'stable'],
    centre: 'fountain',
    hasInn: true,
    hasChurch: false,
  },
  {
    id: 'millstead',
    name: 'Millstead',
    cx: 1180,
    cz: 1748,
    radius: 30,
    rings: 1,
    palette: ['workerHut', 'house3', 'stable'],
    centre: 'well',
    hasInn: false,
    hasChurch: false,
  },
  {
    id: 'waymeet',
    name: 'Waymeet',
    cx: 1712,
    cz: 1852,
    radius: 68,
    rings: 3,
    palette: [
      'house1',
      'house2',
      'house3',
      'house4',
      'bigHouse1',
      'bigHouse2',
      'bathhouse',
      'stable',
    ],
    centre: 'fountain',
    hasInn: true,
    hasChurch: true,
  },
  {
    id: 'fernwick',
    name: 'Fernwick',
    cx: 2440,
    cz: 1512,
    radius: 40,
    rings: 2,
    palette: ['house2', 'house3', 'workerHut', 'house4'],
    centre: 'well',
    hasInn: true,
    hasChurch: false,
  },
  {
    id: 'mossgate',
    name: 'Mossgate',
    cx: 2120,
    cz: 1636,
    radius: 26,
    rings: 1,
    palette: ['workerHut', 'stable', 'house4'],
    centre: 'well',
    hasInn: false,
    hasChurch: false,
  },
  {
    id: 'grubbersRest',
    name: "Grubbers' Rest",
    cx: 560,
    cz: 1520,
    radius: 40,
    rings: 2,
    palette: ['house1', 'house3', 'stable', 'workerHut'],
    centre: 'well',
    hasInn: true,
    hasChurch: false,
  },
  {
    id: 'glimmercamp',
    name: 'Glimmercamp',
    cx: 648,
    cz: 640,
    radius: 28,
    rings: 1,
    palette: ['workerHut', 'stable', 'house4'],
    centre: 'well',
    hasInn: false,
    hasChurch: false,
  },
  {
    id: 'cairnwick',
    name: 'Cairnwick',
    cx: 1520,
    cz: 512,
    radius: 42,
    rings: 2,
    palette: ['house1', 'house2', 'bigHouse1', 'stable', 'workerHut'],
    centre: 'fountain',
    hasInn: true,
    hasChurch: true,
  },
];

export function settlementById(id: string): Settlement | undefined {
  return SETTLEMENTS.find((s) => s.id === id);
}

/** Standalone wilderness Waystones (settlements already get one at their plaza). */
export interface WildWaystone {
  id: string;
  name: string;
  x: number;
  z: number;
}

export const WILD_WAYSTONES: readonly WildWaystone[] = [
  { id: 'oldRoadGate', name: 'Old Road Gate', x: 1560, z: 1680 },
  { id: 'elderGlade', name: 'Elder Glade', x: 2320, z: 1400 },
  { id: 'gulchBottom', name: 'Gulch Bottom', x: 700, z: 1320 },
  { id: 'crystalOverlook', name: 'Crystal Overlook', x: 820, z: 820 },
  { id: 'theSentinels', name: 'The Sentinels', x: 1720, z: 560 },
  { id: 'pierside', name: 'Pierside', x: 1560, z: 2560 },
  { id: 'cryptwatch', name: 'Cryptwatch', x: 1500, z: 2820 },
];

/** The five open-world dungeons ("Hollows"). Phase 2 carves entrances only. */
export type HollowTheme = 'goblin' | 'gnoll' | 'crystal' | 'iron' | 'crypt';

export interface Hollow {
  id: string;
  name: string;
  x: number;
  z: number;
  theme: HollowTheme;
}

export const HOLLOWS: readonly Hollow[] = [
  { id: 'briarhollow', name: 'Briarhollow Warrens', x: 2300, z: 1560, theme: 'goblin' },
  { id: 'gloomroot', name: 'Gloomroot Cavern', x: 700, z: 1400, theme: 'gnoll' },
  { id: 'crystalDeeps', name: 'The Crystal Deeps', x: 770, z: 780, theme: 'crystal' },
  { id: 'ironvein', name: 'Ironvein Halls', x: 1400, z: 640, theme: 'iron' },
  { id: 'sunkenCrypt', name: 'The Sunken Crypt', x: 1500, z: 2740, theme: 'crypt' },
];

/** Roads: ordered settlement/waypoint chains forming the Old Road network. */
export interface Road {
  nodes: Array<{ x: number; z: number }>;
}

// Waypoints route roads gently between town centres.
export const ROADS: readonly Road[] = [
  {
    nodes: [
      { x: 1536, z: 1536 },
      { x: 1620, z: 1690 },
      { x: 1712, z: 1852 },
    ],
  }, // Brookhollow → Waymeet
  {
    nodes: [
      { x: 1536, z: 1536 },
      { x: 1360, z: 1640 },
      { x: 1180, z: 1748 },
    ],
  }, // Brookhollow → Millstead
  {
    nodes: [
      { x: 1536, z: 1536 },
      { x: 1050, z: 1520 },
      { x: 560, z: 1520 },
    ],
  }, // Brookhollow → Grubbers' Rest
  {
    nodes: [
      { x: 1536, z: 1536 },
      { x: 1850, z: 1560 },
      { x: 2120, z: 1636 },
      { x: 2440, z: 1512 },
    ],
  }, // Brookhollow → Mossgate → Fernwick
  {
    nodes: [
      { x: 560, z: 1520 },
      { x: 620, z: 1080 },
      { x: 648, z: 640 },
    ],
  }, // Grubbers' Rest → Glimmercamp
  {
    nodes: [
      { x: 648, z: 640 },
      { x: 1080, z: 540 },
      { x: 1520, z: 512 },
    ],
  }, // Glimmercamp → Cairnwick
  {
    nodes: [
      { x: 1712, z: 1852 },
      { x: 1600, z: 2200 },
      { x: 1540, z: 2560 },
    ],
  }, // Waymeet → Coast
];
