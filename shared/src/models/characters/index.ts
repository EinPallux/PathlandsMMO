// The four playable classes and their animated voxel models.

import type { AnimatedModel } from '../types.js';
import { buildWarrior } from './warrior.js';
import { buildRanger } from './ranger.js';
import { buildPriest } from './priest.js';
import { buildMage } from './mage.js';
import { DEFAULT_APPEARANCE, type Appearance } from './appearance.js';

export * from './appearance.js';

export enum CharacterClass {
  Warrior = 'warrior',
  Ranger = 'ranger',
  Priest = 'priest',
  Mage = 'mage',
}

export const CHARACTER_CLASSES: readonly CharacterClass[] = [
  CharacterClass.Warrior,
  CharacterClass.Ranger,
  CharacterClass.Priest,
  CharacterClass.Mage,
];

export interface ClassInfo {
  id: CharacterClass;
  name: string;
  /** Short tagline shown on the class-select card. */
  role: string;
  /** public/assets portrait path (used directly as UI art). */
  portrait: string;
}

export const CLASS_INFO: Record<CharacterClass, ClassInfo> = {
  [CharacterClass.Warrior]: {
    id: CharacterClass.Warrior,
    name: 'Warrior',
    role: 'Steel and shield — the front line.',
    portrait: 'assets/classes/Warrior Class.png',
  },
  [CharacterClass.Ranger]: {
    id: CharacterClass.Ranger,
    name: 'Ranger',
    role: 'Bow, beast, and the long path.',
    portrait: 'assets/classes/Ranger Class.png',
  },
  [CharacterClass.Priest]: {
    id: CharacterClass.Priest,
    name: 'Priest',
    role: 'Light that mends and smites.',
    portrait: 'assets/classes/Priest Class.png',
  },
  [CharacterClass.Mage]: {
    id: CharacterClass.Mage,
    name: 'Mage',
    role: 'Frost, fire, and arcane ruin.',
    // No source PNG — portrait is rendered from the in-game model (ART_GUIDE §5).
    portrait: '',
  },
};

/** Build a class's animated model with the given appearance. */
export function buildCharacterModel(
  cls: CharacterClass,
  appearance: Appearance = DEFAULT_APPEARANCE,
): AnimatedModel {
  switch (cls) {
    case CharacterClass.Warrior:
      return buildWarrior(appearance);
    case CharacterClass.Ranger:
      return buildRanger(appearance);
    case CharacterClass.Priest:
      return buildPriest(appearance);
    case CharacterClass.Mage:
      return buildMage(appearance);
  }
}

export { buildWarrior, buildRanger, buildPriest, buildMage };
