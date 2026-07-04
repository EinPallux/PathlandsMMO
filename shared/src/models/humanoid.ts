// Parametric humanoid builder shared by all playable classes and (later) NPCs.
// Builds the six rig parts (head, torso, armL, armR, legL, legR) plus optional
// weapon/accessory parts, so every class inherits the same proportions and the
// shared HUMANOID_CLIPS animations. Class files supply colours and embellishments.
//
// Local space: x right(+)/left(−), y up (feet at 0), z forward(+)/back(−).
// Symmetric parts are built as the right half and mirrored across x = −0.5.

import type { ModelPart } from './types.js';
import { VoxelSet, part } from './builder.js';
import { pal } from './palette.js';

export interface HumanoidPalette {
  skin: number;
  hair: number;
  torso: number;
  torsoAccent: number;
  belt: number;
  legs: number;
  boots: number;
  arms: number;
  hands: number;
  shoulder?: number;
}

export interface HumanoidOpts {
  /** Show hair on the crown (false when a hat/hood covers it). */
  hair?: boolean;
  /** Render legs as a robe skirt (casters) rather than trousers. */
  robe?: boolean;
  robeColor?: number;
}

const EYE = pal.eye;

/** Build the six core humanoid parts. */
export function buildHumanoid(p: HumanoidPalette, opts: HumanoidOpts = {}): ModelPart[] {
  const showHair = opts.hair ?? true;

  // --- Legs (right leg authored; left mirrored) ---
  const legR = new VoxelSet();
  legR.box(0, 0, -1, 3, 9, 3, p.legs); // x0..2, y0..8, z-1..1
  legR.box(0, 0, -1, 3, 2, 3, p.boots); // boots y0..1
  if (opts.robe) {
    // Robe hem draping over the legs.
    legR.box(0, 2, -2, 3, 6, 4, opts.robeColor ?? p.torso);
  }
  const legRPart = part('legR', [1, 9, 0], legR);
  const legLPart = part('legL', [-2, 9, 0], legR.mirroredX());

  // --- Torso (right half authored, then symmetrised) ---
  const torso = new VoxelSet();
  torso.box(0, 9, -2, 3, 10, 5, p.torso); // x0..2, y9..18, z-2..2
  torso.box(0, 12, -2, 3, 1, 5, p.belt); // belt at y12
  torso.box(0, 9, 2, 3, 4, 1, p.torsoAccent); // front tabard stripe (lower chest)
  if (p.shoulder !== undefined) {
    torso.box(2, 17, -2, 1, 2, 5, p.shoulder); // shoulder pauldron edge
  }
  if (opts.robe) {
    torso.box(0, 2, -2, 4, 8, 5, opts.robeColor ?? p.torso); // robe skirt flare
    torso.box(0, 9, 2, 3, 9, 1, p.torsoAccent); // longer robe front trim
  }
  // neck
  torso.box(0, 18, -1, 2, 1, 3, p.skin);
  const torsoFull = torso.merge(torso.mirroredX());
  const torsoPart = part('torso', [0, 9, 0], torsoFull);

  // --- Head (right half authored, then symmetrised) ---
  const head = new VoxelSet();
  head.box(0, 19, -3, 4, 8, 7, p.skin); // x0..3, y19..26, z-3..3
  head.set(1, 22, 3, EYE); // eye on front face (mirror adds the other)
  if (showHair) {
    head.box(0, 26, -3, 4, 1, 7, p.hair); // crown
    head.box(0, 23, -3, 4, 3, 1, p.hair); // back of hair
    head.box(3, 20, -3, 1, 6, 7, p.hair); // side sculpt
  }
  const headFull = head.merge(head.mirroredX());
  const headPart = part('head', [0, 19, 0], headFull);

  // --- Arms (right arm authored, left mirrored) ---
  const armR = new VoxelSet();
  armR.box(3, 10, -1, 2, 8, 3, p.arms); // sleeve y10..17
  armR.box(3, 17, -1, 2, 1, 3, p.shoulder ?? p.arms); // shoulder cap
  armR.box(3, 9, -1, 2, 1, 3, p.hands); // hand y9
  const armRPart = part('armR', [3, 18, 0], armR);
  const armLPart = part('armL', [-4, 18, 0], armR.mirroredX());

  return [legRPart, legLPart, torsoPart, headPart, armRPart, armLPart];
}

