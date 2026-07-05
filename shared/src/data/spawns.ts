// World spawn table (WORLD.md §3 zone enemy lists + §6 Hollows). Data-driven: each
// region keeps a target population of one enemy type alive within a radius, and the
// client activates only the regions near the player (sim/spawner.ts does the actual
// spawning). Coordinates are world voxel coords matching settlements.ts / HOLLOWS.
// Pure data — no imports beyond the region type.

import type { SpawnRegion } from '../sim/spawner.js';

/**
 * Every overworld + Hollow spawn region. All ten asset enemies and the authored
 * archetypes appear in their atlas-assigned zones (acceptance criterion 2); each
 * Hollow is stocked with elite packs and its end boss (criterion 3).
 */
export const WORLD_SPAWNS: readonly SpawnRegion[] = [
  // --- Heartmead Vale (1–6): safe, tutorializing meadows around Brookhollow ---
  {
    id: 'valeBoars',
    enemyId: 'thornbackBoar',
    level: [2, 5],
    cx: 1536,
    cz: 1586,
    radius: 26,
    count: 4,
    respawnTicks: 200,
  },
  {
    id: 'valeRats',
    enemyId: 'blightrat',
    level: [1, 3],
    cx: 1492,
    cz: 1556,
    radius: 18,
    count: 3,
    respawnTicks: 200,
  },
  {
    id: 'valeSlimes',
    enemyId: 'marshSlime',
    level: [1, 3],
    cx: 1440,
    cz: 1620,
    radius: 20,
    count: 3,
    respawnTicks: 240,
  },
  {
    id: 'valeGoblinScouts',
    enemyId: 'briarGoblin',
    level: [4, 6],
    cx: 1648,
    cz: 1636,
    radius: 22,
    count: 3,
    respawnTicks: 260,
  },

  // --- The Old Road (4–12): brigands on the eastern road ---
  {
    id: 'roadBandits',
    enemyId: 'roadBandit',
    level: [4, 9],
    cx: 1600,
    cz: 1700,
    radius: 24,
    count: 3,
    respawnTicks: 260,
  },
  {
    id: 'roadArchers',
    enemyId: 'banditArcher',
    level: [6, 10],
    cx: 1660,
    cz: 1748,
    radius: 22,
    count: 2,
    respawnTicks: 300,
  },

  // --- Mossfang Weald (6–12): deep blighted forest, Fernwick / Mossgate / Elder Glade ---
  {
    id: 'wealdWolves',
    enemyId: 'mossfangWolf',
    level: [7, 11],
    cx: 2320,
    cz: 1440,
    radius: 30,
    count: 4,
    respawnTicks: 240,
  },
  {
    id: 'wealdGoblins',
    enemyId: 'briarGoblin',
    level: [6, 10],
    cx: 2180,
    cz: 1620,
    radius: 26,
    count: 4,
    respawnTicks: 240,
  },
  {
    id: 'wealdSpriggans',
    enemyId: 'venomcapSpriggan',
    level: [8, 12],
    cx: 2260,
    cz: 1520,
    radius: 24,
    count: 3,
    respawnTicks: 300,
  },
  {
    id: 'wealdTreants',
    enemyId: 'hollowrootTreant',
    level: [10, 13],
    cx: 2400,
    cz: 1470,
    radius: 26,
    count: 2,
    respawnTicks: 600,
  },
  {
    id: 'wealdDireStag',
    enemyId: 'direStag',
    level: [12, 12],
    cx: 2350,
    cz: 1400,
    radius: 18,
    count: 1,
    respawnTicks: 1200,
  },

  // --- Briarhollow Warrens (8–12): goblin burrow-town + Warlord Bramblegut ---
  {
    id: 'briarhollowGoblins',
    enemyId: 'briarGoblin',
    level: [10, 12],
    cx: 2300,
    cz: 1560,
    radius: 18,
    count: 4,
    respawnTicks: 300,
  },
  {
    id: 'briarhollowTreant',
    enemyId: 'hollowrootTreant',
    level: [11, 12],
    cx: 2286,
    cz: 1546,
    radius: 14,
    count: 1,
    respawnTicks: 600,
  },
  {
    id: 'briarhollowBoss',
    enemyId: 'bossBriarking',
    level: 12,
    cx: 2300,
    cz: 1560,
    radius: 5,
    count: 1,
    respawnTicks: 1800,
  },

  // --- Stonejaw Foothills (12–18): gnoll caves + grubs around Grubbers' Rest ---
  {
    id: 'foothillGnolls',
    enemyId: 'caveGnoll',
    level: [12, 16],
    cx: 640,
    cz: 1460,
    radius: 28,
    count: 4,
    respawnTicks: 260,
  },
  {
    id: 'foothillGrubs',
    enemyId: 'stonejawGrub',
    level: [12, 15],
    cx: 600,
    cz: 1380,
    radius: 22,
    count: 3,
    respawnTicks: 300,
  },
  {
    id: 'foothillBats',
    enemyId: 'caveBat',
    level: [12, 14],
    cx: 700,
    cz: 1340,
    radius: 20,
    count: 3,
    respawnTicks: 260,
  },

  // --- Gloomroot Cavern (14–18): gnoll cult + blighted grubs + Mother Gnarlmaw ---
  {
    id: 'gloomrootGnolls',
    enemyId: 'caveGnoll',
    level: [15, 18],
    cx: 700,
    cz: 1400,
    radius: 18,
    count: 4,
    respawnTicks: 300,
  },
  {
    id: 'gloomrootGrubs',
    enemyId: 'stonejawGrub',
    level: [15, 17],
    cx: 686,
    cz: 1386,
    radius: 14,
    count: 2,
    respawnTicks: 360,
  },
  {
    id: 'gloomrootBoss',
    enemyId: 'bossGloommother',
    level: 18,
    cx: 700,
    cz: 1400,
    radius: 5,
    count: 1,
    respawnTicks: 1800,
  },

  // --- Glimmerpeaks (18–24): crystal canyons around Glimmercamp / Crystal Overlook ---
  {
    id: 'peakLizards',
    enemyId: 'crystalbackLizard',
    level: [18, 23],
    cx: 760,
    cz: 760,
    radius: 28,
    count: 4,
    respawnTicks: 260,
  },

  // --- The Crystal Deeps (18–22): resonant crystal maze + Prismhide ---
  {
    id: 'crystalDeepsLizards',
    enemyId: 'crystalbackLizard',
    level: [20, 22],
    cx: 770,
    cz: 780,
    radius: 18,
    count: 4,
    respawnTicks: 300,
  },
  {
    id: 'crystalDeepsBoss',
    enemyId: 'bossCrystalWyrm',
    level: 22,
    cx: 770,
    cz: 780,
    radius: 5,
    count: 1,
    respawnTicks: 1800,
  },

  // --- Trollmoor Highlands (24–30): trolls + bog drakes around Cairnwick ---
  {
    id: 'moorTrolls',
    enemyId: 'ironhideTroll',
    level: [24, 30],
    cx: 1450,
    cz: 600,
    radius: 30,
    count: 3,
    respawnTicks: 360,
  },
  {
    id: 'moorDrakes',
    enemyId: 'bogDrake',
    level: [26, 29],
    cx: 1560,
    cz: 560,
    radius: 26,
    count: 3,
    respawnTicks: 320,
  },

  // --- Ironvein Halls (24–28): ruined forge-vault + Forgewarden Urzul ---
  {
    id: 'ironveinTrolls',
    enemyId: 'ironhideTroll',
    level: [26, 28],
    cx: 1400,
    cz: 640,
    radius: 18,
    count: 3,
    respawnTicks: 400,
  },
  {
    id: 'ironveinBoss',
    enemyId: 'bossIronvein',
    level: 28,
    cx: 1400,
    cz: 640,
    radius: 6,
    count: 1,
    respawnTicks: 1800,
  },

  // --- Sunlit Coast (22–30): skeletons + drowned dead below Waymeet ---
  {
    id: 'coastSkeletons',
    enemyId: 'cryptSkeleton',
    level: [22, 28],
    cx: 1540,
    cz: 2600,
    radius: 28,
    count: 4,
    respawnTicks: 280,
  },
  {
    id: 'coastDrowned',
    enemyId: 'drownedDead',
    level: [28, 30],
    cx: 1520,
    cz: 2680,
    radius: 24,
    count: 3,
    respawnTicks: 320,
  },

  // --- The Sunken Crypt (28–30, hardest): sentinels + the Last Waymaker ---
  {
    id: 'cryptSkeletons',
    enemyId: 'cryptSkeleton',
    level: [28, 30],
    cx: 1500,
    cz: 2740,
    radius: 18,
    count: 4,
    respawnTicks: 300,
  },
  {
    id: 'cryptSentinels',
    enemyId: 'cryptSentinel',
    level: [29, 30],
    cx: 1486,
    cz: 2726,
    radius: 14,
    count: 1,
    respawnTicks: 600,
  },
  {
    id: 'cryptBoss',
    enemyId: 'bossLastWaymaker',
    level: 30,
    cx: 1500,
    cz: 2740,
    radius: 6,
    count: 1,
    respawnTicks: 1800,
  },

  // --- Named rare-elite hunt targets (WORLD.md §4): one wandering elite per key
  // zone, single spawn, long respawn (~15 min). Killing them advances "Rarebane".
  {
    id: 'rareThornhide',
    enemyId: 'rareOldThornhide',
    level: 6,
    cx: 1470,
    cz: 1616,
    radius: 14,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareGrislefang',
    enemyId: 'rareGrislefang',
    level: 11,
    cx: 2360,
    cz: 1440,
    radius: 16,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareDuskwing',
    enemyId: 'rareDuskwing',
    level: 13,
    cx: 760,
    cz: 1352,
    radius: 14,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareBoulderjaw',
    enemyId: 'rareBoulderjaw',
    level: 16,
    cx: 700,
    cz: 1300,
    radius: 14,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareGnashCowl',
    enemyId: 'rareGnashCowl',
    level: 17,
    cx: 676,
    cz: 1444,
    radius: 14,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareShardback',
    enemyId: 'rareShardbackAlpha',
    level: 23,
    cx: 824,
    cz: 784,
    radius: 16,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareGruulmarg',
    enemyId: 'rareGruulmarg',
    level: 29,
    cx: 1704,
    cz: 600,
    radius: 18,
    count: 1,
    respawnTicks: 18000,
  },
  {
    id: 'rareWreckmaw',
    enemyId: 'rareWreckmaw',
    level: 30,
    cx: 1540,
    cz: 2600,
    radius: 16,
    count: 1,
    respawnTicks: 18000,
  },
];

/** A Hollow's end-boss encounter (for docs, the atlas, and acceptance tests). */
export interface HollowEncounter {
  hollowId: string;
  bossEnemyId: string;
  level: number;
  cx: number;
  cz: number;
}

/** The five Hollow bosses, keyed to their Hollow (WORLD.md §6). */
export const HOLLOW_ENCOUNTERS: readonly HollowEncounter[] = [
  { hollowId: 'briarhollow', bossEnemyId: 'bossBriarking', level: 12, cx: 2300, cz: 1560 },
  { hollowId: 'gloomroot', bossEnemyId: 'bossGloommother', level: 18, cx: 700, cz: 1400 },
  { hollowId: 'crystalDeeps', bossEnemyId: 'bossCrystalWyrm', level: 22, cx: 770, cz: 780 },
  { hollowId: 'ironvein', bossEnemyId: 'bossIronvein', level: 28, cx: 1400, cz: 640 },
  { hollowId: 'sunkenCrypt', bossEnemyId: 'bossLastWaymaker', level: 30, cx: 1500, cz: 2740 },
];
