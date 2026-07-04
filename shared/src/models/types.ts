// Code-authored voxel model format (ART_GUIDE §2). Models are typed data: a set
// of named, pivoted parts, each a list of coloured voxels. The client meshes them
// at runtime; the server (Phase 6) uses only their bounds for collision. No files,
// no .vox — models are authored in TypeScript and diff cleanly.

/** A single coloured voxel in a part's local integer grid. */
export interface ModelVoxel {
  x: number;
  y: number;
  z: number;
  /** Packed 0xRRGGBB colour. */
  c: number;
}

/** A named, independently-animatable part (head, arm, weapon…). */
export interface ModelPart {
  name: string;
  /** Rotation pivot in the model's local voxel space [x, y, z]. */
  pivot: [number, number, number];
  voxels: ModelVoxel[];
}

/** A complete voxel model. */
export interface VoxelModel {
  id: string;
  /** World metres per voxel (characters ≈ 1/16). */
  scale: number;
  parts: ModelPart[];
  /** Colours (0xRRGGBB) that should render as emissive (blight, crystals, gems). */
  emissive?: number[];
}

/** One keyframe of a part's animation track (values are offsets from the rest pose). */
export interface PartKeyframe {
  /** Normalised time within the clip, 0..1. */
  t: number;
  /** Positional offset in local voxel units [x, y, z]. */
  pos?: [number, number, number];
  /** Rotation about the part pivot, Euler radians [x, y, z]. */
  rot?: [number, number, number];
}

/** A named animation clip: per-part keyframe tracks over a fixed duration. */
export interface AnimationClip {
  name: string;
  /** Duration in seconds (visual; animation is client-side, never gates the sim). */
  duration: number;
  loop: boolean;
  /** partName → keyframes (sorted by t). Parts absent here stay at rest. */
  tracks: Record<string, PartKeyframe[]>;
}

/** The standard animation set. Every combat-capable model provides at least these. */
export type ClipName =
  'idle' | 'walk' | 'run' | 'jump' | 'swim' | 'attack' | 'cast' | 'hit' | 'death';

export type ClipSet = Partial<Record<ClipName, AnimationClip>>;

/** A model plus its animation clips — what the renderer consumes. */
export interface AnimatedModel {
  model: VoxelModel;
  clips: ClipSet;
}

/** Axis-aligned bounds of a model in voxel units. */
export interface ModelBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export function modelBounds(model: VoxelModel): ModelBounds {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const part of model.parts) {
    for (const v of part.voxels) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function countVoxels(model: VoxelModel): number {
  let n = 0;
  for (const part of model.parts) n += part.voxels.length;
  return n;
}
