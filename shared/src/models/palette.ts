// The Pathlands colour palette. Colours are packed 0xRRGGBB integers (pure data —
// safe in shared/). Terrain colours here feed the chunk mesher; character/prop
// colours feed the voxel-model mesher. Extend here and document in ART_GUIDE §1.

import { Voxel } from '../core/constants.js';
import { Biome } from '../worldgen/biomes.js';

export const pal = {
  // world surfaces
  grassVale: 0x6fa84e,
  grassWeald: 0x4e7a3a,
  grassFoothills: 0x8a9a4a,
  grassTrollmoor: 0x5f6f43,
  grassCoast: 0x86a95b,
  dirt: 0x8a6a48,
  stone: 0x8d8d93,
  stoneDark: 0x5e5e66,
  sand: 0xe4d29a,
  snow: 0xeff3f6,
  water: 0x3d7dc4,
  rock: 0x7c7c85,
  crystalRock: 0x7fd6e8,
  crystalRock2: 0x9a7fe8,
  blight: 0x7ccb2e,

  // materials
  woodOak: 0x7a5636,
  woodDark: 0x4f3a26,
  roofBrick: 0xa6503e,
  plaster: 0xe8dfc8,
  wheat: 0xd9b54a,
  leather: 0x6e4f33,
  leatherDark: 0x4a3220,
  iron: 0xb9bec6,
  ironDark: 0x74787f,
  steel: 0xc3c9d2,
  gold: 0xc9a23f,
  goldLight: 0xe2c463,
  bone: 0xe9e2c9,
  cloth: 0xd8d2c2,

  // class signature colours
  warriorSteel: 0xc3c9d2,
  warriorNavy: 0x2e3a54,
  warriorRed: 0x9c3b32,
  rangerGreen: 0x3f6b3a,
  rangerLeather: 0x6e4f33,
  priestWhite: 0xeef0e6,
  priestGold: 0xd8b24a,
  mageBlue: 0x33509c,
  mageViolet: 0x6a4ba6,
  mageGold: 0xd8b24a,

  // accents / fx
  flame: 0xf2a03d,
  eye: 0x2a2a33,
  gemBlue: 0x59b6e8,
  gemGreen: 0x62d08a,
  gemViolet: 0xb07fe8,
} as const;

// Fix up the array-valued palette members (kept out of the `as const` literal above).
export const SKIN_TONES: readonly number[] = [0xf1c9a5, 0xe0a878, 0xc98a5e, 0x8d5a3b];
export const HAIR_COLORS: readonly number[] = [
  0x2a1c12, // dark brown
  0x5a3a1e, // brown
  0x8a5a2c, // auburn
  0xc9a24a, // blond
  0x3a3a3f, // black-grey
  0xb04a2a, // ginger
];
export const EYE_COLORS: readonly number[] = [0x3a6ea5, 0x5a7d3a, 0x6b4a2a, 0x4a4a52];

/** Terrain voxel → base colour, tinted by biome for grass. */
export function terrainColor(v: Voxel, biome: Biome): number {
  switch (v) {
    case Voxel.Grass:
      switch (biome) {
        case Biome.Weald:
          return pal.grassWeald;
        case Biome.Foothills:
          return pal.grassFoothills;
        case Biome.Trollmoor:
          return pal.grassTrollmoor;
        case Biome.Coast:
          return pal.grassCoast;
        default:
          return pal.grassVale;
      }
    case Voxel.Dirt:
      return pal.dirt;
    case Voxel.Stone:
      return pal.stone;
    case Voxel.Sand:
      return pal.sand;
    case Voxel.Snow:
      return pal.snow;
    case Voxel.Water:
      return pal.water;
    case Voxel.Rock:
      return pal.rock;
    case Voxel.CrystalRock:
      return pal.crystalRock;
    case Voxel.BlightMoss:
      return pal.blight;
    default:
      return 0xff00ff; // magenta = "should never render"
  }
}

/** Multiply an RGB colour by a brightness factor (for shade jitter / AO tinting). */
export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

/** Split a packed colour into normalised [0,1] float RGB (for Three.js vertex colours). */
export function toFloatRGB(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255];
}
