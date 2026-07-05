// Mount voxel models (ART_GUIDE §2, GDD §7): the rideable Wolf and its palette
// skins, authored in code like every other model. Bigger and stockier than the
// Mossfang enemy wolf, with a saddle on the back for the rider to sit on. A compact
// quadruped rig gives it idle / walk / run / jump gaits. Pure.

import type { AnimatedModel, AnimationClip, ClipSet, ModelPart, PartKeyframe } from '../types.js';
import { VoxelSet, part } from '../builder.js';
import { pal } from '../palette.js';

const kf = (
  t: number,
  rot?: [number, number, number],
  pos?: [number, number, number],
): PartKeyframe => ({ t, ...(rot ? { rot } : {}), ...(pos ? { pos } : {}) });

function wolfClips(): ClipSet {
  const gait = (amp: number, dur: number, name: 'walk' | 'run', bob: number): AnimationClip => ({
    name,
    duration: dur,
    loop: true,
    tracks: {
      legFL: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legBR: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legFR: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
      legBL: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
      torso: [
        kf(0, undefined, [0, 0, 0]),
        kf(0.5, undefined, [0, bob, 0]),
        kf(1, undefined, [0, 0, 0]),
      ],
    },
  });
  return {
    idle: {
      name: 'idle',
      duration: 3.2,
      loop: true,
      tracks: {
        head: [kf(0, [0, 0, 0]), kf(0.5, [0.06, 0.1, 0]), kf(1, [0, 0, 0])],
        tail: [kf(0, [0, 0, 0]), kf(0.5, [0, 0.35, 0]), kf(1, [0, 0, 0])],
      },
    },
    walk: gait(0.55, 0.5, 'walk', 0.4),
    run: gait(1.05, 0.34, 'run', 0.9),
    jump: {
      name: 'jump',
      duration: 0.5,
      loop: false,
      tracks: {
        legFL: [kf(0, [-0.8, 0, 0])],
        legFR: [kf(0, [-0.8, 0, 0])],
        legBL: [kf(0, [0.8, 0, 0])],
        legBR: [kf(0, [0.8, 0, 0])],
      },
    },
  };
}

export interface WolfPalette {
  fur: number;
  furDark: number;
  belly: number;
  saddle: number;
  saddleTrim: number;
}

function buildWolf(id: string, c: WolfPalette): AnimatedModel {
  const bodyLen = 11;
  const bodyW = 5;
  const bodyH = 5;
  const legH = 6;
  const halfW = Math.floor(bodyW / 2); // 2
  const y0 = legH;

  // Torso (fur back, lighter belly) with a saddle blanket + horn on top.
  const torso = new VoxelSet();
  torso.box(-halfW, y0, -bodyLen + 2, bodyW, bodyH, bodyLen, c.fur);
  torso.box(-halfW, y0, -bodyLen + 2, bodyW, 1, bodyLen, c.belly);
  // Saddle: a blanket over the mid-back plus a small pommel horn for the rider.
  torso.box(-halfW, y0 + bodyH, -3, bodyW, 1, 5, c.saddle);
  torso.box(-halfW, y0 + bodyH + 1, -3, bodyW, 1, 5, c.saddleTrim);
  torso.set(0, y0 + bodyH + 2, -1, c.saddleTrim);
  // A low mane ridge along the neck-to-shoulders.
  for (let z = 1; z < 4; z++) torso.set(0, y0 + bodyH, z, c.furDark);
  const parts: ModelPart[] = [part('torso', [0, y0, 0], torso)];

  // Head + snout + ears + eyes.
  const hy = y0 + bodyH;
  const head = new VoxelSet();
  head.box(-halfW + 1, y0 + 1, 3, bodyW - 2, bodyH, 3, c.fur); // neck
  head.box(-halfW + 1, hy, 5, bodyW - 2, 3, 4, c.fur); // skull
  head.box(-halfW + 1, hy, 8, bodyW - 2, 2, 2, c.furDark); // snout
  head.set(-halfW + 1, hy + 3, 5, c.furDark); // ear L
  head.set(halfW - 1, hy + 3, 5, c.furDark); // ear R
  head.set(-halfW + 1, hy + 2, 8, pal.eye);
  head.set(halfW - 1, hy + 2, 8, pal.eye);
  parts.push(part('head', [0, hy, 3], head));

  // Bushy tail, raised slightly.
  const tail = new VoxelSet();
  tail.box(-1, y0 + bodyH - 1, -bodyLen + 1, 2, 3, 3, c.fur);
  tail.set(0, y0 + bodyH + 2, -bodyLen, c.furDark);
  parts.push(part('tail', [0, y0 + bodyH, -bodyLen + 2], tail));

  // Four legs (paws a touch darker).
  const legX = halfW - 1;
  const mkLeg = (name: string, x: number, z: number): void => {
    const s = new VoxelSet();
    s.box(x, 1, z, 1, legH - 1, 2, c.fur);
    s.box(x, 0, z, 1, 1, 2, c.furDark); // paw
    parts.push(part(name, [x, legH, z], s));
  };
  mkLeg('legFR', legX, 3);
  mkLeg('legFL', -legX, 3);
  mkLeg('legBR', legX, -bodyLen + 3);
  mkLeg('legBL', -legX, -bodyLen + 3);

  return {
    model: { id, scale: 1 / 11, parts },
    clips: wolfClips(),
  };
}

const BUILDERS: Record<string, () => AnimatedModel> = {
  'mount.wolf': () =>
    buildWolf('mount.wolf', {
      fur: 0x6a6a72,
      furDark: 0x3f3f46,
      belly: 0x8a8a92,
      saddle: 0x6a3a24,
      saddleTrim: pal.goldLight,
    }),
  'mount.direWolf': () =>
    buildWolf('mount.direWolf', {
      fur: 0x40342c,
      furDark: 0x201814,
      belly: 0x5a4a3e,
      saddle: 0x2a1a12,
      saddleTrim: pal.iron,
    }),
  'mount.frostWolf': () =>
    buildWolf('mount.frostWolf', {
      fur: 0xcdd8e6,
      furDark: 0x8fa6c4,
      belly: 0xeef4fb,
      saddle: 0x3a4a6a,
      saddleTrim: pal.gemBlue,
    }),
};

const cache = new Map<string, AnimatedModel>();

/** Whether a modelId has a mount builder here. */
export function hasMountModel(modelId: string): boolean {
  return modelId in BUILDERS;
}

/** Build (and cache) a mount voxel model by its modelId. */
export function buildMountModel(modelId: string): AnimatedModel | null {
  if (cache.has(modelId)) return cache.get(modelId)!;
  const builder = BUILDERS[modelId];
  if (!builder) return null;
  const model = builder();
  cache.set(modelId, model);
  return model;
}

/** All mount modelIds this module can build. */
export const MOUNT_MODEL_IDS: readonly string[] = Object.keys(BUILDERS);
