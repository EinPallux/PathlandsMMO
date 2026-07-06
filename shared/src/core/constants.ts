// Core world & simulation constants. These are load-bearing: worldgen, saves,
// and (Phase 6) the server all depend on them being fixed. Changing WORLD_SEED,
// CHUNK_SIZE, or the world dimensions reshapes the world — treat as a breaking change.

/** The one and only world seed. Same seed + same code ⇒ byte-identical world anywhere. */
export const WORLD_SEED = 1348563048;

/**
 * Default spawn: the Brookhollow plaza, the starting town's centre. Both the client
 * (fresh character) and the Phase-6 server place new players here, so it lives in
 * shared/ — client and server must agree on where a character enters the world.
 * The feet-Y is resolved from worldgen (`heightAt` + a small drop) at spawn time.
 */
export const SPAWN_X = 1536.5;
export const SPAWN_Z = 1524.5;

// --- Simulation timing (fixed tick; no wall-clock time in sim code) ---
/** Simulation ticks per second. */
export const TICK_RATE = 20;
/** Milliseconds per simulation tick. */
export const TICK_DURATION_MS = 1000 / TICK_RATE;
/** Seconds advanced per simulation tick (dt for movement/physics integration). */
export const TICK_DT = 1 / TICK_RATE;

// --- World dimensions (in voxels; 1 voxel = 1 metre) ---
export const CHUNK_SIZE = 32;
export const WORLD_HEIGHT = 192;
export const WORLD_SIZE_X = 3072;
export const WORLD_SIZE_Z = 3072;
export const WORLD_CHUNKS_X = WORLD_SIZE_X / CHUNK_SIZE; // 96
export const WORLD_CHUNKS_Z = WORLD_SIZE_Z / CHUNK_SIZE; // 96

// --- Elevation reference planes ---
/** Water surface height. At/below this in low terrain becomes water. */
export const SEA_LEVEL = 48;
/** Beach sand band thickness above sea level. */
export const BEACH_HEIGHT = 3;
/** Snow appears above this height (blended with slope in worldgen). */
export const SNOW_LINE = 122;
/** Absolute floor of the world; nothing generates below this. */
export const BEDROCK = 0;

/** Number of voxel columns in one chunk (CHUNK_SIZE²). */
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
/** Number of voxels in one full chunk volume. */
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

/** Voxel material ids stored per-voxel in chunk data (Uint8). */
export enum Voxel {
  Air = 0,
  // --- natural terrain (0–9) ---
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Snow = 5,
  Water = 6,
  Rock = 7, // exposed cliff/crag face
  CrystalRock = 8, // Glimmerpeaks luminous stone
  BlightMoss = 9, // Verdigris blight surface (emissive)
  // --- built structures & roads (10+), stamped by the authored layer ---
  WoodOak = 10,
  WoodDark = 11,
  Plaster = 12,
  RoofTile = 13, // red clay tiles
  Cobble = 14, // light dressed stone
  CobbleDark = 15,
  Thatch = 16,
  GlassWindow = 17, // emissive (warm firelight through glass)
  WaystoneStone = 18,
  WaystoneGlow = 19, // emissive (cyan Waymaker light)
  GoldTrim = 20,
  IronDark = 21,
  Path = 22, // road/path surface
  LanternGlow = 23, // emissive (lantern flame)
}

/** Highest material id in use — sizing for lookup tables. */
export const VOXEL_COUNT = 24;

/** True for voxel types the player/entities cannot pass through. */
export function isSolidVoxel(v: Voxel): boolean {
  return v !== Voxel.Air && v !== Voxel.Water;
}

/** True for voxel types that count as swimmable fluid. */
export function isFluidVoxel(v: Voxel): boolean {
  return v === Voxel.Water;
}

/** True for voxel types that glow (routed to the emissive mesh group at night). */
export function isEmissiveVoxel(v: Voxel): boolean {
  return (
    v === Voxel.GlassWindow ||
    v === Voxel.WaystoneGlow ||
    v === Voxel.LanternGlow ||
    v === Voxel.BlightMoss
  );
}
