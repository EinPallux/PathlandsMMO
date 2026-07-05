// Enemy voxel models (ART_GUIDE §2, GDD §4). The 10 asset-PNG reconstructions plus
// the new authored archetypes and Hollow bosses, keyed by the `modelId` on each
// EnemyDef (shared/data/enemies.ts). Bipeds reuse the shared humanoid rig + clips;
// beasts use a compact quadruped rig; plants/aberrations get bespoke rigs. Pure.

import type { AnimatedModel, AnimationClip, ClipSet, ModelPart, PartKeyframe } from '../types.js';
import { VoxelSet, part } from '../builder.js';
import { pal } from '../palette.js';
import { buildHumanoid, type HumanoidPalette } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';

const kf = (
  t: number,
  rot?: [number, number, number],
  pos?: [number, number, number],
): PartKeyframe => ({ t, ...(rot ? { rot } : {}), ...(pos ? { pos } : {}) });

// --- Quadruped rig (shared by beasts) ---------------------------------------

function quadClips(): ClipSet {
  const gait = (amp: number, dur: number, name: 'walk' | 'run'): AnimationClip => ({
    name,
    duration: dur,
    loop: true,
    tracks: {
      legFL: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legBR: [kf(0, [amp, 0, 0]), kf(0.5, [-amp, 0, 0]), kf(1, [amp, 0, 0])],
      legFR: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
      legBL: [kf(0, [-amp, 0, 0]), kf(0.5, [amp, 0, 0]), kf(1, [-amp, 0, 0])],
    },
  });
  return {
    idle: {
      name: 'idle',
      duration: 3,
      loop: true,
      tracks: { head: [kf(0, [0, 0, 0]), kf(0.5, [0.12, 0.08, 0]), kf(1, [0, 0, 0])] },
    },
    walk: gait(0.6, 0.6, 'walk'),
    run: gait(1.0, 0.42, 'run'),
    attack: {
      name: 'attack',
      duration: 0.5,
      loop: false,
      tracks: {
        head: [kf(0, [0, 0, 0]), kf(0.3, [-0.6, 0, 0]), kf(0.5, [0.4, 0, 0]), kf(1, [0, 0, 0])],
        torso: [
          kf(0, undefined, [0, 0, 0]),
          kf(0.3, undefined, [0, 0, 1]),
          kf(1, undefined, [0, 0, 0]),
        ],
      },
    },
    hit: {
      name: 'hit',
      duration: 0.3,
      loop: false,
      tracks: { torso: [kf(0, [0, 0, 0]), kf(0.3, [0.3, 0, 0]), kf(1, [0, 0, 0])] },
    },
    death: {
      name: 'death',
      duration: 0.8,
      loop: false,
      tracks: {
        torso: [kf(0, [0, 0, 0], [0, 0, 0]), kf(1, [0, 0, 1.5], [0, -3, 0])],
        head: [kf(0, [0, 0, 0]), kf(1, [0, 0, 1.2])],
      },
    },
  };
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
  snout?: number;
  fang?: number;
  spikes?: number;
  emissive?: number[];
}

