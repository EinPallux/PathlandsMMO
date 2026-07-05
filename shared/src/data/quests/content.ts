// Quest content (GDD §8, WORLD.md §3). The full main-story spine "The Waymaker's
// Path" — chapters 1–6 from the Brookhollow tutorial to the Sunken Crypt finale
// (levels 1–30) — plus side arcs and Hollow boss lead-ins across all six zones:
// Heartmead Vale, Mossfang Weald, the Stonejaw Foothills, the Glimmerpeaks, the
// Trollmoor Highlands, and the Sunlit Coast. Later parts widen the zone side-quest
// arcs toward the ~110-quest budget. Pure data — types come from schema.ts.

import { EquipSlot, Rarity } from '../items.js';
import type { QuestDef, QuestGiver } from './schema.js';

/** Named quest-giver NPCs, anchored to settlement plazas (client renders them). */
export const QUEST_GIVERS: readonly QuestGiver[] = [
  // Heartmead Vale
  { id: 'elderMaris', name: 'Elder Maris', settlement: 'brookhollow', dx: 4, dz: 3, seed: 101 },
  {
    id: 'farmerBressel',
    name: 'Farmer Bressel',
    settlement: 'brookhollow',
    dx: -5,
    dz: 4,
    seed: 102,
  },
  { id: 'wardenTuck', name: 'Warden Tuck', settlement: 'millstead', dx: 0, dz: 4, seed: 103 },
  // Mossfang Weald
  { id: 'herbalistFenn', name: 'Herbalist Fenn', settlement: 'fernwick', dx: 4, dz: 3, seed: 104 },
  {
    id: 'captainRoswald',
    name: 'Captain Roswald',
    settlement: 'fernwick',
    dx: -5,
    dz: 2,
    seed: 105,
  },
  { id: 'scoutBramble', name: 'Scout Bramble', settlement: 'mossgate', dx: 0, dz: 4, seed: 106 },
  // Stonejaw Foothills
  { id: 'foremanDurn', name: 'Foreman Durn', settlement: 'grubbersRest', dx: 4, dz: 3, seed: 107 },
  {
    id: 'bountyClerkAda',
    name: 'Bounty-Clerk Ada',
    settlement: 'grubbersRest',
    dx: -5,
    dz: 4,
    seed: 108,
  },
  // Glimmerpeaks
  {
    id: 'prospectorVayle',
    name: 'Prospector Vayle',
    settlement: 'glimmercamp',
    dx: 4,
    dz: 3,
    seed: 109,
  },
  {
    id: 'shrinekeeperIsold',
    name: 'Shrinekeeper Isold',
    settlement: 'glimmercamp',
    dx: -5,
    dz: 4,
    seed: 110,
  },
  // Trollmoor Highlands
  {
    id: 'castellanBrenna',
    name: 'Castellan Brenna',
    settlement: 'cairnwick',
    dx: 4,
    dz: 3,
    seed: 111,
  },
  {
    id: 'loremasterKeld',
    name: 'Loremaster Keld',
    settlement: 'cairnwick',
    dx: -5,
    dz: 4,
    seed: 112,
  },
  // Waymeet & the Sunlit Coast
  {
    id: 'harbormasterCole',
    name: 'Harbormaster Cole',
    settlement: 'waymeet',
    dx: 6,
    dz: -4,
    seed: 113,
  },
  {
    id: 'archivistSelwynMar',
    name: 'Archivist Selwyn-Mar',
    settlement: 'waymeet',
    dx: -6,
    dz: -3,
    seed: 114,
  },
];

/**
 * Enemies that drop a quest "collect" tag on death (deterministic, 100% for quest
 * flow). The client emits a `collect` event with the tag when the enemy dies.
 */
export const QUEST_DROP_TAGS: Record<string, string> = {
  blightrat: 'ratTail',
  venomcapSpriggan: 'venomCap',
  briarGoblin: 'goblinEar',
  caveGnoll: 'gnollFetish',
  stonejawGrub: 'grubPlate',
  crystalbackLizard: 'crystalScale',
  ironhideTroll: 'trollTusk',
  drownedDead: 'brinePearl',
};

// Class-agnostic item specs (the client fills `forClass` from the player at grant).
const spec = (
  slot: EquipSlot,
  rarity: Rarity,
  reqLevel: number,
): { slot: EquipSlot; rarity: Rarity; reqLevel: number } => ({ slot, rarity, reqLevel });

