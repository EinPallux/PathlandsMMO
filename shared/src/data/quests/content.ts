// Quest content (GDD §8, WORLD.md §3). The early-game questing spine: the
// Brookhollow tutorial, the main story "The Waymaker's Path" chapters 1–3, and side
// arcs across Heartmead Vale, Mossfang Weald, and the Stonejaw Foothills (roughly
// levels 1–14). Later parts fill the remaining zones toward the ~110-quest budget.
// Pure data — objective/reward types come from schema.ts.

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
    objectives: [{ kind: 'use', target: 'brookhollow', label: 'Attune the Brookhollow Waystone' }],
    reward: {
      xp: 320,
      gold: 10,
      items: [spec(EquipSlot.Trinket, Rarity.Uncommon, 2)],
      waystoneUnlock: 'brookhollow',
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
      waystoneUnlock: 'elderGlade',
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
      waystoneUnlock: 'gulchBottom',
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
];