// --- Weapons & accessories --------------------------------------------------
// weaponMain/weaponOff pivot at the shoulder so they swing with the arm clips.

export function buildSword(bladeColor: number = pal.steel, trim: number = pal.gold): ModelPart {
  const s = new VoxelSet();
  s.box(3, 0, 0, 1, 7, 1, bladeColor); // blade pointing down at the side
  s.box(2, 7, 0, 3, 1, 1, trim); // crossguard
  s.box(3, 8, 0, 1, 3, 1, pal.leather); // grip
  s.set(3, 11, 0, trim); // pommel
  return part('weaponMain', [3, 18, 0], s);
}

export function buildShield(face: number = pal.warriorNavy, trim: number = pal.gold): ModelPart {
  const s = new VoxelSet();
  s.box(-6, 9, 1, 3, 8, 1, face); // plate on the left forearm, facing forward
  s.box(-6, 9, 1, 3, 1, 1, trim);
  s.box(-6, 16, 1, 3, 1, 1, trim);
  s.set(-5, 12, 1, trim); // central boss
  s.set(-5, 13, 1, trim);
  return part('weaponOff', [-4, 18, 0], s);
}

export function buildBow(wood: number = pal.woodOak): ModelPart {
  const s = new VoxelSet();
  s.box(-5, 3, 0, 1, 14, 1, wood); // limb held in the left hand
  s.set(-4, 16, 0, wood);
  s.set(-4, 3, 0, wood);
  for (let y = 4; y <= 15; y++) s.set(-4, y, 1, pal.bone); // string
  return part('weaponOff', [-4, 18, 0], s);
}

export function buildQuiver(): ModelPart {
  const s = new VoxelSet();
  s.box(-2, 12, -3, 4, 7, 2, pal.leatherDark); // on the back
  s.set(-2, 19, -3, pal.bone);
  s.set(0, 19, -3, pal.bone);
  s.set(1, 19, -3, pal.gold);
  return part('quiver', [0, 9, 0], s); // rides with the torso
}

export function buildStaff(gem: number = pal.gemBlue, ring: number = pal.gold): ModelPart {
  const s = new VoxelSet();
  s.box(4, 0, 0, 1, 20, 1, pal.woodOak); // tall shaft in the right hand
  s.box(3, 20, -1, 3, 1, 3, ring); // headpiece ring
  s.box(4, 21, 0, 1, 2, 1, gem); // gem
  s.set(4, 20, 0, gem);
  return part('weaponMain', [3, 18, 0], s);
}

export function buildPointyHat(color: number = pal.mageBlue, band: number = pal.gold): ModelPart {
  const s = new VoxelSet();
  s.box(-5, 26, -5, 10, 1, 11, color); // wide brim
  s.box(-4, 26, -4, 8, 1, 1, band); // band front (mirror completes)
  // Cone narrowing upward.
  const layers: Array<[number, number]> = [
    [27, 4],
    [28, 3],
    [29, 3],
    [30, 2],
    [31, 2],
    [32, 1],
    [33, 1],
  ];
  for (const [y, half] of layers) {
    s.box(-half, y, -half, half * 2, 1, half * 2, color);
  }
  s.set(0, 34, 0, pal.gemViolet); // star tip
  return part('hat', [0, 19, 0], s); // rides with the head
}

export function buildHood(color: number, trim: number): ModelPart {
  const s = new VoxelSet();
  s.box(-4, 24, -4, 9, 4, 9, color); // shell over the crown
  s.box(-4, 24, -4, 9, 1, 9, trim); // lower trim
  s.carve((v) => v.z >= 3 && v.y <= 25); // open the front so the face shows
  return part('hood', [0, 19, 0], s);
}