export const QUESTS: readonly QuestDef[] = [
  // =====================================================================
  // Heartmead Vale (1–6): tutorial + side arc
  // =====================================================================
  {
    id: 'q_find_feet',
    name: 'Find Your Feet',
    chapter: 1,
    chain: 'waymakers-path',
    giver: 'elderMaris',
    minLevel: 1,
    objectives: [
      {
        kind: 'explore',
        target: 'brookhollowPlaza',
        label: 'Reach the Brookhollow fountain',
        x: 1536,
        z: 1536,
        radius: 7,
      },
    ],
    reward: { xp: 120, gold: 5 },
    intro:
      'Welcome to Brookhollow, Wayfarer. Steady your legs — walk to the fountain at the heart of the village and get your bearings.',
    progress: 'The fountain is just south of where you woke. Off you go.',
    complete: 'There — you can walk. The roads will treat you kindly now.',
  },
  {
    id: 'q_boar_trouble',
    name: 'Boar Trouble',
    giver: 'farmerBressel',
    minLevel: 1,
    objectives: [
      { kind: 'kill', target: 'thornbackBoar', count: 5, label: 'Thornback Boars culled' },
    ],
    reward: {
      xp: 260,
      gold: 12,
      choices: [
        spec(EquipSlot.Hands, Rarity.Uncommon, 3),
        spec(EquipSlot.Feet, Rarity.Uncommon, 3),
      ],
    },
    intro:
      "Those bristle-backed brutes are rooting up my meadow. Cull five Thornback Boars and I'll see you kitted out.",
    progress: 'Five boars, that was the deal. The meadow east of the fountain is thick with them.',
    complete: "Ha! The meadow can breathe again. Take your pick — you've earned it.",
  },
  {
    id: 'q_verminous',
    name: 'Verminous',
    giver: 'farmerBressel',
    minLevel: 1,
    objectives: [
      { kind: 'collect', target: 'ratTail', count: 4, label: 'Blightrat tails collected' },
    ],
    reward: { xp: 180, gold: 8 },
    intro:
      'The blightrats have got into the grain again — verdigris-sick, the lot of them. Bring me four of their tails so I know the work is done.',
    progress: 'Four blightrat tails. They skulk near the old sheds by the pond.',
    complete: "That's the last of them for now. My thanks — and my grain's.",
  },
  {
    id: 'q_strayed_flock',
    name: 'The Strayed Flock',
    giver: 'farmerBressel',
    minLevel: 2,
    objectives: [
      {
        kind: 'explore',
        target: 'valeMeadowEdge',
        label: 'Search the western meadow for the lamb',
        x: 1460,
        z: 1600,
        radius: 10,
      },
      { kind: 'kill', target: 'blightrat', count: 3, label: 'Blightrats driven off' },
    ],
    reward: { xp: 220, gold: 10, choices: [spec(EquipSlot.Amulet, Rarity.Uncommon, 3)] },
    intro:
      'A lamb wandered off toward the western meadow, and the blightrats are bold today. Find her and clear a path — three of the vermin should do it.',
    progress: 'The lamb strayed west of the village; drive off the rats you find there.',
    complete: 'Safe and bleating. You have a shepherd’s luck, Wayfarer.',
  },

  // =====================================================================
  // Main story: The Waymaker's Path, chapter 1
  // =====================================================================
  {
    id: 'q_light_the_way',
    name: 'Light the Way',
    chapter: 1,
    chain: 'waymakers-path',
    giver: 'elderMaris',
    minLevel: 1,
    prereq: ['q_find_feet'],
    objectives: [
      { kind: 'use', target: 'ws-brookhollow', label: 'Attune the Brookhollow Waystone' },
    ],
    reward: {
      xp: 320,
      gold: 10,
      items: [spec(EquipSlot.Trinket, Rarity.Uncommon, 2)],
      waystoneUnlock: 'ws-brookhollow',
    },
    intro:
      'The old Waystones have gone dark, one by one. Ours still answers a true hand — lay yours on the Brookhollow stone and wake it. That is where your path begins.',
    progress: 'The Waystone stands at the plaza. Approach it and press to attune.',
    complete:
      'It sings again — you felt it. Something is unmaking the Waystones, Wayfarer, and I think you are meant to follow it down. Speak to Warden Tuck at Millstead.',
  },
  {
    id: 'q_word_from_millstead',
    name: 'Word from Millstead',
    chapter: 1,
    chain: 'waymakers-path',
    giver: 'elderMaris',
    turnIn: 'wardenTuck',
    minLevel: 1,
    prereq: ['q_light_the_way'],
    objectives: [{ kind: 'talk', target: 'wardenTuck', label: 'Speak with Warden Tuck' }],
    reward: { xp: 200, gold: 8 },
    intro:
      'Carry word to Warden Tuck at Millstead, west along the brook — tell him the Brookhollow stone is lit and ask what he has seen on the roads.',
    progress: 'Warden Tuck keeps the mill at Millstead, west along the Old Road.',
    complete:
      "Lit, is it? Good. The roads have turned mean — goblin scouts probing from the Weald, wolves bold as you please. If you're the Elder's Wayfarer, make yourself useful.",
  },
  {
    id: 'q_thin_the_pack',
    name: 'Thin the Pack',
    giver: 'wardenTuck',
    minLevel: 3,
    prereq: ['q_word_from_millstead'],
    objectives: [
      { kind: 'kill', target: 'mossfangWolf', count: 6, label: 'Mossfang Wolves slain' },
    ],
    reward: {
      xp: 420,
      gold: 20,
      choices: [
        spec(EquipSlot.MainHand, Rarity.Uncommon, 5),
        spec(EquipSlot.Chest, Rarity.Uncommon, 5),
      ],
    },
    intro:
      'The Mossfang packs have crossed the treeline and taken two of my sheep. Cull six of them and the mill can sleep easy.',
    progress: 'Six Mossfang Wolves. They range the treeline east toward the Weald.',
    complete: 'Six less to howl at the moon. Here — a mill looks after those who look after it.',
  },
  {
    id: 'q_road_wardens',
    name: 'Wardens of the Road',
    giver: 'wardenTuck',
    minLevel: 4,
    prereq: ['q_word_from_millstead'],
    objectives: [
      { kind: 'kill', target: 'roadBandit', count: 5, label: 'Old Road brigands routed' },
    ],
    reward: { xp: 300, gold: 18, choices: [spec(EquipSlot.Legs, Rarity.Uncommon, 5)] },
    intro:
      'Brigands have set on the Old Road between here and the fields. Break five of them and travellers might trust the road again.',
    progress: 'The bandits waylay carts along the Old Road east of Millstead.',
    complete: 'The road is the Waymakers’ gift; good of you to guard it. Well done.',
  },

  // =====================================================================
  // Main story chapter 2 — Mossfang Weald
  // =====================================================================
  {
    id: 'q_the_blight_deepens',
    name: 'The Blight Deepens',
    chapter: 2,
    chain: 'waymakers-path',
    giver: 'herbalistFenn',
    minLevel: 6,
    prereq: ['q_word_from_millstead'],
    objectives: [
      { kind: 'kill', target: 'venomcapSpriggan', count: 6, label: 'Venomcap Spriggans burned' },
      { kind: 'collect', target: 'venomCap', count: 4, label: 'Blighted caps gathered' },
    ],
    reward: {
      xp: 620,
      gold: 30,
      items: [spec(EquipSlot.Head, Rarity.Uncommon, 8)],
      waystoneUnlock: 'ws-elderGlade',
    },
    intro:
      'You came from Millstead? Then you have seen the edge of it. Here in the Weald the Blight walks — spriggans, thick with it. Burn six and bring me four of their caps; I will read what the rot is doing.',
    progress: 'Venomcap Spriggans haunt the deep Weald east of Fernwick. Bring me four caps.',
    complete:
      'The caps reek of unmade Waystone-stuff. The Blight is not spreading outward, Wayfarer — it is welling up. Roswald has been tracking the goblins who feed on it. Find him.',
  },
  {
    id: 'q_goblin_warcamp',
    name: 'The Goblin War-Camp',
    chapter: 2,
    chain: 'waymakers-path',
    giver: 'captainRoswald',
    minLevel: 8,
    prereq: ['q_the_blight_deepens'],
    objectives: [
      { kind: 'kill', target: 'briarGoblin', count: 8, label: 'Briar Goblins broken' },
      { kind: 'collect', target: 'goblinEar', count: 5, label: 'Goblin war-tokens taken' },
    ],
    reward: {
      xp: 780,
      gold: 40,
      choices: [
        spec(EquipSlot.MainHand, Rarity.Rare, 9),
        spec(EquipSlot.Chest, Rarity.Rare, 9),
        spec(EquipSlot.Legs, Rarity.Rare, 9),
      ],
    },
    intro:
      'The Briar Goblins have made a war-camp on the blight-wells and grow bolder by the night. Break eight and take their war-tokens — I want to know who they answer to.',
    progress: 'The goblin camp squats around a blight-well in the deep Weald.',
    complete:
      'These tokens all bear the same mark — a warren under the great stump. They answer to a warlord. But that is a fight for later. First, the Elder was right: the Blight leads down, and down means the Foothills.',
  },
  {
    id: 'q_blight_has_a_direction',
    name: 'The Blight Has a Direction',
    chapter: 2,
    chain: 'waymakers-path',
    giver: 'captainRoswald',
    minLevel: 9,
    prereq: ['q_goblin_warcamp'],
    objectives: [
      {
        kind: 'explore',
        target: 'wealdBlightWell',
        label: 'Scout the deep Weald blight-well',
        x: 2500,
        z: 1360,
        radius: 12,
      },
    ],
    reward: { xp: 520, gold: 24, items: [spec(EquipSlot.Feet, Rarity.Uncommon, 10)] },
    intro:
      'Follow the wells to their deepest point, east and south, and see with your own eyes where the rot runs. Then we will know which way to march.',
    progress: 'The deepest blight-well lies in the far south-east of the Weald.',
    complete:
      'It sinks toward the Stonejaw Foothills — toward the caves, and whatever the gnolls guard there. Take word to Foreman Durn at Grubbers’ Rest. Tell him the Waymaker’s Path leads to his door.',
  },

  // =====================================================================
  // Mossfang Weald — side arc
  // =====================================================================
  {
    id: 'q_fernwick_grove',
    name: 'The Blighted Grove',
    giver: 'herbalistFenn',
    minLevel: 7,
    objectives: [
      { kind: 'kill', target: 'venomcapSpriggan', count: 5, label: 'Grove spriggans cleared' },
    ],
    reward: { xp: 360, gold: 16, choices: [spec(EquipSlot.Hands, Rarity.Uncommon, 8)] },
    intro:
      "Fernwick's herb-grove is choked with spriggans; I cannot harvest a leaf. Clear five and I will thank you properly.",
    progress: "The grove sits at Fernwick's western edge, thick with spriggans.",
    complete: 'The grove can heal now. Bless you — and take this for your trouble.',
  },
  {
    id: 'q_treant_menace',
    name: 'Rootrot',
    giver: 'captainRoswald',
    minLevel: 10,
    objectives: [
      { kind: 'kill', target: 'hollowrootTreant', count: 3, label: 'Hollowroot Treants felled' },
    ],
    reward: { xp: 520, gold: 26, choices: [spec(EquipSlot.Chest, Rarity.Rare, 11)] },
    intro:
      'The Blight has hollowed three great trees and set them walking. Fell the Hollowroot Treants before they reach the village palisade.',
    progress: 'The Treants stalk the deep Weald; slow, strong, and rotten to the core.',
    complete: 'Timber! Fernwick owes you its walls tonight.',
  },
  {
    id: 'q_the_pale_stag',
    name: 'The Pale Stag',
    giver: 'scoutBramble',
    minLevel: 11,
    objectives: [{ kind: 'kill', target: 'direStag', label: 'The Pale Stag bested' }],
    reward: {
      xp: 600,
      gold: 30,
      items: [spec(EquipSlot.Trinket, Rarity.Rare, 12)],
    },
    intro:
      'A great pale stag walks the Weald glades — neutral, until it isn’t. The hunters speak of it in whispers. Best it, and its charm is yours.',
    progress: 'The Pale Stag roams the glades; provoke it only when you are ready.',
    complete: 'You felled the Pale Stag. There is a hush in the Weald now. Wear its charm well.',
  },
  {
    id: 'q_mossgate_watch',
    name: 'Mossgate Watch',
    giver: 'scoutBramble',
    minLevel: 7,
    objectives: [
      {
        kind: 'kill',
        target: 'mossfangWolf',
        count: 6,
        label: 'Wolves cleared from the gate road',
      },
    ],
    reward: { xp: 380, gold: 18, choices: [spec(EquipSlot.Feet, Rarity.Uncommon, 8)] },
    intro:
      'The wolves have the Mossgate road so thick a courier won’t ride it. Thin them — six should reopen the way east.',
    progress: 'Mossfang Wolves prowl the road between Mossgate and Fernwick.',
    complete: 'The couriers can ride again. The Watch thanks you.',
  },

  // =====================================================================
  // Main story chapter 3 — Stonejaw Foothills
  // =====================================================================
  {
    id: 'q_the_survey_map',
    name: "A Waymaker's Survey",
    chapter: 3,
    chain: 'waymakers-path',
    giver: 'foremanDurn',
    minLevel: 12,
    prereq: ['q_blight_has_a_direction'],
    objectives: [
      { kind: 'kill', target: 'caveGnoll', count: 8, label: 'Cave Gnolls driven back' },
      { kind: 'collect', target: 'gnollFetish', count: 3, label: 'Gnoll fetishes taken' },
    ],
    reward: {
      xp: 1100,
      gold: 55,
      items: [spec(EquipSlot.Amulet, Rarity.Rare, 13)],
      waystoneUnlock: 'ws-gulchBottom',
    },
    intro:
      'Roswald’s word, is it? Aye — the gnolls took an old Waymaker survey map from Shaft Three, and they’ve daubed it into their fetishes. Break eight of the brutes and bring me three fetishes; I’ll piece the map back together.',
    progress: 'The Cave Gnolls den in the foothill caves north of Grubbers’ Rest.',
    complete:
      'There — the survey map, near enough whole. It marks a deep place under the caves where the Blight pools. The gnolls guard its mouth. That is where your Path leads next, Wayfarer.',
  },
  {
    id: 'q_the_gnoll_dens',
    name: 'Into the Dens',
    chapter: 3,
    chain: 'waymakers-path',
    giver: 'foremanDurn',
    minLevel: 13,
    prereq: ['q_the_survey_map'],
    objectives: [
      {
        kind: 'explore',
        target: 'gloomrootMouth',
        label: 'Scout the mouth of Gloomroot Cavern',
        x: 700,
        z: 1400,
        radius: 12,
      },
    ],
    reward: { xp: 900, gold: 45, choices: [spec(EquipSlot.Head, Rarity.Rare, 14)] },
    intro:
      'Follow the survey to the cave-mouth the gnolls guard — Gloomroot, the old miners called it. Do not go in. Just see it, and come back. Chapter’s end for now.',
    progress: 'Gloomroot Cavern opens in the foothills west of Grubbers’ Rest.',
    complete:
      'You’ve seen it, then — the dark that breathes. The Path leads down into Gloomroot, but that is a deeper tale for a stronger Wayfarer. Rest. You have come far.',
  },

  // =====================================================================
  // Stonejaw Foothills — side arc
  // =====================================================================
  {
    id: 'q_shaft_three',
    name: 'Shaft Three',
    giver: 'foremanDurn',
    minLevel: 12,
    objectives: [
      { kind: 'kill', target: 'stonejawGrub', count: 6, label: 'Stonejaw Grubs cleared' },
      { kind: 'collect', target: 'grubPlate', count: 3, label: 'Mineral plates salvaged' },
    ],
    reward: { xp: 560, gold: 28, choices: [spec(EquipSlot.Hands, Rarity.Rare, 13)] },
    intro:
      'Grubs have chewed Shaft Three to ruin and my miners won’t go down. Clear six and bring me three of their mineral plates — the smith can use them.',
    progress: 'The Stonejaw Grubs infest Shaft Three, north of Grubbers’ Rest.',
    complete: 'Shaft Three is workable again. The plates will make good tools. My thanks.',
  },
  {
    id: 'q_deadeye_moll',
    name: 'Deadeye Moll',
    giver: 'bountyClerkAda',
    minLevel: 13,
    objectives: [
      { kind: 'kill', target: 'banditArcher', count: 6, label: "Moll's crew scattered" },
    ],
    reward: {
      xp: 640,
      gold: 40,
      choices: [
        spec(EquipSlot.MainHand, Rarity.Rare, 14),
        spec(EquipSlot.Trinket, Rarity.Rare, 14),
      ],
    },
    intro:
      'There’s a bounty on Deadeye Moll’s crew — hill archers who’ve robbed three mine payrolls. Scatter six of them and the board pays out.',
    progress: 'Moll’s archers hold the gulches south of Grubbers’ Rest.',
    complete: 'Six of Moll’s crew, done. Here’s your coin, and gladly. The payrolls ride safe.',
  },
  {
    id: 'q_cave_screech',
    name: 'Screech in the Dark',
    giver: 'bountyClerkAda',
    minLevel: 12,
    objectives: [{ kind: 'kill', target: 'caveBat', count: 8, label: 'Cave Bats culled' }],
    reward: { xp: 420, gold: 22, choices: [spec(EquipSlot.Legs, Rarity.Uncommon, 12)] },
    intro:
      'The cave bats boil out of the cliffs at dusk and spook the whole town. Cull eight and folk might sleep.',
    progress: 'Cave Bats roost in the cliff-caves around the foothills.',
    complete: 'Quiet at last. The Rest sleeps easier for your work.',
  },

  // =====================================================================
  // Hollow lead-in (boss objective)
  // =====================================================================
  {
    id: 'q_warren_warlord',
    name: 'The Warren Warlord',
    giver: 'wardenTuck',
    minLevel: 10,
    prereq: ['q_thin_the_pack'],
    objectives: [{ kind: 'boss', target: 'bossBriarking', label: 'Defeat Warlord Bramblegut' }],
    reward: {
      xp: 900,
      gold: 60,
      choices: [
        spec(EquipSlot.Trinket, Rarity.Rare, 12),
        spec(EquipSlot.MainHand, Rarity.Rare, 12),
        spec(EquipSlot.Head, Rarity.Rare, 12),
      ],
    },
    intro:
      'The goblins answer to one now — Warlord Bramblegut, deep in Briarhollow Warrens east of the Weald. Cut off the head and the warren scatters. This is no boar-cull; go ready.',
    progress: 'Warlord Bramblegut holds Briarhollow Warrens, at the great stump east of Fernwick.',
    complete:
      'Bramblegut, dead by your hand. You have the makings of a real Wayfarer. The Elder chose well.',
  },

  // =====================================================================
  // Gloomroot Cavern — Hollow lead-in (Foothills, boss objective)
  // =====================================================================
  {
    id: 'q_mother_gnarlmaw',
    name: 'The Thing Under Shaft Three',
    giver: 'foremanDurn',
    minLevel: 15,
    prereq: ['q_the_gnoll_dens'],
    objectives: [{ kind: 'boss', target: 'bossGloommother', label: 'Defeat Mother Gnarlmaw' }],
    reward: {
      xp: 1200,
      gold: 60,
      choices: [
        spec(EquipSlot.Chest, Rarity.Rare, 16),
        spec(EquipSlot.MainHand, Rarity.Rare, 16),
        spec(EquipSlot.Trinket, Rarity.Rare, 16),
      ],
    },
    intro:
      'The grubs answered to something, Wayfarer — a great blighted mother, Gnarlmaw, burrowed in Gloomroot where the caves drink the Blight. She erupts and she poisons the ground. Kill her before she seeds the whole hill.',
    progress:
      'Mother Gnarlmaw burrows in Gloomroot Cavern, west of Grubbers’ Rest. Mind the pools.',
    complete:
      'Gnarlmaw is carrion. The mines can breathe. Whatever wakes the Blight, it is deeper still — up in the crystal peaks, they say the very stone is being eaten. Take the high road to Glimmercamp.',
  },

  // =====================================================================
  // Main story chapter 4 — Glimmerpeaks (crystal marrow)
  // =====================================================================
  {
    id: 'q_crystal_marrow',
    name: 'Crystal Marrow',
    chapter: 4,
    chain: 'waymakers-path',
    giver: 'prospectorVayle',
    minLevel: 18,
    prereq: ['q_the_gnoll_dens'],
    objectives: [
      { kind: 'kill', target: 'crystalbackLizard', count: 8, label: 'Crystalback Lizards slain' },
      { kind: 'collect', target: 'crystalScale', count: 4, label: 'Resonant scales gathered' },
    ],
    reward: {
      xp: 1500,
      gold: 70,
      items: [spec(EquipSlot.Hands, Rarity.Rare, 18)],
      waystoneUnlock: 'ws-crystalOverlook',
    },
    intro:
      'You’re the Wayfarer chasing the Blight? Then look closer at our crystal — it rings hollow where it never used to. The lizards feed on the marrow of it. Slay eight and bring me four scales; I’ll show you what’s being eaten.',
    progress: 'Crystalback Lizards bask in the glowing canyons above Glimmercamp.',
    complete:
      'See how the marrow’s gone from these? This isn’t ore, Wayfarer — it’s Waystone-stuff, the same as the old stones. Something is draining the mountains dry. Isold at the shrine has heard it singing.',
  },
  {
    id: 'q_songs_in_the_crystal',
    name: 'Songs in the Crystal',
    chapter: 4,
    chain: 'waymakers-path',
    giver: 'shrinekeeperIsold',
    minLevel: 20,
    prereq: ['q_crystal_marrow'],
    objectives: [
      {
        kind: 'explore',
        target: 'crystalDeepsMouth',
        label: 'Trace the song to the Crystal Deeps',
        x: 770,
        z: 780,
        radius: 14,
      },
    ],
    reward: { xp: 1300, gold: 60, items: [spec(EquipSlot.Feet, Rarity.Rare, 20)] },
    intro:
      'The crystal sings, Wayfarer — a low grief, from deep in the mountain. Follow it to its source. I would go myself, but my knees are older than these peaks.',
    progress: 'The song swells toward the Crystal Deeps, in the high canyons north-west of camp.',
    complete:
      'A drinking-sound, you say — something lapping the marrow from within the Deeps. Prismhide, the old wyrm, coils around it and won’t let the miners near. That grief will not stop until the wyrm does.',
  },

  // =====================================================================
  // Glimmerpeaks — side arc + Hollow lead-in
  // =====================================================================
  {
    id: 'q_shardback_cull',
    name: 'The Shardback Cull',
    giver: 'prospectorVayle',
    minLevel: 19,
    objectives: [
      { kind: 'kill', target: 'crystalbackLizard', count: 10, label: 'Shardbacks culled' },
    ],
    reward: { xp: 900, gold: 40, choices: [spec(EquipSlot.Legs, Rarity.Rare, 19)] },
    intro:
      'The lizards have grown thick as the marrow’s thinned — a whole shardback brood on the overlook trail. Cull ten and my prospectors can work the seam again.',
    progress: 'Crystalback Lizards swarm the trail to the Crystal Overlook.',
    complete: 'The seam’s clear. You swing a fair pick for a Wayfarer. Here’s your due.',
  },
  {
    id: 'q_frostgate_vigil',
    name: 'The Frostgate Vigil',
    giver: 'shrinekeeperIsold',
    minLevel: 21,
    objectives: [
      {
        kind: 'explore',
        target: 'crystalOverlookShrine',
        label: 'Keep the vigil at the Crystal Overlook',
        x: 820,
        z: 820,
        radius: 10,
      },
    ],
    reward: { xp: 780, gold: 34, items: [spec(EquipSlot.Amulet, Rarity.Uncommon, 21)] },
    intro:
      'An old rite: stand the dawn vigil at the Crystal Overlook and let the peaks take your measure. Humor an old shrinekeeper — the mountain remembers those who greet it.',
    progress: 'The Crystal Overlook stands on the high ridge north-west of Glimmercamp.',
    complete:
      'The peaks know you now. That is no small thing up here. Go with the mountain’s blessing.',
  },
  {
    id: 'q_prismhide',
    name: 'The Grief of Prismhide',
    giver: 'shrinekeeperIsold',
    minLevel: 22,
    prereq: ['q_songs_in_the_crystal'],
    objectives: [{ kind: 'boss', target: 'bossCrystalWyrm', label: 'Defeat Prismhide' }],
    reward: {
      xp: 1900,
      gold: 95,
      choices: [
        spec(EquipSlot.MainHand, Rarity.Rare, 22),
        spec(EquipSlot.Head, Rarity.Rare, 22),
        spec(EquipSlot.Chest, Rarity.Rare, 22),
      ],
    },
    intro:
      'Prismhide is no monster, Wayfarer — only old, and starving as the marrow fails. Its shield answers to the crystal pylons in the Deeps. Break those, then end its grief. Go gently, and go ready.',
    progress: 'Prismhide coils in the Crystal Deeps; shatter the pylons before you strike.',
    complete:
      'The song has stopped. You gave the old wyrm peace — and the Deeps their quiet. But the marrow is being carried somewhere, north to the Trollmoor. Brenna holds Cairnwick; she’ll want word.',
  },

  // =====================================================================
  // Main story chapter 5 — Trollmoor Highlands (what the trolls buried)
  // =====================================================================
  {
    id: 'q_the_trolls_remember',
    name: 'The Trolls Remember',
    chapter: 5,
    chain: 'waymakers-path',
    giver: 'castellanBrenna',
    minLevel: 24,
    prereq: ['q_songs_in_the_crystal'],
    objectives: [
      { kind: 'kill', target: 'ironhideTroll', count: 8, label: 'Ironhide Trolls broken' },
      { kind: 'collect', target: 'trollTusk', count: 4, label: 'Carved war-tusks taken' },
    ],
    reward: {
      xp: 2200,
      gold: 110,
      items: [spec(EquipSlot.Chest, Rarity.Rare, 24)],
      waystoneUnlock: 'ws-theSentinels',
    },
    intro:
      'A Wayfarer, this far north? Good — I’m short of those. The Ironhide war-band carries carved tusks older than Cairnwick, and Keld swears the carvings are Waymaker script. Break eight of the brutes and bring me four tusks. Let’s learn what the trolls kept.',
    progress: 'The Ironhide war-band roams the cairns and bogs of the high moor.',
    complete:
      'Keld will weep over these. The carvings are a warning — the trolls guard something the Waymakers buried under the moor, in the forge-vault at Ironvein. They’ve remembered it for a thousand years. Speak to Keld.',
  },
  {
    id: 'q_the_buried_forge',
    name: 'The Buried Forge',
    chapter: 5,
    chain: 'waymakers-path',
    giver: 'loremasterKeld',
    minLevel: 26,
    prereq: ['q_the_trolls_remember'],
    objectives: [
      {
        kind: 'explore',
        target: 'ironveinMouth',
        label: 'Find the mouth of Ironvein Halls',
        x: 1400,
        z: 640,
        radius: 14,
      },
    ],
    reward: { xp: 1800, gold: 90, items: [spec(EquipSlot.Legs, Rarity.Rare, 26)] },
    intro:
      'The tusks name a place: Ironvein, a Waymaker forge-vault the trolls have squatted on since the fall. If the marrow is being carried anywhere, it’s there — to forge something. Find the vault mouth, but do not enter alone.',
    progress: 'Ironvein Halls open in the ridges north of Cairnwick, held by the trolls.',
    complete:
      'A forge that never cooled — and the Ironhides feeding it stolen marrow under a warden, Urzul, who wields a Waymaker hammer. Whatever they’re making, it isn’t for us. This is the last road before the coast, Wayfarer.',
  },

  // =====================================================================
  // Trollmoor Highlands — side arc + Hollow lead-in
  // =====================================================================
  {
    id: 'q_bog_drakes',
    name: 'Drakes in the Peat',
    giver: 'castellanBrenna',
    minLevel: 26,
    objectives: [{ kind: 'kill', target: 'bogDrake', count: 6, label: 'Bog Drakes slain' }],
    reward: { xp: 1400, gold: 62, choices: [spec(EquipSlot.Feet, Rarity.Rare, 26)] },
    intro:
      'Bog drakes have nested in the peat cuts and taken two of my rangers. Slay six and the moor patrols can ride the low road again.',
    progress: 'Bog Drakes lair in the peat bogs south of Cairnwick.',
    complete:
      'Six drakes down. Cairnwick’s low road is ours again. You’ve earned the keep’s thanks.',
  },
  {
    id: 'q_the_standing_stones',
    name: 'The Standing Stones',
    giver: 'loremasterKeld',
    minLevel: 25,
    objectives: [
      {
        kind: 'explore',
        target: 'theSentinelsCircle',
        label: 'Read the Sentinels stone circle',
        x: 1720,
        z: 560,
        radius: 12,
      },
      { kind: 'kill', target: 'ironhideTroll', count: 4, label: 'Cairn-trolls driven off' },
    ],
    reward: { xp: 1250, gold: 58, items: [spec(EquipSlot.Amulet, Rarity.Rare, 25)] },
    intro:
      'The Sentinels — a Waymaker stone circle the trolls have half-toppled. I need the standing-stone glyphs copied before they’re lost, but the cairn-trolls won’t make it easy. Read the circle, and clear four of them for me.',
    progress: 'The Sentinels stand on the high moor north-east of Cairnwick.',
    complete:
      'You’ve given me a page of the oldest speech on the continent. The circle points down the Old Road, to the coast — to where the last Waymaker went. It always comes back to that.',
  },
  {
    id: 'q_forgewarden_urzul',
    name: 'The Forgewarden',
    giver: 'loremasterKeld',
    minLevel: 27,
    prereq: ['q_the_buried_forge'],
    objectives: [{ kind: 'boss', target: 'bossIronvein', label: 'Defeat Forgewarden Urzul' }],
    reward: {
      xp: 2600,
      gold: 130,
      choices: [
        spec(EquipSlot.MainHand, Rarity.Epic, 27),
        spec(EquipSlot.Chest, Rarity.Epic, 27),
        spec(EquipSlot.Head, Rarity.Epic, 27),
      ],
    },
    intro:
      'Urzul must not finish what he’s forging. The vault floor runs with forge-flame at his call — keep moving, break the hammer’s rhythm, and put the warden down. Take this, and end it.',
    progress: 'Forgewarden Urzul holds the deepest hall of Ironvein; beware the forge-flame floor.',
    complete:
      'The hammer is cold, the forge is dark. Whatever Urzul was making went unfinished — and the marrow he hoarded was bound for the coast, for the crypt. This is the Waymaker’s Path’s end, Wayfarer. Go to Waymeet.',
  },

  // =====================================================================
  // Main story chapter 6 — Sunlit Coast & the Sunken Crypt (finale)
  // =====================================================================
  {
    id: 'q_the_drowned_road',
    name: 'The Drowned Road',
    chapter: 6,
    chain: 'waymakers-path',
    giver: 'harbormasterCole',
    minLevel: 28,
    prereq: ['q_the_buried_forge'],
    objectives: [
      { kind: 'kill', target: 'drownedDead', count: 8, label: 'Drowned Dead put to rest' },
      { kind: 'collect', target: 'brinePearl', count: 4, label: 'Brine-pearls recovered' },
    ],
    reward: {
      xp: 3000,
      gold: 150,
      items: [spec(EquipSlot.Hands, Rarity.Epic, 28)],
      waystoneUnlock: 'ws-cryptwatch',
    },
    intro:
      'So you’re the one who walked the whole Old Road. The coast is the end of it — and the dead won’t stay down. Every night more drowned crawl from the shallows toward the crypt. Put eight to rest and bring me four of the brine-pearls they carry; the Archivist reads them like pages.',
    progress: 'The Drowned Dead haul themselves from the shallows below Waymeet toward the crypt.',
    complete:
      'The pearls are memories, Cole says — the crypt’s own. Take them to Archivist Selwyn-Mar at the old library. If anyone can tell you what waits in the Sunken Crypt, it’s her. This is the last door, Wayfarer.',
  },
  {
    id: 'q_the_last_waymaker',
    name: 'The Last Waymaker',
    chapter: 6,
    chain: 'waymakers-path',
    giver: 'archivistSelwynMar',
    minLevel: 30,
    prereq: ['q_the_drowned_road'],
    objectives: [{ kind: 'boss', target: 'bossLastWaymaker', label: 'Face the Last Waymaker' }],
    reward: {
      xp: 4500,
      gold: 300,
      items: [spec(EquipSlot.Trinket, Rarity.Epic, 30)],
      choices: [
        spec(EquipSlot.MainHand, Rarity.Epic, 30),
        spec(EquipSlot.Chest, Rarity.Epic, 30),
        spec(EquipSlot.Head, Rarity.Epic, 30),
      ],
      waystoneUnlock: 'ws-pierside',
    },
    intro:
      'The pearls tell it all, Wayfarer. The last Waymaker did not die down there — she stayed, and she has been unmaking the network ever since, draining the marrow to hold one drowned tomb against time. The Blight is her grief made law. Go down into the Sunken Crypt. End it, however you can. The whole road has led you here.',
    progress:
      'The Last Waymaker waits in the flooded tomb beneath the Sunlit Coast. Walk the path.',
    complete:
      'It is done. You walked the last path-tile and gave the Waymaker her rest — and as she faded, the Grand Waystone woke, and a hundred sleeping stones answered across the continent. The road is whole again, and you made it so. They will call you Wayfinder now. There is only the horizon left.',
  },

  // =====================================================================
  // Sunlit Coast — side arc
  // =====================================================================
  {
    id: 'q_wreck_scavengers',
    name: 'Bones on the Beach',
    giver: 'harbormasterCole',
    minLevel: 28,
    objectives: [
      { kind: 'kill', target: 'cryptSkeleton', count: 8, label: 'Crypt Skeletons scattered' },
    ],
    reward: { xp: 1900, gold: 85, choices: [spec(EquipSlot.Legs, Rarity.Rare, 28)] },
    intro:
      'The wrecks along the strand are thick with walking bones since the crypt stirred. Scatter eight and my salvagers can work the tide-line without losing fingers.',
    progress: 'Crypt Skeletons pick over the shipwrecks along the Sunlit Coast.',
    complete:
      'The strand’s clear enough to salvage. Here — pulled it from a wreck myself. It suits a Wayfarer.',
  },
  {
    id: 'q_crypt_sentinels',
    name: 'The Sentinels of the Deep',
    giver: 'archivistSelwynMar',
    minLevel: 29,
    objectives: [
      { kind: 'kill', target: 'cryptSentinel', count: 4, label: 'Crypt Sentinels shattered' },
    ],
    reward: {
      xp: 2200,
      gold: 100,
      choices: [spec(EquipSlot.OffHand, Rarity.Epic, 29), spec(EquipSlot.Trinket, Rarity.Rare, 29)],
    },
    intro:
      'Before you brave the crypt itself, blood the guardians at its threshold — the Sentinels the Waymaker set to keep the living out. Four of them ward the outer gate. Break them, and the way down opens.',
    progress: 'Crypt Sentinels ward the flooded gate of the Sunken Crypt, at the coast’s edge.',
    complete:
      'The gate is unguarded now. What lies below is the Waymaker herself — and the end of the whole long road. Steel yourself, Wayfarer. History is holding its breath.',
  },
];
