// Enemy archetype data (GDD §4, WORLD.md §3/§5). Each EnemyDef pairs a voxel
// model (built in Part 4) with combat behavior: rank, family, level band, AI radii,
// abilities, and a loot builder. Stats derive from the GDD §4 baselines scaled by
// rank + group size. Pure data + helpers.

import { EnemyRank, enemyMaxHP, enemyDamage } from '../combat/formulas.js';
import type { DamageSchool } from './skills.js';
import { EquipSlot, Rarity } from './items.js';
import type { LootTable } from './loot.js';

export enum EnemyFamily {
  Beast = 'beast',
  Humanoid = 'humanoid',
  Plant = 'plant',
  Elemental = 'elemental',
  Undead = 'undead',
  Aberration = 'aberration',
}

/**
 * One scripted boss beat, fired once when the boss's HP first drops to/below
 * `atHpPct`. Phases are data — the resolver (sim/combat.ts) interprets them, so
 * they stay pure and the Phase-6 server runs them unchanged. Solo-tuned; the
 * `summon` count scales up by one per extra nearby ally (GDD §4 group scaling).
 */
export interface BossPhase {
  /** Trigger threshold as a fraction of max HP (1 = on engage). */
  atHpPct: number;
  /** Spawn adds: `count` of `enemyId` around the boss (+1 per extra nearby ally). */
  summon?: { enemyId: string; count: number };
  /** Enrage: a lasting +fraction damage-dealt buff on the boss. */
  enrage?: number;
  /** Reflective/hardened shield: absorb = this fraction of the boss's max HP. */
  shield?: number;
  /** Barked line surfaced to the UI when the phase fires. */
  say?: string;
}

/** A boss's encounter script (ordered high→low HP). Undefined for non-bosses. */
export interface BossScript {
  phases: BossPhase[];
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Voxel model id (authored in Part 4). */
  modelId: string;
  rank: EnemyRank;
  family: EnemyFamily;
  /** School of the enemy's attacks (physical unless noted). */
  school: DamageSchool;
  /** Typical spawn level band [min, max] (WORLD.md tables). */
  band: [number, number];
  /** Movement speed, m/s. */
  moveSpeed: number;
  /** Aggro radius in metres; 0 = neutral (only fights when attacked). */
  aggroRadius: number;
  /** Max chase distance from spawn before leashing home. */
  leashRadius: number;
  /** Skill ids the enemy may use (empty ⇒ auto-attack only). */
  abilities: string[];
  /** Encounter script for Boss-rank enemies (HP-threshold beats). */
  boss?: BossScript;
  /** Short bestiary blurb (used on journal pages). */
  blurb: string;
}

// Compact authoring helper.
function e(
  id: string,
  name: string,
  family: EnemyFamily,
  band: [number, number],
  opts: Partial<EnemyDef> = {},
): EnemyDef {
  return {
    id,
    name,
    modelId: opts.modelId ?? `enemy.${id}`,
    rank: opts.rank ?? EnemyRank.Normal,
    family,
    school: opts.school ?? 'physical',
    band,
    moveSpeed: opts.moveSpeed ?? 4.2,
    aggroRadius: opts.aggroRadius ?? 12,
    leashRadius: opts.leashRadius ?? 28,
    abilities: opts.abilities ?? [],
    ...(opts.boss ? { boss: opts.boss } : {}),
    blurb: opts.blurb ?? '',
  };
}

