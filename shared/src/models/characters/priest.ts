// Priest — white-and-gold robes, hooded, bearing a gem-topped staff.
// Reconstructed from public/assets/classes/Priest Class.png (ART_GUIDE §5).

import type { AnimatedModel } from '../types.js';
import { buildHumanoid, buildStaff, buildHood } from '../humanoid.js';
import { HUMANOID_CLIPS } from '../rig.js';
import { pal } from '../palette.js';
import { DEFAULT_APPEARANCE, skinColor, hairColor, type Appearance } from './appearance.js';

export function buildPriest(app: Appearance = DEFAULT_APPEARANCE): AnimatedModel {
  const parts = buildHumanoid(
    {
      skin: skinColor(app),
      hair: hairColor(app),
      torso: pal.priestWhite,
      torsoAccent: pal.priestGold,
      belt: pal.priestGold,
      legs: pal.priestWhite,
      boots: pal.priestGold,
      arms: pal.priestWhite,
      hands: skinColor(app),
    },
    { hair: false, robe: true, robeColor: pal.priestWhite },
  );
  parts.push(buildHood(pal.priestWhite, pal.priestGold), buildStaff(pal.gemBlue, pal.gold));
  return {
    model: { id: 'char.priest', scale: 1 / 16, parts, emissive: [pal.gemBlue] },
    clips: HUMANOID_CLIPS,
  };
}
