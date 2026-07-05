// Ambient wildlife: quadrupeds (deer, dire stag, rabbit), a bird, and a fish, on
// their own rigs with idle/walk/run clips. Built from the shared VoxelSet.

import type { AnimatedModel, AnimationClip, ClipSet, PartKeyframe } from '../types.js';
import { VoxelSet, part } from '../builder.js';
import { pal } from '../palette.js';

const kf = (
  t: number,
  rot?: [number, number, number],
  pos?: [number, number, number],
): PartKeyframe => ({ t, ...(rot ? { rot } : {}), ...(pos ? { pos } : {}) });

// --- Quadruped clips (diagonal gait) ---------------------------------------

function quadClips(): ClipSet {
  const idle: AnimationClip = {
    name: 'idle',
    duration: 3,
    loop: true,
    tracks: {
      head: [kf(0, [0, 0, 0]), kf(0.5, [0.12, 0.1, 0]), kf(1, [0, 0, 0])],
      tail: [kf(0, [0, 0, 0]), kf(0.5, [0, 0.25, 0]), kf(1, [0, 0, 0])],
    },
  };
  const gait = (amp: number, dur: number, name: 'walk' | 'run'): AnimationClip => ({
    name,
    duration: dur,
    loop: true,
    tracks: {
      legFL: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legBR: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legFR: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
      legBL: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
      head: name === 'run' ? [kf(0, [-0.15, 0, 0]), kf(1, [-0.15, 0, 0])] : [],
    },
  });
  return { idle, walk: gait(0.6, 0.6, 'walk'), run: gait(1.0, 0.42, 'run') };
}

interface QuadOpts {
  body: number;
  belly: number;
  leg: number;
  bodyLen: number;
  bodyW: number;
  bodyH: number;
  legH: number;
  scale: number;
  antlers?: number;
  emissive?: number[];
}

function buildQuadruped(id: string, o: QuadOpts): AnimatedModel {
  const halfW = Math.floor(o.bodyW / 2);
  const y0 = o.legH;
  const torso = new VoxelSet();
  torso.box(-halfW, y0, -o.bodyLen + 2, o.bodyW, o.bodyH, o.bodyLen, o.body);
  torso.box(-halfW, y0, -o.bodyLen + 2, o.bodyW, 1, o.bodyLen, o.belly); // underside
  const parts = [part('torso', [0, y0, 0], torso)];

  // Head + neck at the +z front.
  const head = new VoxelSet();
  const hy = y0 + o.bodyH;
  head.box(-halfW + 1, y0 + 1, 3, o.bodyW - 2, o.bodyH, 3, o.body); // neck
  head.box(-halfW + 1, hy, 5, o.bodyW - 2, 3, 4, o.body); // head
  head.set(-halfW + 1, hy + 1, 8, pal.eye);
  head.set(halfW - 1, hy + 1, 8, pal.eye);
  if (o.antlers !== undefined) {
    for (const sx of [-halfW + 1, halfW - 1]) {
      head.box(sx, hy + 3, 5, 1, 4, 1, o.antlers);
      head.set(sx - 1, hy + 5, 5, o.antlers);
      head.set(sx + 1, hy + 6, 6, o.antlers);
      head.set(sx, hy + 6, 4, o.antlers);
    }
  }
  parts.push(part('head', [0, hy, 3], head));

  // Tail at the −z back.
  const tail = new VoxelSet();
  tail.box(-1, y0 + o.bodyH - 2, -o.bodyLen + 1, 2, 3, 2, o.body);
  parts.push(part('tail', [0, y0 + o.bodyH, -o.bodyLen + 2], tail));

  // Four legs.
  const legZFront = 3;
  const legZBack = -o.bodyLen + 3;
  const legX = halfW - 1;
  const mkLeg = (name: string, x: number, z: number): void => {
    const s = new VoxelSet();
    s.box(x, 0, z, 1, o.legH, 1, o.leg);
    parts.push(part(name, [x, o.legH, z], s));
  };
  mkLeg('legFR', legX, legZFront);
  mkLeg('legFL', -legX, legZFront);
  mkLeg('legBR', legX, legZBack);
  mkLeg('legBL', -legX, legZBack);

  return {
    model: { id, scale: o.scale, parts, ...(o.emissive ? { emissive: o.emissive } : {}) },
    clips: quadClips(),
  };
}