// The 10 asset enemies (PNG reconstructions) + new authored archetypes + bosses.
export const ENEMIES: readonly EnemyDef[] = [
  // --- Heartmead Vale / low ---
  e('thornbackBoar', 'Thornback Boar', EnemyFamily.Beast, [1, 6], {
    moveSpeed: 4.6,
    aggroRadius: 8,
    blurb: 'A bristling tusker of the meadows; charges when cornered.',
  }),
  e('blightrat', 'Blightrat', EnemyFamily.Beast, [1, 4], {
    moveSpeed: 4.8,
    aggroRadius: 10,
    blurb: 'Verdigris-sick vermin, quick and cowardly.',
  }),
  // --- Mossfang Weald / goblin ---
  e('briarGoblin', 'Briar Goblin', EnemyFamily.Humanoid, [6, 9], {
    aggroRadius: 14,
    abilities: ['thrownRock'],
    blurb: 'Thorn-armored scavengers of the deep Weald.',
  }),
  e('mossfangWolf', 'Mossfang Wolf', EnemyFamily.Beast, [6, 10], {
    moveSpeed: 5.4,
    aggroRadius: 16,
    blurb: 'Pack hunter with blight-green fangs.',
  }),
  e('venomcapSpriggan', 'Venomcap Spriggan', EnemyFamily.Plant, [8, 12], {
    school: 'nature',
    moveSpeed: 3.6,
    abilities: ['sprayVenom'],
    blurb: 'A walking toadstool that spits nature poison.',
  }),
  e('hollowrootTreant', 'Hollowroot Treant', EnemyFamily.Plant, [10, 14], {
    rank: EnemyRank.Elite,
    school: 'nature',
    moveSpeed: 3.0,
    leashRadius: 34,
    abilities: ['rootSmash'],
    blurb: 'An ancient tree hollowed and animated by the Blight.',
  }),
  e('direStag', 'Dire Stag', EnemyFamily.Beast, [6, 12], {
    modelId: 'creature.direStag',
    rank: EnemyRank.Elite,
    moveSpeed: 5.0,
    aggroRadius: 0, // neutral rare
    blurb: 'A towering neutral stag; provoke it at your peril.',
  }),
  // --- Stonejaw Foothills / gnoll ---
  e('caveGnoll', 'Cave Gnoll', EnemyFamily.Humanoid, [12, 16], {
    aggroRadius: 14,
    abilities: ['cleaveSwipe'],
    blurb: 'Hyena-kin raiders denning in the foothill caves.',
  }),
  e('stonejawGrub', 'Stonejaw Grub', EnemyFamily.Aberration, [12, 16], {
    moveSpeed: 3.2,
    aggroRadius: 9,
    blurb: 'A rock-chewing grub with mineral-plated jaws.',
  }),
  e('caveBat', 'Cave Bat', EnemyFamily.Beast, [12, 16], {
    moveSpeed: 5.6,
    aggroRadius: 12,
    blurb: 'Screeching swarms that boil out of the dark.',
  }),
  // --- Roads / bandits ---
  e('roadBandit', 'Road Bandit', EnemyFamily.Humanoid, [4, 10], {
    aggroRadius: 13,
    abilities: ['cleaveSwipe'],
    blurb: 'Desperate folk turned brigand on the Old Road.',
  }),
  e('banditArcher', 'Bandit Archer', EnemyFamily.Humanoid, [6, 12], {
    moveSpeed: 4.0,
    aggroRadius: 18,
    abilities: ['aimedPotshot'],
    blurb: 'Keeps her distance and looses from cover.',
  }),
  e('marshSlime', 'Marsh Slime', EnemyFamily.Aberration, [3, 8], {
    school: 'nature',
    moveSpeed: 2.6,
    aggroRadius: 7,
    blurb: 'A quivering blob that splits when struck.',
  }),
  // --- Glimmerpeaks ---
  e('crystalbackLizard', 'Crystalback Lizard', EnemyFamily.Beast, [18, 24], {
    moveSpeed: 4.4,
    aggroRadius: 12,
    abilities: ['crystalSpit'],
    blurb: 'Its dorsal crystals refract the mountain light.',
  }),
  // --- Trollmoor Highlands ---
  e('ironhideTroll', 'Ironhide Troll', EnemyFamily.Humanoid, [24, 30], {
    rank: EnemyRank.Elite,
    moveSpeed: 4.0,
    leashRadius: 36,
    abilities: ['boulderThrow', 'regenerate'],
    blurb: 'Slow, immense, and it knits its wounds shut.',
  }),
  e('bogDrake', 'Bog Drake', EnemyFamily.Beast, [24, 28], {
    school: 'nature',
    moveSpeed: 5.0,
    aggroRadius: 16,
    abilities: ['venomBreath'],
    blurb: 'A moor-dwelling wyrm with a poisonous breath.',
  }),
  // --- Sunlit Coast / Sunken Crypt ---
  e('drownedDead', 'Drowned Dead', EnemyFamily.Undead, [28, 30], {
    school: 'shadow',
    moveSpeed: 3.6,
    aggroRadius: 12,
    blurb: 'Sailors the crypt-tide never let rest.',
  }),
  e('cryptSkeleton', 'Crypt Skeleton', EnemyFamily.Undead, [22, 28], {
    aggroRadius: 12,
    abilities: ['boneSlash'],
    blurb: 'Rattling guardians of the drowned tomb.',
  }),
  e('cryptSentinel', 'Crypt Sentinel', EnemyFamily.Undead, [29, 30], {
    rank: EnemyRank.Elite,
    school: 'shadow',
    moveSpeed: 3.8,
    leashRadius: 30,
    abilities: ['shadowCleave'],
    blurb: 'A Waymaker construct still walking its dead post.',
  }),

  // --- Hollow bosses (GDD §4 Boss rank; WORLD.md §3, names reconciled) ---
  // Briarhollow Warrens (8–12): summons goblin adds at 66% / 33% HP.
  e('bossBriarking', 'Warlord Bramblegut', EnemyFamily.Humanoid, [12, 12], {
    modelId: 'enemy.briarGoblin',
    rank: EnemyRank.Boss,
    aggroRadius: 18,
    leashRadius: 40,
    abilities: ['thrownRock', 'rootSmash'],
    boss: {
      phases: [
        {
          atHpPct: 0.66,
          summon: { enemyId: 'briarGoblin', count: 1 },
          say: 'Bramblegut bellows — the warren answers!',
        },
        {
          atHpPct: 0.33,
          summon: { enemyId: 'briarGoblin', count: 1 },
          enrage: 0.2,
          say: 'Bramblegut froths with rage!',
        },
      ],
    },
    blurb: 'Warlord of Briarhollow Warrens; calls his warren to swarm intruders.',
  }),
  // Gloomroot Cavern (14–18): a giant blighted grub that erupts blight-spawn.
  e('bossGloommother', 'Mother Gnarlmaw', EnemyFamily.Aberration, [18, 18], {
    modelId: 'enemy.stonejawGrub',
    rank: EnemyRank.Boss,
    school: 'nature',
    moveSpeed: 3.2,
    aggroRadius: 18,
    leashRadius: 40,
    abilities: ['sprayVenom'],
    boss: {
      phases: [
        {
          atHpPct: 0.66,
          summon: { enemyId: 'marshSlime', count: 1 },
          say: 'Mother Gnarlmaw burrows and erupts — blight-spawn spill out!',
        },
        {
          atHpPct: 0.33,
          summon: { enemyId: 'marshSlime', count: 1 },
          enrage: 0.25,
          say: 'The blight boils — Gnarlmaw swells with venom!',
        },
      ],
    },
    blurb: 'A vast blighted grub whose eruptions flood the caverns with spawn.',
  }),
  // The Crystal Deeps (18–22): reflective-shield phases keyed to the pylons.
  e('bossCrystalWyrm', 'Prismhide', EnemyFamily.Beast, [22, 22], {
    modelId: 'enemy.crystalbackLizard',
    rank: EnemyRank.Boss,
    aggroRadius: 20,
    leashRadius: 42,
    abilities: ['crystalSpit'],
    boss: {
      phases: [
        { atHpPct: 0.66, shield: 0.12, say: 'Prismhide raises a reflective crystal shield!' },
        {
          atHpPct: 0.33,
          shield: 0.12,
          enrage: 0.2,
          say: 'The pylons blaze — Prismhide hardens and rages!',
        },
      ],
    },
    blurb: 'The ancient Crystalback at the heart of the Deeps; its shell throws back light.',
  }),
  // Ironvein Halls (24–28): forge-flame floor ramps the troll-lord's damage.
  e('bossIronvein', 'Forgewarden Urzul', EnemyFamily.Humanoid, [28, 28], {
    modelId: 'enemy.ironhideTroll',
    rank: EnemyRank.Boss,
    aggroRadius: 20,
    leashRadius: 44,
    abilities: ['boulderThrow', 'regenerate'],
    boss: {
      phases: [
        { atHpPct: 0.6, enrage: 0.2, say: 'Forgewarden Urzul stokes the forge-flame!' },
        { atHpPct: 0.25, enrage: 0.25, say: 'The vault floor runs with fire — Urzul roars!' },
      ],
    },
    blurb: 'Troll-lord of the Ironvein forge-vault, wielding a stolen Waymaker hammer.',
  }),
  // The Sunken Crypt (28–30): the three-phase story finale, blight adds + enrage.
  e('bossLastWaymaker', 'The Last Waymaker', EnemyFamily.Undead, [30, 30], {
    modelId: 'enemy.cryptSentinel',
    rank: EnemyRank.Boss,
    school: 'shadow',
    aggroRadius: 22,
    leashRadius: 50,
    abilities: ['shadowCleave'],
    boss: {
      phases: [
        {
          atHpPct: 0.66,
          summon: { enemyId: 'cryptSkeleton', count: 1 },
          say: 'The Last Waymaker raises the drowned dead.',
        },
        {
          atHpPct: 0.33,
          summon: { enemyId: 'cryptSkeleton', count: 1 },
          enrage: 0.25,
          say: 'Blight floods the tomb — the Waymaker makes its last stand!',
        },
      ],
    },
    blurb: 'The final Waymaker, bound to its flooded tomb — the three-phase story finale.',
  }),
];

