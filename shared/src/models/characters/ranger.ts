// Ranger — forest greens and leather, hooded, with a longbow and back quiver.
// Reconstructed from public/assets/classes/Ranger Class.png (ART_GUIDE §5).

import type { AnimatedModel } from '../types.js';
import { buildHumanoid, buildBow, buildQuiver, buildHood } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';
import { pal } from '../palette.js';
import { DEFAULT_APPEARANCE, skinColor, hairColor, type Appearance } from './appearance.js';

export function buildRanger(app: Appearance = DEFAULT_APPEARANCE): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: skinColor(app),
      hair: hairColor(app),
      torso: pal.rangerGreen,
      torsoAccent: pal.leatherDark,
      belt: pal.leather,
      legs: pal.leather,
      boots: pal.leatherDark,
      arms: pal.rangerGreen,
      hands: pal.leather,
    },
    { hair: false },
  );
  parts.push(buildHood(pal.rangerGreen, pal.leatherDark), buildBow(pal.woodOak), buildQuiver());
  return {
    model: { id: 'char.ranger', scale: 1 / 16, parts },
    clips: HUMANOID_CLIPS,
  };
}
