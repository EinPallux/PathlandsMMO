// Non-combat NPC models (villagers, guards, vendors) built on the shared humanoid
// rig with palette variations and simple props. Used for settlement ambience.

import type { AnimatedModel } from '../types.js';
import { buildHumanoid, buildSword } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';
import { VoxelSet, part } from '../builder.js';
import { pal } from '../palette.js';
import { SKIN_TONES, HAIR_COLORS } from '../palette.js';

export type NpcKind = 'villager' | 'guard' | 'vendor';

const TUNICS = [0x6b7f4a, 0x8a5a3a, 0x4a6a8a, 0x7a4a5a, 0x9a8a4a];

function villager(seed: number): AnimatedModel {
  const tunic = TUNICS[seed % TUNICS.length]!;
  const parts = buildHumanoid(
    {
      skin: SKIN_TONES[seed % SKIN_TONES.length]!,
      hair: HAIR_COLORS[(seed >> 2) % HAIR_COLORS.length]!,
      torso: tunic,
      torsoAccent: pal.leather,
      belt: pal.leather,
      legs: pal.woodDark,
      boots: pal.leatherDark,
      arms: tunic,
      hands: SKIN_TONES[seed % SKIN_TONES.length]!,
    },
    { hair: true },
  );
  return { model: { id: `npc.villager${seed}`, scale: 1 / 16, parts }, clips: HUMANOID_CLIPS };
}

function guard(): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: SKIN_TONES[1]!,
      hair: HAIR_COLORS[0]!,
      torso: pal.iron,
      torsoAccent: pal.warriorNavy,
      belt: pal.leatherDark,
      legs: pal.ironDark,
      boots: pal.leatherDark,
      arms: pal.ironDark,
      hands: pal.leather,
      shoulder: pal.steel,
    },
    { hair: false },
  );
  // Iron cap.
  const cap = new VoxelSet();
  cap.box(-4, 25, -3, 8, 2, 7, pal.iron);
  cap.box(-4, 24, 3, 8, 3, 1, pal.ironDark);
  parts.push(part('hat', [0, 19, 0], cap));
  // Spear (reuse sword socket, longer shaft).
  const spear = new VoxelSet();
  spear.box(4, 0, 0, 1, 22, 1, pal.woodOak);
  spear.box(4, 22, 0, 1, 2, 1, pal.steel);
  parts.push(part('weaponMain', [3, 18, 0], spear));
  return { model: { id: 'npc.guard', scale: 1 / 16, parts }, clips: HUMANOID_CLIPS };
}

function vendor(): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: SKIN_TONES[2]!,
      hair: HAIR_COLORS[3]!,
      torso: pal.plaster,
      torsoAccent: pal.leather,
      belt: pal.leatherDark,
      legs: pal.woodDark,
      boots: pal.leatherDark,
      arms: pal.plaster,
      hands: SKIN_TONES[2]!,
    },
    { hair: true },
  );
  // Leather apron on the front.
  const apron = new VoxelSet();
  apron.box(-3, 2, 2, 6, 9, 1, pal.leather);
  parts.push(part('quiver', [0, 9, 0], apron));
  return { model: { id: 'npc.vendor', scale: 1 / 16, parts }, clips: HUMANOID_CLIPS };
}

export function buildNpc(kind: NpcKind, seed = 0): AnimatedModel {
  switch (kind) {
    case 'guard':
      return guard();
    case 'vendor':
      return vendor();
    default:
      return villager(seed);
  }
}

// buildSword re-exported so callers can arm special NPCs if needed later.
export { buildSword };