const ENEMY_BY_ID = new Map<string, EnemyDef>(ENEMIES.map((x) => [x.id, x]));

export function enemyById(id: string): EnemyDef | undefined {
  return ENEMY_BY_ID.get(id);
}

/** Enemies whose level band overlaps [minLvl, maxLvl] (for building spawn tables). */
export function enemiesForBand(minLvl: number, maxLvl: number): EnemyDef[] {
  return ENEMIES.filter((x) => x.band[0] <= maxLvl && x.band[1] >= minLvl);
}

export interface EnemyStats {
  maxHP: number;
  /** Damage per swing (GDD §4 baseline is a 2 s swing). */
  damage: number;
  rank: EnemyRank;
}

/** Combat stats for an enemy at a level and nearby-player count (GDD §4). */
export function enemyStatsFor(def: EnemyDef, level: number, nearbyPlayers = 1): EnemyStats {
  return {
    maxHP: enemyMaxHP(level, def.rank, nearbyPlayers),
    damage: enemyDamage(level, def.rank, nearbyPlayers),
    rank: def.rank,
  };
}

/**
 * Build a level-scaled loot table for an enemy. Normal mobs drop a little gold and
 * an occasional item; elites drop better; bosses have a curated table with
 * guaranteed picks and an Epic chance (GDD §6).
 */