function buildRabbit(): AnimatedModel {
  const s = new VoxelSet();
  s.box(-1, 2, -2, 3, 3, 4, 0xbfae95); // body
  s.box(-1, 2, 1, 3, 2, 2, 0xd8cbb5); // head
  s.set(-1, 4, 3, pal.eye);
  s.set(1, 4, 3, pal.eye);
  s.box(-1, 5, 1, 1, 3, 1, 0xbfae95); // ears
  s.box(1, 5, 1, 1, 3, 1, 0xbfae95);
  s.box(-1, 0, -2, 1, 2, 2, 0xa89880); // hind legs
  s.box(1, 0, -2, 1, 2, 2, 0xa89880);
  s.set(0, 2, -2, 0xf0e8d8); // tail
  return {
    model: { id: 'creature.rabbit', scale: 1 / 16, parts: [part('torso', [0, 0, 0], s)] },
    clips: {
      idle: {
        name: 'idle',
        duration: 1.6,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.4, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
    },
  };
}

function buildBird(): AnimatedModel {
  const body = new VoxelSet();
  body.box(-1, 0, -2, 2, 2, 4, 0x8a6a4a);
  body.box(-1, 2, 1, 2, 2, 2, 0x9a7a5a); // head
  body.set(0, 3, 3, 0xe0a030); // beak
  body.set(-1, 3, 2, pal.eye);
  body.set(1, 3, 2, pal.eye);
  const wingR = new VoxelSet();
  wingR.box(1, 1, -1, 1, 1, 3, 0x6a4a2a);
  const wingL = new VoxelSet();
  wingL.box(-2, 1, -1, 1, 1, 3, 0x6a4a2a);
  const flap: AnimationClip = {
    name: 'walk',
    duration: 0.4,
    loop: true,
    tracks: {
      wingR: [kf(0, [0, 0, -0.6]), kf(0.5, [0, 0, 0.6]), kf(1, [0, 0, -0.6])],
      wingL: [kf(0, [0, 0, 0.6]), kf(0.5, [0, 0, -0.6]), kf(1, [0, 0, 0.6])],
    },
  };
  return {
    model: {
      id: 'creature.bird',
      scale: 1 / 18,
      parts: [
        part('torso', [0, 0, 0], body),
        part('wingR', [1, 1, 0], wingR),
        part('wingL', [-1, 1, 0], wingL),
      ],
    },
    clips: { idle: { name: 'idle', duration: 2, loop: true, tracks: {} }, walk: flap, run: flap },
  };
}

function buildFish(): AnimatedModel {
  const body = new VoxelSet();
  for (let z = 0; z < 6; z++) {
    const r = z < 3 ? 1 : 0;
    body.box(-r, 1 - r, z, 1 + r * 2, 1 + r * 2, 1, 0x6aa0c0);
  }
  body.set(0, 1, 5, pal.eye);
  const tail = new VoxelSet();
  tail.box(0, 0, -2, 1, 3, 2, 0x5a90b0);
  return {
    model: {
      id: 'creature.fish',
      scale: 1 / 14,
      parts: [part('torso', [0, 0, 0], body), part('tail', [0, 1, 0], tail)],
    },
    clips: {
      idle: {
        name: 'idle',
        duration: 1,
        loop: true,
        tracks: { tail: [kf(0, [0, 0.5, 0]), kf(0.5, [0, -0.5, 0]), kf(1, [0, 0.5, 0])] },
      },
      walk: {
        name: 'walk',
        duration: 0.6,
        loop: true,
        tracks: { tail: [kf(0, [0, 0.7, 0]), kf(0.5, [0, -0.7, 0]), kf(1, [0, 0.7, 0])] },
      },
    },
  };
}

export type CreatureKind = 'deer' | 'direStag' | 'rabbit' | 'bird' | 'fish';

let cache: Map<CreatureKind, AnimatedModel> | null = null;

function buildAll(): Map<CreatureKind, AnimatedModel> {
  const m = new Map<CreatureKind, AnimatedModel>();
  m.set(
    'deer',
    buildQuadruped('creature.deer', {
      body: 0xb98a5a,
      belly: 0xe0cba8,
      leg: 0x6a4a2a,
      bodyLen: 9,
      bodyW: 4,
      bodyH: 4,
      legH: 6,
      scale: 1 / 12,
      antlers: pal.woodDark,
    }),
  );
  m.set(
    'direStag',
    buildQuadruped('creature.direStag', {
      body: 0x6a4a34,
      belly: 0x9a7a5a,
      leg: 0x3a2a1a,
      bodyLen: 12,
      bodyW: 5,
      bodyH: 5,
      legH: 8,
      scale: 1 / 10,
      antlers: 0x2a1a10,
    }),
  );
  m.set('rabbit', buildRabbit());
  m.set('bird', buildBird());
  m.set('fish', buildFish());
  return m;
}

export function buildCreature(kind: CreatureKind): AnimatedModel {
  if (!cache) cache = buildAll();
  return cache.get(kind)!;
}
