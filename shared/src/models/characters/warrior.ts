// Warrior — steel & navy plate with a red tabard, sword, and kite shield.
// Reconstructed from public/assets/classes/Warrior Class.png (ART_GUIDE §5).

import type { AnimatedModel } from '../types.js';
import { buildHumanoid, buildSword, buildShield } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';
import { pal } from '../palette.js';
import { DEFAULT_APPEARANCE, skinColor, hairColor, type Appearance } from './appearance.js';

export function buildWarrior(app: Appearance = DEFAULT_APPEARANCE): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: skinColor(app),
      hair: hairColor(app),
      torso: pal.warriorSteel,
      torsoAccent: pal.warriorRed,
      belt: pal.leather,
      legs: pal.warriorNavy,
      boots: pal.leatherDark,
      arms: pal.warriorNavy,
      hands: pal.ironDark,
      shoulder: pal.steel,
    },
    { hair: true },
  );
  parts.push(buildSword(pal.steel, pal.gold), buildShield(pal.warriorNavy, pal.gold));
  return {
    model: { id: 'char.warrior', scale: 1 / 16, parts },
    clips: HUMANOID_CLIPS,
  };
}
