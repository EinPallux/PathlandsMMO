// The six zones of the continent as a biome macro-map. Zone centres are placed
// on a 3×3 grid matching docs/WORLD.md §2; biome assignment is a domain-warped
// nearest-centre Voronoi, and terrain height blends smoothly between the two
// nearest zones so borders are slopes, not cliffs.

import { WORLD_SIZE_X, WORLD_SIZE_Z, SEA_LEVEL } from '../core/constants.js';

export enum Biome {
  Vale = 0, // Heartmead Vale — starter meadows (centre)
  Weald = 1, // Mossfang Weald — deep forest (east)
  Foothills = 2, // Stonejaw Foothills — dry cave-riddled hills (west)
  Peaks = 3, // Glimmerpeaks — crystal mountains (north-west)
  Trollmoor = 4, // Trollmoor Highlands — bleak moor (north)
  Coast = 5, // Sunlit Coast — beaches & sea (south)
}

export const BIOME_COUNT = 6;

export interface BiomeParams {
  readonly biome: Biome;
  readonly name: string;
  /** Normalised zone centre in [0,1]² (x east, z south). */
  readonly cx: number;
  readonly cz: number;
  /** Baseline surface height. */
  readonly base: number;
  /** Amplitude of rolling fBm hills. */
  readonly amp: number;
  /** Additional ridged-noise amplitude (mountains/hills). */
  readonly ridgeAmp: number;
  /** Whether this zone carves caves below the surface. */
  readonly caves: boolean;
}

// NOTE: centres follow docs/WORLD.md — north (z→0) is high, south (z→1) is sea.
export const BIOMES: Record<Biome, BiomeParams> = {
  [Biome.Peaks]: {
    biome: Biome.Peaks,
    name: 'Glimmerpeaks',
    cx: 0.18,
    cz: 0.16,
    base: 108,
    amp: 20,
    ridgeAmp: 46,
    caves: true,
  },
  [Biome.Trollmoor]: {
    biome: Biome.Trollmoor,
    name: 'Trollmoor Highlands',
    cx: 0.53,
    cz: 0.15,
    base: 90,
    amp: 20,
    ridgeAmp: 12,
    caves: false,
  },
  [Biome.Foothills]: {
    biome: Biome.Foothills,
    name: 'Stonejaw Foothills',
    cx: 0.16,
    cz: 0.5,
    base: 70,
    amp: 16,
    ridgeAmp: 20,
    caves: true,
  },
  [Biome.Vale]: {
    biome: Biome.Vale,
    name: 'Heartmead Vale',
    cx: 0.5,
    cz: 0.5,
    base: 56,
    amp: 7,
    ridgeAmp: 0,
    caves: false,
  },
  [Biome.Weald]: {
    biome: Biome.Weald,
    name: 'Mossfang Weald',
    cx: 0.84,
    cz: 0.52,
    base: 60,
    amp: 13,
    ridgeAmp: 4,
    caves: false,
  },
  [Biome.Coast]: {
    biome: Biome.Coast,
    name: 'Sunlit Coast',
    cx: 0.5,
    cz: 0.86,
    base: SEA_LEVEL + 4,
    amp: 6,
    ridgeAmp: 0,
    caves: false,
  },
};

export const BIOME_LIST: readonly BiomeParams[] = [
  BIOMES[Biome.Peaks],
  BIOMES[Biome.Trollmoor],
  BIOMES[Biome.Foothills],
  BIOMES[Biome.Vale],
  BIOMES[Biome.Weald],
  BIOMES[Biome.Coast],
];

/** Convert world (x,z) to normalised [0,1] zone space. */
export function normX(x: number): number {
  return x / WORLD_SIZE_X;
}
export function normZ(z: number): number {
  return z / WORLD_SIZE_Z;
}
