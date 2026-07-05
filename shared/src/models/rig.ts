// The shared humanoid rig: standard animation clips keyed to the part names every
// humanoid model uses (head, torso, armL, armR, legL, legR, weaponMain, weaponOff).
// Clips are pure keyframe data. Rotations are Euler radians about each part's pivot;
// positions are offsets in local voxel units. Animation is visual only (ART_GUIDE §4).

import type { AnimationClip, ClipSet, PartKeyframe } from './types.js';

const kf = (
  t: number,
  rot?: [number, number, number],
  pos?: [number, number, number],
): PartKeyframe => ({ t, ...(rot ? { rot } : {}), ...(pos ? { pos } : {}) });

// --- individual clips -------------------------------------------------------

const idle: AnimationClip = {
  name: 'idle',
  duration: 2.6,
  loop: true,
  tracks: {
    torso: [
      kf(0, undefined, [0, 0, 0]),
      kf(0.5, undefined, [0, 0.35, 0]),
      kf(1, undefined, [0, 0, 0]),
    ],
    head: [kf(0, [0, 0, 0]), kf(0.5, [0.06, 0.1, 0]), kf(1, [0, 0, 0])],
    armL: [kf(0, [0, 0, 0.05]), kf(0.5, [0.08, 0, 0.05]), kf(1, [0, 0, 0.05])],
    armR: [kf(0, [0, 0, -0.05]), kf(0.5, [0.08, 0, -0.05]), kf(1, [0, 0, -0.05])],
  },
};

const walk: AnimationClip = {
  name: 'walk',
  duration: 0.72,
  loop: true,
  tracks: {
    legR: [kf(0, [0.55, 0, 0]), kf(0.5, [-0.55, 0, 0]), kf(1, [0.55, 0, 0])],
    legL: [kf(0, [-0.55, 0, 0]), kf(0.5, [0.55, 0, 0]), kf(1, [-0.55, 0, 0])],
    armR: [kf(0, [-0.45, 0, 0]), kf(0.5, [0.45, 0, 0]), kf(1, [-0.45, 0, 0])],
    armL: [kf(0, [0.45, 0, 0]), kf(0.5, [-0.45, 0, 0]), kf(1, [0.45, 0, 0])],
    torso: [
      kf(0, undefined, [0, 0, 0]),
      kf(0.25, undefined, [0, 0.28, 0]),
      kf(0.5, undefined, [0, 0, 0]),
      kf(0.75, undefined, [0, 0.28, 0]),
      kf(1, undefined, [0, 0, 0]),
    ],
  },
};

const run: AnimationClip = {
  name: 'run',
  duration: 0.5,
  loop: true,
  tracks: {
    legR: [kf(0, [0.95, 0, 0]), kf(0.5, [-0.95, 0, 0]), kf(1, [0.95, 0, 0])],
    legL: [kf(0, [-0.95, 0, 0]), kf(0.5, [0.95, 0, 0]), kf(1, [-0.95, 0, 0])],
    armR: [kf(0, [-0.8, 0, 0.2]), kf(0.5, [0.8, 0, 0.2]), kf(1, [-0.8, 0, 0.2])],
    armL: [kf(0, [0.8, 0, -0.2]), kf(0.5, [-0.8, 0, -0.2]), kf(1, [0.8, 0, -0.2])],
    torso: [
      kf(0, [-0.22, 0, 0], [0, 0, 0]),
      kf(0.25, [-0.22, 0, 0], [0, 0.4, 0]),
      kf(0.5, [-0.22, 0, 0], [0, 0, 0]),
      kf(0.75, [-0.22, 0, 0], [0, 0.4, 0]),
      kf(1, [-0.22, 0, 0], [0, 0, 0]),
    ],
    head: [kf(0, [0.16, 0, 0]), kf(1, [0.16, 0, 0])],
  },
};

const jump: AnimationClip = {
  name: 'jump',
  duration: 0.6,
  loop: false,
  tracks: {
    legR: [kf(0, [0, 0, 0]), kf(0.35, [0.7, 0, 0]), kf(1, [0.5, 0, 0])],
    legL: [kf(0, [0, 0, 0]), kf(0.35, [0.7, 0, 0]), kf(1, [0.5, 0, 0])],
    armR: [kf(0, [0, 0, 0]), kf(0.35, [-1.4, 0, 0]), kf(1, [-1.1, 0, 0])],
    armL: [kf(0, [0, 0, 0]), kf(0.35, [-1.4, 0, 0]), kf(1, [-1.1, 0, 0])],
    torso: [kf(0, [0, 0, 0]), kf(0.35, [-0.12, 0, 0]), kf(1, [0, 0, 0])],
  },
};

