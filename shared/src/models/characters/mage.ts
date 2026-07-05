// Mage — blue-and-violet robes, pointed star hat, crystal-tipped staff.
// Authored new for Pathlands in the existing class art style (ART_GUIDE §5;
// no source PNG — the Mage's 2D portrait is rendered from this model in Phase 1).

import type { AnimatedModel } from '../types.js';
import { buildHumanoid, buildStaff, buildPointyHat } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';
import { pal } from '../palette.js';
import { DEFAULT_APPEARANCE, skinColor, hairColor, type Appearance } from './appearance.js';

export function buildMage(app: Appearance = DEFAULT_APPEARANCE): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: skinColor(app),
      hair: hairColor(app),
      torso: pal.mageBlue,
      torsoAccent: pal.mageViolet,
      belt: pal.gold,
      legs: pal.mageViolet,
      boots: pal.mageViolet,
      arms: pal.mageBlue,
      hands: skinColor(app),
    },
    { hair: false, robe: true, robeColor: pal.mageBlue },
  );
  parts.push(buildPointyHat(pal.mageBlue, pal.gold), buildStaff(pal.gemViolet, pal.mageGold));
  return {
    model: { id: 'char.mage', scale: 1 / 16, parts, emissive: [pal.gemViolet] },
    clips: HUMANOID_CLIPS,
  };
}
