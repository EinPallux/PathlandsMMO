// Single source of truth for the 2D render assets in public/assets (used directly
// as UI art per ART_GUIDE §5). The misspelled "Medival" filenames are quarantined
// here — reference these constants, never the raw paths.

import { CharacterClass } from '@pathlands/shared';

const base = 'assets';

export const CLASS_PORTRAITS: Record<CharacterClass, string> = {
  [CharacterClass.Warrior]: `${base}/classes/Warrior Class.png`,
  [CharacterClass.Ranger]: `${base}/classes/Ranger Class.png`,
  [CharacterClass.Priest]: `${base}/classes/Priest Class.png`,
  // Mage has no source render — the character-select card renders the live model.
  [CharacterClass.Mage]: '',
};

export const BUILDING_ART = {
  house1: `${base}/buildings/Medival House 1.png`,
  house2: `${base}/buildings/Medival House 2.png`,
  house3: `${base}/buildings/Medival House 3.png`,
  house4: `${base}/buildings/Medival House 4.png`,
  bigHouse1: `${base}/buildings/Big Medival House 1.png`,
  bigHouse2: `${base}/buildings/Big Medival House 2.png`,
  inn: `${base}/buildings/Medival Inn.png`,
  church: `${base}/buildings/Medival Church.png`,
  stable: `${base}/buildings/Medival Stable.png`,
  bathhouse: `${base}/buildings/Medival Bathhouse.png`,
  workerHut: `${base}/buildings/Medival Worker Hut.png`,
  fountain: `${base}/buildings/Medival Water Fountain.png`,
} as const;

export const ENEMY_ART = {
  briarGoblin: `${base}/enemies/Briar Goblin.png`,
  mossfangWolf: `${base}/enemies/Mossfang Wolf.png`,
  thornbackBoar: `${base}/enemies/Thornback Boar.png`,
  venomcapSpriggan: `${base}/enemies/Venomcap Spriggan.png`,
  hollowrootTreant: `${base}/enemies/Hollowroot Treant.png`,
  direStag: `${base}/enemies/Dire Stag.png`,
  caveGnoll: `${base}/enemies/Cave Gnoll.png`,
  stonejawGrub: `${base}/enemies/Stonejaw Grub.png`,
  crystalbackLizard: `${base}/enemies/Crystalback Lizard.png`,
  ironhideTroll: `${base}/enemies/Ironhide Troll.png`,
} as const;

export const MOUNT_ART = {
  wolf: `${base}/mounts/Wolf Mount.png`,
} as const;

/** A pleasant splash image for loading screens. */
export const LOADING_ART = BUILDING_ART.inn;