const swim: AnimationClip = {
  name: 'swim',
  duration: 1.0,
  loop: true,
  tracks: {
    torso: [kf(0, [0.5, 0, 0]), kf(1, [0.5, 0, 0])],
    head: [kf(0, [-0.35, 0, 0]), kf(1, [-0.35, 0, 0])],
    armR: [kf(0, [-1.6, 0, 0]), kf(0.5, [0.4, 0, 0]), kf(1, [-1.6, 0, 0])],
    armL: [kf(0, [0.4, 0, 0]), kf(0.5, [-1.6, 0, 0]), kf(1, [0.4, 0, 0])],
    legR: [kf(0, [0.35, 0, 0]), kf(0.5, [-0.35, 0, 0]), kf(1, [0.35, 0, 0])],
    legL: [kf(0, [-0.35, 0, 0]), kf(0.5, [0.35, 0, 0]), kf(1, [-0.35, 0, 0])],
  },
};

const attack: AnimationClip = {
  name: 'attack',
  duration: 0.45,
  loop: false,
  tracks: {
    armR: [
      kf(0, [0, 0, -0.05]),
      kf(0.25, [-1.7, 0.3, 0]),
      kf(0.55, [1.2, -0.2, 0]),
      kf(1, [0, 0, -0.05]),
    ],
    weaponMain: [
      kf(0, [0, 0, 0]),
      kf(0.25, [-1.7, 0.3, 0]),
      kf(0.55, [1.2, -0.2, 0]),
      kf(1, [0, 0, 0]),
    ],
    torso: [kf(0, [0, 0, 0]), kf(0.25, [0, -0.3, 0]), kf(0.55, [0, 0.35, 0]), kf(1, [0, 0, 0])],
  },
};

const cast: AnimationClip = {
  name: 'cast',
  duration: 0.75,
  loop: false,
  tracks: {
    armR: [
      kf(0, [0, 0, -0.05]),
      kf(0.4, [-1.1, -0.2, 0]),
      kf(0.7, [-1.0, -0.2, 0]),
      kf(1, [0, 0, -0.05]),
    ],
    armL: [
      kf(0, [0, 0, 0.05]),
      kf(0.4, [-1.0, 0.2, 0]),
      kf(0.7, [-0.9, 0.2, 0]),
      kf(1, [0, 0, 0.05]),
    ],
    weaponMain: [
      kf(0, [0, 0, 0]),
      kf(0.4, [-1.1, -0.2, 0]),
      kf(0.7, [-1.0, -0.2, 0]),
      kf(1, [0, 0, 0]),
    ],
    head: [kf(0, [0, 0, 0]), kf(0.4, [-0.15, 0, 0]), kf(1, [0, 0, 0])],
  },
};

const hit: AnimationClip = {
  name: 'hit',
  duration: 0.3,
  loop: false,
  tracks: {
    torso: [kf(0, [0, 0, 0]), kf(0.3, [0.4, 0, 0]), kf(1, [0, 0, 0])],
    head: [kf(0, [0, 0, 0]), kf(0.3, [0.5, 0, 0]), kf(1, [0, 0, 0])],
    armR: [kf(0, [0, 0, 0]), kf(0.3, [0.3, 0, 0]), kf(1, [0, 0, 0])],
    armL: [kf(0, [0, 0, 0]), kf(0.3, [0.3, 0, 0]), kf(1, [0, 0, 0])],
  },
};

const death: AnimationClip = {
  name: 'death',
  duration: 0.9,
  loop: false,
  tracks: {
    torso: [
      kf(0, [0, 0, 0], [0, 0, 0]),
      kf(0.5, [-0.9, 0, 0.2], [0, -1, 0]),
      kf(1, [-1.5, 0, 0.3], [0, -3, 0]),
    ],
    head: [kf(0, [0, 0, 0]), kf(1, [-0.6, 0, 0.3])],
    armR: [kf(0, [0, 0, 0]), kf(1, [-1.3, 0, 0])],
    armL: [kf(0, [0, 0, 0]), kf(1, [-1.3, 0, 0])],
    legR: [kf(0, [0, 0, 0]), kf(1, [1.0, 0, 0])],
    legL: [kf(0, [0, 0, 0]), kf(1, [1.0, 0, 0])],
  },
};

/** The full standard clip set shared by all humanoid models. */
export const HUMANOID_CLIPS: ClipSet = {
  idle,
  walk,
  run,
  jump,
  swim,
  attack,
  cast,
  hit,
  death,
};
