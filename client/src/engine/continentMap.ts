// Renders the whole continent to an offscreen canvas once (biomes, height shading,
// water, snow), shared by the minimap and the world map. Also exposes point-of-
// interest data (settlements, Waystones) and roads from the shared world data.

import {
  World,
  WORLD_SEED,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
  SEA_LEVEL,
  SNOW_LINE,
  Biome,
  pal,
  shade,
  SETTLEMENTS,
  WILD_WAYSTONES,
  ROADS,
} from '@pathlands/shared';

export const MAP_RES = 256;

const BIOME_COLOR: Record<Biome, number> = {
  [Biome.Vale]: pal.grassVale,
  [Biome.Weald]: pal.grassWeald,
  [Biome.Foothills]: pal.grassFoothills,
  [Biome.Peaks]: pal.stone,
  [Biome.Trollmoor]: pal.grassTrollmoor,
  [Biome.Coast]: pal.sand,
};

let cache: HTMLCanvasElement | null = null;

/** Lazily render (once) and return the continent map canvas. */
export function getContinentMap(): HTMLCanvasElement {
  if (cache) return cache;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_RES;
  canvas.height = MAP_RES;
  const ctx = canvas.getContext('2d')!;
  const world = new World(WORLD_SEED);
  const img = ctx.createImageData(MAP_RES, MAP_RES);
  const data = img.data;
  for (let j = 0; j < MAP_RES; j++) {
    const wz = (j / MAP_RES) * WORLD_SIZE_Z;
    for (let i = 0; i < MAP_RES; i++) {
      const wx = (i / MAP_RES) * WORLD_SIZE_X;
      const h = world.heightAt(wx, wz);
      const biome = world.biomeAt(wx, wz);
      let rgb: number;
      if (h <= SEA_LEVEL) {
        rgb = shade(pal.water, Math.max(0.45, 1 - (SEA_LEVEL - h) / 40));
      } else if (h > SNOW_LINE) {
        rgb = pal.snow;
      } else {
        rgb = shade(BIOME_COLOR[biome], 0.72 + Math.min(0.5, (h - SEA_LEVEL) / 150));
      }
      const o = (j * MAP_RES + i) * 4;
      data[o] = (rgb >> 16) & 0xff;
      data[o + 1] = (rgb >> 8) & 0xff;
      data[o + 2] = rgb & 0xff;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache = canvas;
  return canvas;
}

export interface Poi {
  name: string;
  /** Normalised [0,1] map coords. */
  nx: number;
  nz: number;
  kind: 'town' | 'waystone';
}

export function mapPois(): Poi[] {
  const out: Poi[] = [];
  for (const s of SETTLEMENTS) {
    out.push({ name: s.name, nx: s.cx / WORLD_SIZE_X, nz: s.cz / WORLD_SIZE_Z, kind: 'town' });
  }
  for (const w of WILD_WAYSTONES) {
    out.push({ name: w.name, nx: w.x / WORLD_SIZE_X, nz: w.z / WORLD_SIZE_Z, kind: 'waystone' });
  }
  return out;
}

/** Road polylines in normalised [0,1] map coords. */
export function mapRoads(): Array<Array<{ nx: number; nz: number }>> {
  return ROADS.map((r) => r.nodes.map((n) => ({ nx: n.x / WORLD_SIZE_X, nz: n.z / WORLD_SIZE_Z })));
}