function buildQuad(id: string, o: QuadOpts): AnimatedModel {
  const halfW = Math.floor(o.bodyW / 2);
  const y0 = o.legH;
  const torso = new VoxelSet();
  torso.box(-halfW, y0, -o.bodyLen + 2, o.bodyW, o.bodyH, o.bodyLen, o.body);
  torso.box(-halfW, y0, -o.bodyLen + 2, o.bodyW, 1, o.bodyLen, o.belly);
  if (o.spikes !== undefined) {
    for (let z = -o.bodyLen + 3; z < 2; z += 2) torso.set(0, y0 + o.bodyH, z, o.spikes);
  }
  const parts: ModelPart[] = [part('torso', [0, y0, 0], torso)];

  const head = new VoxelSet();
  const hy = y0 + o.bodyH;
  head.box(-halfW + 1, y0 + 1, 3, o.bodyW - 2, o.bodyH, 3, o.body); // neck
  head.box(-halfW + 1, hy, 5, o.bodyW - 2, 3, 4, o.body); // head
  if (o.snout !== undefined) head.box(-halfW + 1, hy, 8, o.bodyW - 2, 2, 2, o.snout);
  head.set(-halfW + 1, hy + 2, 8, pal.eye);
  head.set(halfW - 1, hy + 2, 8, pal.eye);
  if (o.fang !== undefined) {
    head.set(-halfW + 1, hy - 1, 9, o.fang);
    head.set(halfW - 1, hy - 1, 9, o.fang);
  }
  parts.push(part('head', [0, hy, 3], head));

  const tail = new VoxelSet();
  tail.box(-1, y0 + o.bodyH - 2, -o.bodyLen + 1, 2, 2, 2, o.body);
  parts.push(part('tail', [0, y0 + o.bodyH, -o.bodyLen + 2], tail));

  const legX = halfW - 1;
  const mkLeg = (name: string, x: number, z: number): void => {
    const s = new VoxelSet();
    s.box(x, 0, z, 1, o.legH, 1, o.leg);
    parts.push(part(name, [x, o.legH, z], s));
  };
  mkLeg('legFR', legX, 3);
  mkLeg('legFL', -legX, 3);
  mkLeg('legBR', legX, -o.bodyLen + 3);
  mkLeg('legBL', -legX, -o.bodyLen + 3);

  return {
    model: { id, scale: o.scale, parts, ...(o.emissive ? { emissive: o.emissive } : {}) },
    clips: quadClips(),
  };
}

// --- Humanoid enemies (reuse the shared rig + clips) ------------------------

function humanoidEnemy(
  id: string,
  p: HumanoidPalette,
  scale: number,
  opts: {
    hair?: boolean;
    robe?: boolean;
    robeColor?: number;
    extras?: ModelPart[];
    emissive?: number[];
  } = {},
): AnimatedModel {
  const parts = buildHumanoid(p, { hair: opts.hair, robe: opts.robe, robeColor: opts.robeColor });
  if (opts.extras) parts.push(...opts.extras);
  return {
    model: { id, scale, parts, ...(opts.emissive ? { emissive: opts.emissive } : {}) },
    clips: HUMANOID_CLIPS,
  };
}

function club(color: number, head: number = pal.stone): ModelPart {
  const s = new VoxelSet();
  s.box(3, 2, 0, 1, 9, 1, color); // haft
  s.box(2, 10, -1, 3, 3, 3, head); // head
  return part('weaponMain', [3, 18, 0], s);
}

function crudeBlade(color: number): ModelPart {
  const s = new VoxelSet();
  s.box(3, 1, 0, 1, 8, 1, color);
  s.box(2, 8, 0, 3, 1, 1, pal.ironDark);
  s.box(3, 9, 0, 1, 2, 1, pal.leather);
  return part('weaponMain', [3, 18, 0], s);
}

function crudeBow(): ModelPart {
  const s = new VoxelSet();
  s.box(-5, 3, 0, 1, 14, 1, pal.woodDark);
  for (let y = 4; y <= 15; y++) s.set(-4, y, 1, pal.bone);
  return part('weaponOff', [-4, 18, 0], s);
}

// --- Bespoke rigs -----------------------------------------------------------

