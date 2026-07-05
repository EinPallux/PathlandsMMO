import { SKIN_TONES, HAIR_COLORS } from '../palette.js';

/** Character-creation appearance selection (skin/hair palette indices). */
export interface Appearance {
  skin: number;
  hair: number;
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 0, hair: 1 };

export function skinColor(a: Appearance): number {
  return SKIN_TONES[a.skin % SKIN_TONES.length]!;
}

export function hairColor(a: Appearance): number {
  return HAIR_COLORS[a.hair % HAIR_COLORS.length]!;
}