export function buildEnemyLootTable(def: EnemyDef, level: number): LootTable {
  const anyArmorSlot = [
    EquipSlot.Head,
    EquipSlot.Chest,
    EquipSlot.Legs,
    EquipSlot.Feet,
    EquipSlot.Hands,
  ];
  const pickSlot = anyArmorSlot[level % anyArmorSlot.length]!;

  if (def.rank === EnemyRank.Boss) {
    return {
      id: `loot.${def.id}`,
      gold: [level * 20, level * 40],
      drops: [
        { chance: 1, generate: { slot: EquipSlot.Trinket, rarity: Rarity.Rare, reqLevel: level } },
        {
          chance: 0.15,
          generate: { slot: EquipSlot.MainHand, rarity: Rarity.Epic, reqLevel: level },
        },
      ],
      pickOne: {
        picks: 2,
        entries: [
          { weight: 3, generate: { slot: pickSlot, rarity: Rarity.Rare, reqLevel: level } },
          {
            weight: 2,
            generate: { slot: EquipSlot.MainHand, rarity: Rarity.Rare, reqLevel: level },
          },
          { weight: 2, generate: { slot: EquipSlot.Amulet, rarity: Rarity.Rare, reqLevel: level } },
        ],
      },
    };
  }

  if (def.rank === EnemyRank.Elite) {
    return {
      id: `loot.${def.id}`,
      gold: [level * 3, level * 8],
      drops: [
        { chance: 0.4, generate: { slot: pickSlot, rarity: Rarity.Uncommon, reqLevel: level } },
        {
          chance: 0.12,
          generate: { slot: EquipSlot.MainHand, rarity: Rarity.Rare, reqLevel: level },
        },
      ],
    };
  }

  return {
    id: `loot.${def.id}`,
    gold: [Math.max(1, level), level * 3],
    drops: [
      { chance: 0.3, generate: { slot: pickSlot, rarity: Rarity.Common, reqLevel: level } },
      {
        chance: 0.08,
        generate: { slot: EquipSlot.MainHand, rarity: Rarity.Uncommon, reqLevel: level },
      },
    ],
  };
}