function buildSpriggan(id: string): AnimatedModel {
  // Thin woody stalk with a mushroom cap head and two leafy arms.
  const stalk = new VoxelSet();
  stalk.box(-1, 0, -1, 2, 12, 2, pal.woodDark);
  const capColor = 0x8b3a62; // venom purple-red
  const head = new VoxelSet();
  head.box(-3, 12, -3, 6, 2, 6, capColor); // cap underside
  head.box(-4, 14, -4, 8, 2, 8, capColor); // cap top
  head.set(-4, 14, -1, 0xd7b0c0); // spots
  head.set(3, 15, 1, 0xd7b0c0);
  head.set(-1, 12, 3, pal.eye);
  head.set(1, 12, 3, pal.eye);
  const armR = new VoxelSet();
  armR.box(2, 7, -1, 2, 2, 2, pal.rangerGreen);
  armR.box(4, 7, -1, 2, 1, 2, 0x6fa84e);
  const armL = armR.mirroredX();
  return {
    model: {
      id,
      scale: 1 / 15,
      parts: [
        part('torso', [0, 0, 0], stalk),
        part('head', [0, 12, 0], head),
        part('armR', [2, 8, 0], armR),
        part('armL', [-3, 8, 0], armL),
      ],
    },
    clips: {
      idle: {
        name: 'idle',
        duration: 2.4,
        loop: true,
        tracks: {
          head: [kf(0, [0, 0, 0]), kf(0.5, [0, 0.15, 0.06]), kf(1, [0, 0, 0])],
          armR: [kf(0, [0, 0, -0.1]), kf(0.5, [0.15, 0, -0.1]), kf(1, [0, 0, -0.1])],
        },
      },
      walk: {
        name: 'walk',
        duration: 0.9,
        loop: true,
        tracks: {
          torso: [kf(0, [0.1, 0, 0]), kf(0.5, [-0.1, 0, 0]), kf(1, [0.1, 0, 0])],
        },
      },
      attack: {
        name: 'attack',
        duration: 0.5,
        loop: false,
        tracks: {
          armR: [kf(0, [0, 0, 0]), kf(0.3, [-1.4, 0, 0]), kf(1, [0, 0, 0])],
        },
      },
      hit: HUMANOID_CLIPS.hit!,
      death: {
        name: 'death',
        duration: 0.8,
        loop: false,
        tracks: {
          torso: [kf(0, [0, 0, 0], [0, 0, 0]), kf(1, [0, 0, 1.5], [0, -6, 0])],
        },
      },
    },
  };
}

function buildTreant(id: string): AnimatedModel {
  // Tall hollow trunk with branch arms, root feet, blight moss (emissive).
  const trunk = new VoxelSet();
  trunk.box(-3, 0, -3, 6, 20, 6, pal.woodDark);
  trunk.box(-2, 4, -3, 4, 3, 1, 0x2a1a10); // hollow face cavity
  trunk.set(-2, 14, 3, 0xffb64a); // glowing eyes in the bark
  trunk.set(1, 14, 3, 0xffb64a);
  for (const [x, y, z] of [
    [-3, 8, 2],
    [3, 12, -2],
    [-3, 16, -1],
    [2, 6, 3],
  ] as const) {
    trunk.set(x, y, z, pal.blight); // blight moss patches
  }
  const armR = new VoxelSet();
  armR.box(3, 12, -1, 2, 8, 2, pal.woodOak); // branch reaching up/out
  armR.box(5, 18, -1, 2, 2, 2, pal.rangerGreen); // leaf cluster
  const armL = armR.mirroredX();
  const legR = new VoxelSet();
  legR.box(0, 0, -2, 3, 4, 4, 0x3a2a18);
  return {
    model: {
      id,
      scale: 1 / 11,
      emissive: [0xffb64a, pal.blight],
      parts: [
        part('torso', [0, 4, 0], trunk),
        part('armR', [3, 18, 0], armR),
        part('armL', [-4, 18, 0], armL),
        part('legR', [1, 4, 0], legR),
        part('legL', [-3, 4, 0], legR.mirroredX()),
      ],
    },
    clips: {
      idle: {
        name: 'idle',
        duration: 3.2,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.3, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
          armR: [kf(0, [0, 0, -0.08]), kf(0.5, [0.12, 0, -0.08]), kf(1, [0, 0, -0.08])],
        },
      },
      walk: {
        name: 'walk',
        duration: 1.1,
        loop: true,
        tracks: {
          legR: [kf(0, [0.35, 0, 0]), kf(0.5, [-0.35, 0, 0]), kf(1, [0.35, 0, 0])],
          legL: [kf(0, [-0.35, 0, 0]), kf(0.5, [0.35, 0, 0]), kf(1, [-0.35, 0, 0])],
        },
      },
      attack: {
        name: 'attack',
        duration: 0.7,
        loop: false,
        tracks: {
          armR: [kf(0, [0, 0, 0]), kf(0.35, [-1.6, 0, 0]), kf(0.6, [0.6, 0, 0]), kf(1, [0, 0, 0])],
        },
      },
      hit: HUMANOID_CLIPS.hit!,
      death: HUMANOID_CLIPS.death!,
    },
  };
}

function buildGrub(id: string): AnimatedModel {
  // Low segmented worm with plated jaws.
  const body = new VoxelSet();
  for (let z = 0; z < 5; z++) {
    const r = z === 0 ? 2 : z < 4 ? 2 : 1;
    body.box(-r, 0, z * 2 - 6, r * 2 + 1, r === 1 ? 2 : 3, 2, z % 2 === 0 ? 0xb9a07a : 0xa08a66);
  }
  body.set(-2, 2, 4, pal.eye);
  body.set(2, 2, 4, pal.eye);
  const jaw = new VoxelSet();
  jaw.box(-2, 0, 4, 1, 2, 2, pal.stone); // mineral jaws
  jaw.box(2, 0, 4, 1, 2, 2, pal.stone);
  return {
    model: {
      id,
      scale: 1 / 12,
      parts: [part('torso', [0, 0, 0], body), part('head', [0, 1, 3], jaw)],
    },
    clips: {
      idle: {
        name: 'idle',
        duration: 2,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.5, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      walk: {
        name: 'walk',
        duration: 0.7,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.7, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      attack: {
        name: 'attack',
        duration: 0.4,
        loop: false,
        tracks: {
          head: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.3, undefined, [0, 0, 1.5]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      hit: HUMANOID_CLIPS.hit!,
      death: {
        name: 'death',
        duration: 0.7,
        loop: false,
        tracks: {
          torso: [kf(0, [0, 0, 0]), kf(1, [1.4, 0, 0])],
        },
      },
    },
  };
}

function buildSlime(id: string): AnimatedModel {
  const body = new VoxelSet();
  body.box(-3, 0, -3, 6, 5, 6, 0x5fae4e);
  body.box(-2, 5, -2, 4, 1, 4, 0x6fbe5e); // rounded top
  body.paint((v) => v.y === 0, 0x4a8a3a);
  body.set(-1, 3, 3, pal.eye);
  body.set(1, 3, 3, pal.eye);
  return {
    model: { id, scale: 1 / 13, parts: [part('torso', [0, 0, 0], body)] },
    clips: {
      idle: {
        name: 'idle',
        duration: 1.4,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.5, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      walk: {
        name: 'walk',
        duration: 0.7,
        loop: true,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.5, undefined, [0, 0.8, 0]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      attack: {
        name: 'attack',
        duration: 0.4,
        loop: false,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.3, undefined, [0, 0, 1]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      hit: HUMANOID_CLIPS.hit!,
      death: {
        name: 'death',
        duration: 0.6,
        loop: false,
        tracks: {
          torso: [kf(0, undefined, [0, 0, 0]), kf(1, undefined, [0, -3, 0])],
        },
      },
    },
  };
}

function buildBat(id: string): AnimatedModel {
  const body = new VoxelSet();
  body.box(-1, 0, -2, 2, 3, 3, 0x4a3a4a);
  body.box(-1, 3, 0, 2, 2, 2, 0x5a4a5a); // head
  body.set(-1, 4, 2, 0xff5a5a);
  body.set(1, 4, 2, 0xff5a5a);
  body.set(-1, 5, 0, 0x2a1a2a); // ears
  body.set(1, 5, 0, 0x2a1a2a);
  const wingR = new VoxelSet();
  wingR.box(1, 1, -1, 4, 1, 3, 0x3a2a3a);
  const wingL = wingR.mirroredX();
  const flap: AnimationClip = {
    name: 'walk',
    duration: 0.28,
    loop: true,
    tracks: {
      wingR: [kf(0, [0, 0, -0.9]), kf(0.5, [0, 0, 0.5]), kf(1, [0, 0, -0.9])],
      wingL: [kf(0, [0, 0, 0.9]), kf(0.5, [0, 0, -0.5]), kf(1, [0, 0, 0.9])],
    },
  };
  return {
    model: {
      id,
      scale: 1 / 16,
      parts: [
        part('torso', [0, 0, 0], body),
        part('wingR', [1, 1, 0], wingR),
        part('wingL', [-1, 1, 0], wingL),
      ],
    },
    clips: {
      idle: flap,
      walk: flap,
      run: flap,
      attack: {
        name: 'attack',
        duration: 0.3,
        loop: false,
        tracks: {
          torso: [
            kf(0, undefined, [0, 0, 0]),
            kf(0.3, undefined, [0, 0, 1]),
            kf(1, undefined, [0, 0, 0]),
          ],
        },
      },
      hit: HUMANOID_CLIPS.hit!,
      death: {
        name: 'death',
        duration: 0.6,
        loop: false,
        tracks: { torso: [kf(0, undefined, [0, 0, 0]), kf(1, undefined, [0, -4, 0])] },
      },
    },
  };
}

// --- Registry ----------------------------------------------------------------

const BUILDERS: Record<string, () => AnimatedModel> = {
  'enemy.thornbackBoar': () =>
    buildQuad('enemy.thornbackBoar', {
      body: 0x6a4a30,
      belly: 0x8a6a48,
      leg: 0x3a2a1a,
      bodyLen: 8,
      bodyW: 5,
      bodyH: 4,
      legH: 4,
      scale: 1 / 13,
      snout: 0x2a1a10,
      fang: pal.bone,
      spikes: 0x2a1a10,
    }),
  'enemy.blightrat': () =>
    buildQuad('enemy.blightrat', {
      body: 0x6a6a5a,
      belly: 0x8a8a76,
      leg: 0x4a4a3a,
      bodyLen: 6,
      bodyW: 3,
      bodyH: 3,
      legH: 3,
      scale: 1 / 16,
      snout: pal.blight,
      emissive: [pal.blight],
    }),
  'enemy.mossfangWolf': () =>
    buildQuad('enemy.mossfangWolf', {
      body: 0x5c5c62,
      belly: 0x7a7a80,
      leg: 0x3a3a40,
      bodyLen: 9,
      bodyW: 4,
      bodyH: 4,
      legH: 6,
      scale: 1 / 13,
      snout: 0x3a3a40,
      fang: pal.blight,
      emissive: [pal.blight],
    }),
  'enemy.crystalbackLizard': () =>
    buildQuad('enemy.crystalbackLizard', {
      body: 0x3a7a6a,
      belly: 0x5a9a8a,
      leg: 0x2a5a4a,
      bodyLen: 9,
      bodyW: 5,
      bodyH: 3,
      legH: 3,
      scale: 1 / 12,
      spikes: pal.crystalRock,
      emissive: [pal.crystalRock],
    }),
  'enemy.bogDrake': () =>
    buildQuad('enemy.bogDrake', {
      body: 0x3a5a3a,
      belly: 0x5a7a4a,
      leg: 0x2a3a24,
      bodyLen: 11,
      bodyW: 5,
      bodyH: 5,
      legH: 6,
      scale: 1 / 11,
      snout: 0x2a3a24,
      fang: pal.bone,
      spikes: 0x24341f,
    }),
  'enemy.caveBat': () => buildBat('enemy.caveBat'),
  'enemy.stonejawGrub': () => buildGrub('enemy.stonejawGrub'),
  'enemy.marshSlime': () => buildSlime('enemy.marshSlime'),
  'enemy.venomcapSpriggan': () => buildSpriggan('enemy.venomcapSpriggan'),
  'enemy.hollowrootTreant': () => buildTreant('enemy.hollowrootTreant'),
  'enemy.briarGoblin': () =>
    humanoidEnemy(
      'enemy.briarGoblin',
      {
        skin: 0x6f9a4a,
        hair: 0x2a3a18,
        torso: 0x5a4632,
        torsoAccent: 0x3a2a1a,
        belt: 0x2a1a10,
        legs: 0x4a3a28,
        boots: 0x2a1a10,
        arms: 0x6f9a4a,
        hands: 0x6f9a4a,
      },
      1 / 20,
      { extras: [club(pal.woodDark)] },
    ),
  'enemy.caveGnoll': () =>
    humanoidEnemy(
      'enemy.caveGnoll',
      {
        skin: 0xa8895a,
        hair: 0x6a4a2a,
        torso: 0x5a4230,
        torsoAccent: 0x3a2a1a,
        belt: 0x2a1a10,
        legs: 0x4a3626,
        boots: 0x2a1a10,
        arms: 0xa8895a,
        hands: 0x8a6a48,
        shoulder: 0x3a2a1a,
      },
      1 / 15,
      { extras: [crudeBlade(pal.iron)] },
    ),
  'enemy.roadBandit': () =>
    humanoidEnemy(
      'enemy.roadBandit',
      {
        skin: 0xe0a878,
        hair: 0x2a1c12,
        torso: 0x4a4038,
        torsoAccent: 0x6e4f33,
        belt: 0x2a1a10,
        legs: 0x3a342c,
        boots: 0x2a1a10,
        arms: 0x4a4038,
        hands: 0xe0a878,
      },
      1 / 16,
      { extras: [crudeBlade(pal.steel)] },
    ),
  'enemy.banditArcher': () =>
    humanoidEnemy(
      'enemy.banditArcher',
      {
        skin: 0xc98a5e,
        hair: 0x3a2a18,
        torso: 0x3f4a38,
        torsoAccent: 0x6e4f33,
        belt: 0x2a1a10,
        legs: 0x33382c,
        boots: 0x2a1a10,
        arms: 0x3f4a38,
        hands: 0xc98a5e,
      },
      1 / 16,
      { extras: [crudeBow()] },
    ),
  'enemy.ironhideTroll': () =>
    humanoidEnemy(
      'enemy.ironhideTroll',
      {
        skin: 0x5a6a52,
        hair: 0x2a3a28,
        torso: 0x4a5442,
        torsoAccent: 0x6e4f33,
        belt: 0x3a2a1a,
        legs: 0x44503c,
        boots: 0x2a1a10,
        arms: 0x5a6a52,
        hands: 0x4a5a44,
        shoulder: 0x3a4a34,
      },
      1 / 11,
      { extras: [club(pal.woodOak, pal.rock)] },
    ),
  'enemy.drownedDead': () =>
    humanoidEnemy(
      'enemy.drownedDead',
      {
        skin: 0x7a97a0,
        hair: 0x3a4a4a,
        torso: 0x3a4a4a,
        torsoAccent: 0x2a3a3a,
        belt: 0x2a2a2a,
        legs: 0x33403f,
        boots: 0x22292a,
        arms: 0x3a4a4a,
        hands: 0x7a97a0,
      },
      1 / 16,
      { hair: false },
    ),
  'enemy.cryptSkeleton': () =>
    humanoidEnemy(
      'enemy.cryptSkeleton',
      {
        skin: pal.bone,
        hair: pal.bone,
        torso: 0xcfc7ad,
        torsoAccent: 0x9a9078,
        belt: 0x6a6250,
        legs: 0xcfc7ad,
        boots: 0x9a9078,
        arms: pal.bone,
        hands: pal.bone,
      },
      1 / 16,
      { hair: false, extras: [crudeBlade(pal.ironDark)] },
    ),
  'enemy.cryptSentinel': () =>
    humanoidEnemy(
      'enemy.cryptSentinel',
      {
        skin: 0x5a5e6a,
        hair: 0x3a3e48,
        torso: 0x44485a,
        torsoAccent: 0x8fe6f0,
        belt: 0x2a2e38,
        legs: 0x3a3e48,
        boots: 0x2a2e34,
        arms: 0x44485a,
        hands: 0x5a5e6a,
        shoulder: 0x8fe6f0,
      },
      1 / 12,
      { hair: false, emissive: [0x8fe6f0], extras: [crudeBlade(0x8fe6f0)] },
    ),
};

const cache = new Map<string, AnimatedModel>();

/** Whether a modelId has an enemy builder here. */
export function hasEnemyModel(modelId: string): boolean {
  return modelId in BUILDERS;
}

/** Build (and cache) an enemy voxel model by its modelId. */
export function buildEnemyModel(modelId: string): AnimatedModel | null {
  if (cache.has(modelId)) return cache.get(modelId)!;
  const builder = BUILDERS[modelId];
  if (!builder) return null;
  const model = builder();
  cache.set(modelId, model);
  return model;
}

/** All enemy modelIds this module can build. */
export const ENEMY_MODEL_IDS: readonly string[] = Object.keys(BUILDERS);
