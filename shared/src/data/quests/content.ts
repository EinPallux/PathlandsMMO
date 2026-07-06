// Quest content (GDD §8, WORLD.md §3). The full main-story spine "The Waymaker's
// Path" — chapters 1–6 from the Brookhollow tutorial to the Sunken Crypt finale
// (levels 1–30) — plus side arcs and Hollow boss lead-ins across all six zones:
// Heartmead Vale, Mossfang Weald, the Stonejaw Foothills, the Glimmerpeaks, the
// Trollmoor Highlands, and the Sunlit Coast. Part 14 fills out the zone side-quest
// arcs to the ~110-quest budget (24 givers, 111 quests), thickening every level band
// 1→30 with kill/collect/explore/courier work. Pure data — types come from schema.ts.

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
  // --- Part 14: side-quest givers (breadth toward ~110) ---
  // Heartmead Vale
  {
    id: 'innkeepMirabel',
    name: 'Innkeep Mirabel',
    settlement: 'brookhollow',
    dx: 7,
    dz: -4,
    seed: 115,
  },
  {
    id: 'houndmasterPella',
    name: 'Houndmaster Pella',
    settlement: 'millstead',
    dx: -6,
    dz: 2,
    seed: 116,
  },
  // Mossfang Weald
  { id: 'sisterElowen', name: 'Sister Elowen', settlement: 'fernwick', dx: 6, dz: -3, seed: 117 },
  { id: 'rangerAsh', name: 'Ranger Ash', settlement: 'mossgate', dx: -6, dz: 2, seed: 118 },
  // Stonejaw Foothills
  { id: 'minerJossa', name: 'Miner Jossa', settlement: 'grubbersRest', dx: 7, dz: -4, seed: 119 },
  {
    id: 'quartermasterVell',
    name: 'Quartermaster Vell',
    settlement: 'grubbersRest',
    dx: -7,
    dz: -3,
    seed: 120,
  },
  // Glimmerpeaks
  {
    id: 'lampwrightNed',
    name: 'Lampwright Ned',
    settlement: 'glimmercamp',
    dx: 7,
    dz: -4,
    seed: 121,
  },
  { id: 'pilgrimAsha', name: 'Pilgrim Asha', settlement: 'glimmercamp', dx: -7, dz: -3, seed: 122 },
  // Trollmoor Highlands
  { id: 'huscarlBran', name: 'Huscarl Bran', settlement: 'cairnwick', dx: 6, dz: -4, seed: 123 },
  // Sunlit Coast
  {
    id: 'saltmerchantPryor',
    name: 'Salt-Merchant Pryor',
    settlement: 'waymeet',
    dx: 0,
    dz: 7,
    seed: 124,
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
  // Part 14 — one tag per remaining enemy, so side quests have collect variety.
  thornbackBoar: 'boarHide',
  mossfangWolf: 'wolfPelt',
  direStag: 'stagAntler',
  hollowrootTreant: 'heartwood',
  roadBandit: 'banditBrand',
  banditArcher: 'blackFletch',
  marshSlime: 'slimeCore',
  caveBat: 'batWing',
  bogDrake: 'drakeScale',
  cryptSkeleton: 'boneMeal',
  cryptSentinel: 'runeShard',
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

  // =====================================================================
  // Part 14 — zone side-quest breadth (levels 1–30). These thicken every band
  // toward the ~110-quest budget; they hang off the hub givers and the new
  // side-givers, and never gate the main story.
  // =====================================================================

  // --- Heartmead Vale (1–6) -------------------------------------------------
  {
    id: 'q_stew_pot',
    name: 'For the Stew-Pot',
    giver: 'innkeepMirabel',
    minLevel: 1,
    objectives: [
      { kind: 'collect', target: 'boarHide', count: 4, label: 'Boar hides for the pot' },
    ],
    reward: { xp: 180, gold: 8 },
    intro:
      'A full house and an empty larder — that is a bad night for an innkeep. Bring me four boar hides and the Brookhollow stew will feed the whole common room.',
    progress:
      'The Thornback Boars root the meadow east of the fountain. Four hides, if you please.',
    complete: 'That will simmer beautifully. Sit — your first bowl is on the house, Wayfarer.',
  },
  {
    id: 'q_cellar_rats',
    name: 'Something in the Cellar',
    giver: 'innkeepMirabel',
    minLevel: 2,
    objectives: [
      { kind: 'kill', target: 'blightrat', count: 6, label: 'Cellar blightrats cleared' },
    ],
    reward: { xp: 220, gold: 10, choices: [spec(EquipSlot.Feet, Rarity.Uncommon, 2)] },
    intro:
      'The blightrats have found my cellar and my good barrels. Cull six before they sour the whole cask, and these old travelling boots are yours.',
    progress: 'The rats nest among the barrels below the inn — six should break them.',
    complete: 'Quiet down there at last. My cider thanks you, and so do I.',
  },
  {
    id: 'q_lost_tankards',
    name: 'The Lost Tankards',
    giver: 'innkeepMirabel',
    minLevel: 2,
    objectives: [
      {
        kind: 'explore',
        target: 'millRoadDitch',
        label: 'Search the mill road for the strayed cart',
        x: 1360,
        z: 1660,
        radius: 10,
      },
    ],
    reward: { xp: 170, gold: 12 },
    intro:
      'A carter tipped my ale-cart into the ditch on the mill road and fled, the coward. Walk the road west and find where my tankards spilled.',
    progress: 'The cart went over somewhere along the mill road, west toward Millstead.',
    complete: 'Every tankard accounted for. You have an honest pair of eyes, Wayfarer.',
  },
  {
    id: 'q_a_dog_named_biscuit',
    name: 'A Dog Named Biscuit',
    giver: 'houndmasterPella',
    minLevel: 2,
    objectives: [
      {
        kind: 'explore',
        target: 'brookBankReeds',
        label: 'Find Biscuit down by the brook',
        x: 1600,
        z: 1620,
        radius: 10,
      },
    ],
    reward: { xp: 200, gold: 8, choices: [spec(EquipSlot.Amulet, Rarity.Uncommon, 3)] },
    intro:
      'My best pup slipped her lead chasing a coney and hasn’t come home. Look for Biscuit down among the brook reeds, south of the village — she answers to a whistle.',
    progress: 'Biscuit ran off toward the brook; the reeds south of Brookhollow are thick.',
    complete: 'There’s my girl! Muddy to the ears but whole. Take this — it was my grandmother’s.',
  },
  {
    id: 'q_young_fangs',
    name: 'Young Fangs',
    giver: 'houndmasterPella',
    minLevel: 3,
    objectives: [
      { kind: 'kill', target: 'mossfangWolf', count: 5, label: 'Yearling wolves culled' },
    ],
    reward: { xp: 300, gold: 14, choices: [spec(EquipSlot.Hands, Rarity.Uncommon, 4)] },
    intro:
      'A young pack has come down off the treeline, bold and hungry. Cull five before they learn that lambs are easier than coneys.',
    progress: 'The yearling Mossfang Wolves range the eastern edge of the Vale.',
    complete: 'Five fewer to teach the rest bad habits. Good hunting.',
  },
  {
    id: 'q_pelts_for_winter',
    name: 'Pelts for Winter',
    giver: 'houndmasterPella',
    minLevel: 4,
    objectives: [{ kind: 'collect', target: 'wolfPelt', count: 6, label: 'Wolf pelts gathered' }],
    reward: { xp: 340, gold: 16 },
    intro:
      'Winter comes to the Vale whether we’re ready or not. Bring me six good wolf pelts and the kennel-hands will sleep warm.',
    progress: 'Mossfang Wolves along the treeline carry the thickest pelts.',
    complete: 'Six fine pelts — that’s the kennels seen through the frost. My thanks.',
  },
  {
    id: 'q_scarecrows_watch',
    name: "The Scarecrow's Watch",
    giver: 'farmerBressel',
    minLevel: 3,
    objectives: [
      {
        kind: 'explore',
        target: 'valeWestField',
        label: 'Raise the scarecrow in the west field',
        x: 1440,
        z: 1600,
        radius: 10,
      },
      { kind: 'kill', target: 'blightrat', count: 3, label: 'Field vermin driven off' },
    ],
    reward: { xp: 260, gold: 12 },
    intro:
      'The west field’s scarecrow blew flat in the last storm and the vermin know it. Set it upright again and thin three of the blightrats while you’re out there.',
    progress: 'The fallen scarecrow lies in the west field; clear a few rats around it.',
    complete: 'Standing tall and the field’s quiet. That’ll hold the crop till harvest.',
  },
  {
    id: 'q_boar_king_of_the_meadow',
    name: 'King of the Meadow',
    giver: 'farmerBressel',
    minLevel: 4,
    objectives: [
      { kind: 'kill', target: 'thornbackBoar', count: 8, label: 'Thornback Boars culled' },
    ],
    reward: { xp: 360, gold: 18, choices: [spec(EquipSlot.Legs, Rarity.Uncommon, 4)] },
    intro:
      'The boars have bred past all sense this year — a whole meadow-court of them. Cull eight and remind them who farms this ground.',
    progress: 'The Thornback herd churns the meadow east of the fountain.',
    complete: 'Eight! The meadow’s mine again. Take these — good stout leggings for a boar-hunter.',
  },
  {
    id: 'q_marsh_pests',
    name: 'Pests in the Reeds',
    giver: 'wardenTuck',
    minLevel: 3,
    objectives: [{ kind: 'kill', target: 'marshSlime', count: 6, label: 'Marsh Slimes dissolved' }],
    reward: { xp: 280, gold: 12 },
    intro:
      'The millpond’s gone thick with slimes and they foul the wheel-race. Break six and the mill can grind again.',
    progress: 'Marsh Slimes ooze through the reeds around the Millstead pond.',
    complete: 'The race runs clear. Simple work, but the mill won’t turn without it. Well done.',
  },
  {
    id: 'q_slime_and_punishment',
    name: 'Rendered Down',
    giver: 'wardenTuck',
    minLevel: 4,
    objectives: [{ kind: 'collect', target: 'slimeCore', count: 4, label: 'Slime cores rendered' }],
    reward: { xp: 300, gold: 14, choices: [spec(EquipSlot.Chest, Rarity.Uncommon, 5)] },
    intro:
      'The tanner swears slime-cores cure leather like nothing else. Bring me four and I’ll have him run you up a jerkin.',
    progress: 'Marsh Slimes near the millpond carry a core in their heart.',
    complete: 'Four cores — the tanner’s delighted. Here’s the jerkin he promised. Wear it well.',
  },
  {
    id: 'q_road_brands',
    name: 'Brands of the Old Road',
    giver: 'wardenTuck',
    minLevel: 5,
    objectives: [
      { kind: 'collect', target: 'banditBrand', count: 4, label: 'Brigand brands taken' },
    ],
    reward: { xp: 320, gold: 16 },
    intro:
      'Every brigand on the Old Road wears the same burned brand. Bring me four so I can show the Elder who we’re truly dealing with.',
    progress: 'The Road Bandits waylay carts east of Millstead; each carries a brand.',
    complete: 'The same mark on all four — this is no rabble, it’s a crew. Good. Now we know.',
  },
  {
    id: 'q_elders_archive',
    name: "The Elder's Errand",
    giver: 'elderMaris',
    turnIn: 'innkeepMirabel',
    minLevel: 2,
    objectives: [
      { kind: 'talk', target: 'innkeepMirabel', label: 'Carry word to Innkeep Mirabel' },
    ],
    reward: { xp: 170, gold: 10 },
    intro:
      'Do an old woman a kindness — carry this ledger to Mirabel at the inn and tell her the tithe is settled. My knees are done climbing that hill.',
    progress: 'Innkeep Mirabel keeps the common room at the heart of Brookhollow.',
    complete: 'Settled, is it? Bless Maris. Here — a copper for your legs, since you saved hers.',
  },
  {
    id: 'q_the_long_road_begins',
    name: 'The Long Road Begins',
    giver: 'elderMaris',
    minLevel: 5,
    objectives: [
      {
        kind: 'explore',
        target: 'valeWealdRoad',
        label: 'Walk the road toward the Weald',
        x: 1900,
        z: 1560,
        radius: 12,
      },
    ],
    reward: { xp: 380, gold: 16, items: [spec(EquipSlot.Trinket, Rarity.Uncommon, 5)] },
    intro:
      'You’ve the look of one the road is calling. Walk it east awhile, to where the Vale gives way to the Weald, and see the world widen. Then you’ll know if you’re a Wayfarer in truth.',
    progress: 'The east road climbs from the Vale toward Fernwick and the Mossfang Weald.',
    complete:
      'You felt it, didn’t you — the pull of the far country. Take this token. The road is yours now.',
  },

  // --- Mossfang Weald (6–12) ------------------------------------------------
  {
    id: 'q_grove_tending',
    name: 'Grove-Tending',
    giver: 'sisterElowen',
    minLevel: 6,
    objectives: [
      { kind: 'collect', target: 'venomCap', count: 4, label: 'Blighted caps cleansed' },
    ],
    reward: { xp: 360, gold: 16 },
    intro:
      'The chapel garden borders the blight, and its caps creep closer each dawn. Gather four so I may burn them on hallowed ground before they root.',
    progress: 'Venomcap Spriggans shed their caps in the deep Weald east of Fernwick.',
    complete: 'Cleansed and ash. The garden breathes easier — and so do I. Go with grace.',
  },
  {
    id: 'q_blessing_of_the_spring',
    name: 'Blessing of the Spring',
    giver: 'sisterElowen',
    minLevel: 7,
    objectives: [
      {
        kind: 'explore',
        target: 'fernwickSpring',
        label: 'Bless the old spring above Fernwick',
        x: 2400,
        z: 1480,
        radius: 10,
      },
    ],
    reward: { xp: 340, gold: 14, choices: [spec(EquipSlot.Amulet, Rarity.Uncommon, 8)] },
    intro:
      'The old spring above the village has gone bitter with the blight in the ground. Carry this blessed water up and pour it at the source — the spring remembers kindness.',
    progress: 'The spring rises on the wooded slope north of Fernwick.',
    complete:
      'Sweet water again — I can taste it from here. The Weald owes you a small mercy. Take this charm.',
  },
  {
    id: 'q_wounded_rangers',
    name: 'The Wounded Rangers',
    giver: 'sisterElowen',
    minLevel: 8,
    objectives: [
      { kind: 'kill', target: 'briarGoblin', count: 6, label: 'Goblin raiders punished' },
    ],
    reward: { xp: 440, gold: 20, choices: [spec(EquipSlot.Chest, Rarity.Uncommon, 8)] },
    intro:
      'Three of Roswald’s rangers lie in my chapel, cut down by a goblin raid. I am a healer, not a judge — but even I say six of the brutes would balance the ledger.',
    progress: 'The Briar Goblins that raided the patrol camp in the deep Weald.',
    complete: 'The rangers will mend. You’ve given them justice and me a quiet heart. Bless you.',
  },
  {
    id: 'q_spriggan_seedlings',
    name: 'Seedlings of Rot',
    giver: 'herbalistFenn',
    minLevel: 8,
    objectives: [
      { kind: 'kill', target: 'venomcapSpriggan', count: 8, label: 'Spriggan seedlings burned' },
    ],
    reward: { xp: 480, gold: 22 },
    intro:
      'For every spriggan we burn, two seedlings sprout in the loam. Cut eight of the young ones now, while their caps are soft, or we lose the whole east wood.',
    progress: 'Young Venomcap Spriggans sprout thick in the deep Weald.',
    complete:
      'Eight fewer to seed the rot. It’s a war of patience, this. Thank you for your part in it.',
  },
  {
    id: 'q_heartwood_harvest',
    name: 'Heartwood',
    giver: 'herbalistFenn',
    minLevel: 10,
    objectives: [
      { kind: 'collect', target: 'heartwood', count: 4, label: 'Uncorrupted heartwood taken' },
    ],
    reward: { xp: 540, gold: 24, choices: [spec(EquipSlot.Hands, Rarity.Rare, 10)] },
    intro:
      'Even a walking Treant keeps one sound ring at its core — heartwood the blight hasn’t reached. Fell four and cut me their hearts; I can brew a true cure from clean wood.',
    progress: 'Hollowroot Treants stalk the deep Weald; the heartwood lies at their core.',
    complete:
      'Clean heartwood, all four. This is the first honest medicine I’ve brewed in a season. Take these gloves — a healer’s hands should be guarded.',
  },
  {
    id: 'q_ash_of_the_weald',
    name: 'Ash of the Weald',
    giver: 'rangerAsh',
    minLevel: 7,
    objectives: [
      { kind: 'kill', target: 'mossfangWolf', count: 6, label: 'Gate-road wolves thinned' },
    ],
    reward: { xp: 380, gold: 18, choices: [spec(EquipSlot.Feet, Rarity.Uncommon, 8)] },
    intro:
      'Name’s Ash — I keep the Mossgate road, and the wolves keep testing me. Thin six and I’ll trust you to walk it after dark.',
    progress: 'Mossfang Wolves prowl the road between Mossgate and Fernwick.',
    complete:
      'Six down. You’ve a hunter’s patience — rare in a road-walker. These boots have carried me a hundred leagues; take them.',
  },
  {
    id: 'q_stag_of_glades',
    name: 'Antler and Glade',
    giver: 'rangerAsh',
    minLevel: 8,
    objectives: [
      { kind: 'collect', target: 'stagAntler', count: 3, label: 'Shed antlers gathered' },
    ],
    reward: { xp: 420, gold: 20 },
    intro:
      'The dire-stags shed their antlers in the glades this month — good horn for arrow-nocks and toggles. Gather three; you needn’t kill for them if you find them cast.',
    progress: 'The Dire Stags range the Weald glades; look where they bed down.',
    complete:
      'Three fine racks. My fletcher will kiss you. Fair trade for a walk in the glades, eh?',
  },
  {
    id: 'q_the_deep_trail',
    name: 'The Deep Trail',
    giver: 'rangerAsh',
    minLevel: 9,
    objectives: [
      {
        kind: 'explore',
        target: 'deepWealdTrail',
        label: 'Blaze the trail into the deep Weald',
        x: 2540,
        z: 1420,
        radius: 12,
      },
    ],
    reward: { xp: 460, gold: 22, items: [spec(EquipSlot.Legs, Rarity.Uncommon, 10)] },
    intro:
      'I want a marked trail into the deep wood before the blight swallows the old blazes. Walk to the far east thicket and cut fresh marks as you go.',
    progress: 'The old trail runs east into the deepest, darkest part of the Weald.',
    complete:
      'A trail a patrol can follow — that’s worth more than a dozen dead goblins. Take these; the brambles are cruel out there.',
  },
  {
    id: 'q_bandit_tollgate',
    name: 'The Tollgate',
    giver: 'captainRoswald',
    minLevel: 8,
    objectives: [
      { kind: 'kill', target: 'banditArcher', count: 6, label: 'Toll-brigands scattered' },
    ],
    reward: { xp: 460, gold: 22, choices: [spec(EquipSlot.MainHand, Rarity.Uncommon, 9)] },
    intro:
      'Brigands have strung a false tollgate across the Weald road and rob every cart that stops. Scatter six of their archers and tear the gate down.',
    progress: 'The bandit archers hold their tollgate on the Weald road south of Fernwick.',
    complete:
      'Gate down, brigands run. The carters can trade again. Pick a blade from the rack — you’ve earned it.',
  },
  {
    id: 'q_blackfletch_bounty',
    name: 'Black Fletchings',
    giver: 'captainRoswald',
    minLevel: 10,
    objectives: [
      {
        kind: 'collect',
        target: 'blackFletch',
        count: 5,
        label: 'Black-fletched arrows collected',
      },
    ],
    reward: { xp: 520, gold: 26, choices: [spec(EquipSlot.Trinket, Rarity.Rare, 11)] },
    intro:
      'One archer-band fletches black — the same crew that killed my sergeant. Bring me five of their arrows and I’ll know they’ve been made to pay.',
    progress: 'The black-fletched archers haunt the Weald road and the tollgate ruins.',
    complete:
      'Five black arrows. My sergeant can rest. This charm was his — I’d have it walk with a fighter, not sit in a drawer.',
  },
  {
    id: 'q_mossgate_couriers',
    name: 'Word to the Captain',
    giver: 'rangerAsh',
    turnIn: 'captainRoswald',
    minLevel: 8,
    objectives: [
      { kind: 'talk', target: 'captainRoswald', label: 'Carry the muster to Captain Roswald' },
    ],
    reward: { xp: 360, gold: 16 },
    intro:
      'The Mossgate watch is stretched thin and I can’t leave the road. Carry my muster-count to Captain Roswald at Fernwick — he’ll want the numbers before he marches.',
    progress: 'Captain Roswald keeps the war-camp at Fernwick, west of the plaza.',
    complete:
      'Ash’s numbers, good. Thinner than I’d like, but honest. My thanks for the legs, Wayfarer.',
  },
  {
    id: 'q_treewalkers',
    name: 'The Treewalkers',
    giver: 'scoutBramble',
    minLevel: 11,
    objectives: [
      { kind: 'kill', target: 'hollowrootTreant', count: 3, label: 'Treewalkers felled' },
    ],
    reward: { xp: 560, gold: 28, choices: [spec(EquipSlot.Chest, Rarity.Rare, 11)] },
    intro:
      'Three more trees have pulled their roots and started walking toward the Mossgate palisade. Fell them before they reach the wall — slow work, but a wall’s worth it.',
    progress: 'The Hollowroot Treants lumber through the deep Weald toward Mossgate.',
    complete: 'Timber, and the wall stands. You swing well for a road-walker. This mail’s yours.',
  },
  {
    id: 'q_the_pale_trail',
    name: 'The Pale Trail',
    giver: 'scoutBramble',
    minLevel: 10,
    objectives: [
      {
        kind: 'explore',
        target: 'wealdPaleGlade',
        label: 'Track the pale spoor to the glade',
        x: 2300,
        z: 1560,
        radius: 10,
      },
    ],
    reward: { xp: 420, gold: 20 },
    intro:
      'There’s a pale spoor through the western glades — bigger than any stag I know. Track it to its bed and tell me what walks the Weald that I haven’t named.',
    progress: 'The pale trail winds through the western Weald glades.',
    complete: 'A stag the colour of bone… I’ll mark it on the watch-maps. Good tracking, Wayfarer.',
  },
  {
    id: 'q_fenn_field_notes',
    name: "The Herbalist's Notes",
    giver: 'herbalistFenn',
    turnIn: 'scoutBramble',
    minLevel: 11,
    objectives: [
      { kind: 'talk', target: 'scoutBramble', label: "Take Fenn's notes to Scout Bramble" },
    ],
    reward: { xp: 420, gold: 18, items: [spec(EquipSlot.Head, Rarity.Uncommon, 11)] },
    intro:
      'My field-notes map where the blight wells up — Bramble at Mossgate should have them to plan the patrols. Carry them for me; my place is here in the grove.',
    progress: 'Scout Bramble watches the road from Mossgate, north-west of Fernwick.',
    complete:
      'Fenn’s blight-map — this is gold for a scout. Take this hood; the Weald rain is unkind.',
  },

  // --- Stonejaw Foothills (12–16) -------------------------------------------
  {
    id: 'q_shaft_seven',
    name: 'Shaft Seven',
    giver: 'minerJossa',
    minLevel: 12,
    objectives: [{ kind: 'kill', target: 'stonejawGrub', count: 6, label: 'Shaft grubs cleared' }],
    reward: { xp: 560, gold: 26, choices: [spec(EquipSlot.Hands, Rarity.Rare, 13)] },
    intro:
      'Shaft Seven’s mine now — I dug it, I name it — and the grubs have taken it back. Clear six and I’ll get my crew down the ladder again.',
    progress: 'Stonejaw Grubs chew through Shaft Seven, in the workings north of Grubbers’ Rest.',
    complete:
      'Seven’s workable. You’d make a fair miner if the sun ever bored you. Here — pit-gloves, best I’ve got.',
  },
  {
    id: 'q_mineral_plates',
    name: 'Mineral Plates',
    giver: 'minerJossa',
    minLevel: 13,
    objectives: [
      { kind: 'collect', target: 'grubPlate', count: 4, label: 'Mineral plates salvaged' },
    ],
    reward: { xp: 600, gold: 30 },
    intro:
      'The grubs armour themselves in mineral plate — richer ore than we pull from the seam some weeks. Bring me four and the smith will melt them down.',
    progress: 'Stonejaw Grubs carry the plates on their backs, deep in the workings.',
    complete: 'Four good plates. That’s a week’s smelting saved. The Rest thanks you.',
  },
  {
    id: 'q_lantern_oil',
    name: 'Lantern Oil',
    giver: 'minerJossa',
    minLevel: 12,
    objectives: [
      {
        kind: 'explore',
        target: 'foothillCaveStore',
        label: 'Reach the flooded cave store',
        x: 700,
        z: 1400,
        radius: 12,
      },
    ],
    reward: { xp: 480, gold: 22 },
    intro:
      'We cached a winter’s worth of lantern oil in the west caves and now the way’s gone dark and dripping. Push through to the store and see if the barrels held.',
    progress: 'The cave store lies in the flooded western caves, toward Gloomroot.',
    complete:
      'Barrels sound and sealed — that’s the season’s light saved. Brave, going in there alone.',
  },
  {
    id: 'q_bat_roost',
    name: 'The Roost',
    giver: 'quartermasterVell',
    minLevel: 12,
    objectives: [{ kind: 'kill', target: 'caveBat', count: 8, label: 'Cave Bats culled' }],
    reward: { xp: 500, gold: 24, choices: [spec(EquipSlot.Feet, Rarity.Uncommon, 12)] },
    intro:
      'The bats roost above the supply cave and foul every crate they hang over. Cull eight and I might keep the flour clean for once.',
    progress: 'Cave Bats roost in the cliff-caves ringing Grubbers’ Rest.',
    complete:
      'Clean stores at last. Quartermaster’s nightmare, that lot. Take these — dry feet, dry temper.',
  },
  {
    id: 'q_leather_wings',
    name: 'Leather Wings',
    giver: 'quartermasterVell',
    minLevel: 13,
    objectives: [{ kind: 'collect', target: 'batWing', count: 5, label: 'Bat-wing leather cut' }],
    reward: { xp: 560, gold: 26, choices: [spec(EquipSlot.Legs, Rarity.Rare, 13)] },
    intro:
      'Bat-wing makes the toughest bellows-leather in the foothills, and the forge is down to scraps. Bring me five good wings.',
    progress: 'The Cave Bats in the cliff-roosts carry the leather I need.',
    complete:
      'Five wings — the forge lives another month. Here, the smith owed me these leggings; now you’re owed.',
  },
  {
    id: 'q_payroll_run',
    name: 'The Payroll Run',
    giver: 'quartermasterVell',
    turnIn: 'bountyClerkAda',
    minLevel: 14,
    objectives: [
      { kind: 'talk', target: 'bountyClerkAda', label: 'Deliver the payroll ledger to Ada' },
    ],
    reward: { xp: 520, gold: 30 },
    intro:
      'The miners’ payroll ledger needs to reach Bounty-Clerk Ada across the Rest before the pay-cart rolls, and I can’t leave the stores. Carry it and don’t dawdle — miners get mean unpaid.',
    progress: 'Bounty-Clerk Ada keeps the board on the far side of Grubbers’ Rest.',
    complete:
      'Ledger’s square to the copper. The cart rolls on time, thanks to your legs. Here’s your cut.',
  },
  {
    id: 'q_gnoll_fetish_hunt',
    name: 'Fetish Hunt',
    giver: 'foremanDurn',
    minLevel: 13,
    objectives: [
      { kind: 'collect', target: 'gnollFetish', count: 4, label: 'Gnoll fetishes taken' },
    ],
    reward: { xp: 620, gold: 30, choices: [spec(EquipSlot.Chest, Rarity.Rare, 14)] },
    intro:
      'The gnolls daub their fetishes with our stolen survey-marks. Bring me four more; the more I read, the better I know what they’re guarding down there.',
    progress: 'The Cave Gnolls den in the caves north of Grubbers’ Rest.',
    complete:
      'Four fetishes, four more pieces of the map. You’re doing a Waymaker’s work, whether you know it or not.',
  },
  {
    id: 'q_gulch_ambush',
    name: 'Gulch Ambush',
    giver: 'bountyClerkAda',
    minLevel: 13,
    objectives: [
      { kind: 'kill', target: 'banditArcher', count: 6, label: 'Gulch archers scattered' },
    ],
    reward: { xp: 600, gold: 36, choices: [spec(EquipSlot.MainHand, Rarity.Rare, 14)] },
    intro:
      'A fresh archer-crew’s worked the south gulch, picking off ore-carts from the ridges. There’s coin on the board for six of them — go collect it.',
    progress: 'The archers hold the high ground over the south gulch below the Rest.',
    complete:
      'Six off the ridges. The carts ride safe and the board pays out. Good bounty, cleanly done.',
  },
  {
    id: 'q_gnoll_warcallers',
    name: 'The War-Callers',
    giver: 'bountyClerkAda',
    minLevel: 14,
    objectives: [
      { kind: 'kill', target: 'caveGnoll', count: 8, label: 'Gnoll war-callers silenced' },
    ],
    reward: { xp: 640, gold: 32, choices: [spec(EquipSlot.Head, Rarity.Rare, 14)] },
    intro:
      'The gnolls have started drumming at dusk — a war-call, Durn says. Silence eight of the callers and maybe the dens stop working themselves up to a raid.',
    progress: 'The Cave Gnolls muster in the caves north of the Rest.',
    complete:
      'The drums stopped at dusk for the first time in a week. That’s your doing. The board thanks you.',
  },
  {
    id: 'q_deep_survey',
    name: 'The Deep Survey',
    giver: 'foremanDurn',
    minLevel: 14,
    objectives: [
      {
        kind: 'explore',
        target: 'gulchBottomSurvey',
        label: 'Survey the bottom of the south gulch',
        x: 520,
        z: 1620,
        radius: 12,
      },
    ],
    reward: { xp: 560, gold: 28 },
    intro:
      'Before I sink another shaft I need the south gulch bottom surveyed — the old maps say there’s good ore, but the old maps say a lot. Walk it and mark what you see.',
    progress: 'The south gulch bottoms out below Grubbers’ Rest.',
    complete:
      'Good ground, by your marks. That’s a shaft I can sell to the guild. Sharp eyes, Wayfarer.',
  },
  {
    id: 'q_grub_queen_nest',
    name: "The Grub-Queen's Nest",
    giver: 'minerJossa',
    minLevel: 15,
    objectives: [
      { kind: 'kill', target: 'stonejawGrub', count: 10, label: 'Nest grubs exterminated' },
    ],
    reward: { xp: 900, gold: 40, choices: [spec(EquipSlot.Head, Rarity.Rare, 15)] },
    intro:
      'They breed from a nest in the deepest working, and until it’s cleared they’ll chew us out of every shaft. Ten of them — clear the nest and buy us a season.',
    progress: 'The grub-nest festers in the deepest cut north of Grubbers’ Rest.',
    complete:
      'Ten grubs and a broken nest. The workings are ours for a good while now. You’ve earned a proper helm.',
  },
  {
    id: 'q_reinforce_the_rest',
    name: 'Reinforce the Rest',
    giver: 'quartermasterVell',
    minLevel: 15,
    objectives: [
      { kind: 'collect', target: 'grubPlate', count: 6, label: 'Mineral plates for the palisade' },
    ],
    reward: { xp: 880, gold: 42, choices: [spec(EquipSlot.Trinket, Rarity.Rare, 15)] },
    intro:
      'If the gnolls raid, our palisade won’t hold a season. Six mineral plates from the grubs and the smith can face the gate in stone-hard scale.',
    progress: 'The Stonejaw Grubs carry the plates through the deep workings.',
    complete:
      'Six plates — the gate’s faced and the Rest can weather a raid. Take this; a quartermaster pays his debts.',
  },

  // --- Glimmerpeaks (18–24) -------------------------------------------------
  {
    id: 'q_marrow_veins',
    name: 'Marrow Veins',
    giver: 'prospectorVayle',
    minLevel: 18,
    objectives: [
      { kind: 'kill', target: 'crystalbackLizard', count: 8, label: 'Crystalbacks culled' },
    ],
    reward: { xp: 1200, gold: 55, choices: [spec(EquipSlot.Hands, Rarity.Rare, 18)] },
    intro:
      'The lizards follow the marrow-veins and foul every seam they cross. Cull eight along the canyon and my prospectors can work the good rock again.',
    progress: 'Crystalback Lizards bask in the glowing canyons above Glimmercamp.',
    complete:
      'Eight off the seam. You swing a fair pick for a Wayfarer. These gauntlets are yours.',
  },
  {
    id: 'q_resonant_scales',
    name: 'Resonant Scales',
    giver: 'prospectorVayle',
    minLevel: 19,
    objectives: [
      { kind: 'collect', target: 'crystalScale', count: 5, label: 'Resonant scales gathered' },
    ],
    reward: { xp: 1300, gold: 60 },
    intro:
      'The lizard-scales still ring with marrow — the assayer pays well for a set that hasn’t gone dead. Bring me five that still sing when you tap them.',
    progress: 'The Crystalback Lizards of the high canyons carry the resonant scales.',
    complete:
      'Five, all singing. The assayer will grumble and pay anyway. Split’s fair — here’s your share.',
  },
  {
    id: 'q_lamp_the_deeps',
    name: 'Lamp the Deeps',
    giver: 'lampwrightNed',
    minLevel: 18,
    objectives: [
      {
        kind: 'explore',
        target: 'glimmerCanyonHead',
        label: 'Set lamps at the canyon head',
        x: 700,
        z: 560,
        radius: 12,
      },
    ],
    reward: { xp: 1100, gold: 50, choices: [spec(EquipSlot.Feet, Rarity.Rare, 18)] },
    intro:
      'I hang the lamps that keep prospectors from walking off a ledge in the dark. The canyon-head lamps have gone out — climb up and relight them for me.',
    progress: 'The canyon head rises north-west of Glimmercamp, above the seams.',
    complete:
      'Lit again, top to bottom. That’s a life or two saved this season, unglamorous as it is. Take these — sure-footed boots for a sure-footed sort.',
  },
  {
    id: 'q_crystal_lamps',
    name: 'Crystal for the Lamps',
    giver: 'lampwrightNed',
    minLevel: 20,
    objectives: [
      {
        kind: 'kill',
        target: 'crystalbackLizard',
        count: 10,
        label: 'Lizards cleared from the lamp-road',
      },
    ],
    reward: { xp: 1400, gold: 64, choices: [spec(EquipSlot.Legs, Rarity.Rare, 20)] },
    intro:
      'A lampwright can’t hang a lamp with lizards nesting on every crag. Clear ten off the lamp-road and I’ll light the whole overlook by nightfall.',
    progress: 'Crystalback Lizards swarm the crags along the overlook lamp-road.',
    complete:
      'Road’s clear, lamps are up, the peaks glitter. Honest light, honest work. These leggings kept me warm up here — now they’re yours.',
  },
  {
    id: 'q_the_singing_shard',
    name: 'The Singing Shard',
    giver: 'lampwrightNed',
    minLevel: 21,
    objectives: [
      {
        kind: 'explore',
        target: 'crystalDeepsLampline',
        label: 'Trace the lamp-line to the Deeps',
        x: 770,
        z: 780,
        radius: 12,
      },
    ],
    reward: { xp: 1300, gold: 60, items: [spec(EquipSlot.Amulet, Rarity.Rare, 21)] },
    intro:
      'My last lamp-line runs right to the mouth of the Deeps, where the crystal sings loudest. Follow it down and tell me if the lamps still burn where no one dares go.',
    progress: 'The lamp-line ends at the mouth of the Crystal Deeps, north-west of camp.',
    complete:
      'Still burning, all the way down — good. That grief in the stone… you heard it too, then. Take this. It rang truest of any I hung.',
  },
  {
    id: 'q_pilgrims_road',
    name: "The Pilgrim's Road",
    giver: 'pilgrimAsha',
    minLevel: 19,
    objectives: [
      {
        kind: 'explore',
        target: 'overlookShrineSteps',
        label: 'Walk the pilgrim steps to the overlook',
        x: 820,
        z: 820,
        radius: 10,
      },
    ],
    reward: { xp: 1150, gold: 52 },
    intro:
      'I am too old to climb the pilgrim steps again, but the shrine at the overlook should not stand unvisited. Walk them for me, and stand a moment where the peaks can see you.',
    progress: 'The pilgrim steps climb to the Crystal Overlook shrine, north-west of camp.',
    complete:
      'You stood where I can’t, and the mountain took your measure. That is prayer enough. Bless you, walker.',
  },
  {
    id: 'q_offerings',
    name: 'Offerings',
    giver: 'pilgrimAsha',
    minLevel: 20,
    objectives: [
      { kind: 'collect', target: 'crystalScale', count: 6, label: 'Bright scales for the shrine' },
    ],
    reward: { xp: 1350, gold: 62, choices: [spec(EquipSlot.Trinket, Rarity.Rare, 20)] },
    intro:
      'The old rite lays bright scales at the shrine, one for each peak that still sings. Six of the lizards’ brightest — the mountain likes a generous hand.',
    progress: 'The Crystalback Lizards of the high canyons shed the brightest scales.',
    complete:
      'Six offered and six accepted, I think. The shrine glimmers. Here — the mountain gives as it takes.',
  },
  {
    id: 'q_the_cold_vigil',
    name: 'The Cold Vigil',
    giver: 'pilgrimAsha',
    minLevel: 22,
    objectives: [
      { kind: 'kill', target: 'crystalbackLizard', count: 8, label: 'Vigil-ground cleared' },
    ],
    reward: { xp: 1500, gold: 70, choices: [spec(EquipSlot.Chest, Rarity.Rare, 22)] },
    intro:
      'A pilgrim must keep the dawn vigil undisturbed, and the lizards will not have it. Clear eight from the vigil-ground so the faithful can kneel in peace.',
    progress: 'Crystalback Lizards infest the vigil-ground above the overlook shrine.',
    complete:
      'The dawn was quiet — truly quiet — for the first time in years. That is your gift to us. Wear this against the cold.',
  },
  {
    id: 'q_isolds_bells',
    name: "The Shrinekeeper's Bells",
    giver: 'shrinekeeperIsold',
    turnIn: 'pilgrimAsha',
    minLevel: 21,
    objectives: [
      { kind: 'talk', target: 'pilgrimAsha', label: 'Carry the shrine-bells to Pilgrim Asha' },
    ],
    reward: { xp: 1100, gold: 50 },
    intro:
      'These consecrated bells belong at the overlook shrine, and Asha keeps the rites there now. Carry them up for me — my duty is the crystal-song below.',
    progress: 'Pilgrim Asha tends the shrine-rites at the Glimmercamp camp.',
    complete:
      'Isold’s bells — I’d know their voice anywhere. The shrine has its music again. Thank you for the climb.',
  },
  {
    id: 'q_shrine_wards',
    name: 'Shrine-Wards',
    giver: 'shrinekeeperIsold',
    minLevel: 22,
    objectives: [
      {
        kind: 'explore',
        target: 'peaksRidgeWard',
        label: 'Renew the ward-stones on the high ridge',
        x: 600,
        z: 520,
        radius: 12,
      },
    ],
    reward: { xp: 1250, gold: 58, items: [spec(EquipSlot.Head, Rarity.Rare, 22)] },
    intro:
      'The ward-stones on the high ridge keep the worst of the blight-song from the camp. They’ve gone quiet — climb the ridge and wake each one with a touched hand.',
    progress: 'The ward-stones stand along the high ridge north of Glimmercamp.',
    complete:
      'The wards hum again — I can feel the camp settle from here. You’ve a steady hand for old work. Take this hood; the ridge wind bites.',
  },
  {
    id: 'q_vayles_claim',
    name: "Vayle's Claim",
    giver: 'prospectorVayle',
    minLevel: 23,
    objectives: [
      { kind: 'kill', target: 'crystalbackLizard', count: 12, label: 'Claim-jumpers cleared' },
    ],
    reward: { xp: 1700, gold: 78, choices: [spec(EquipSlot.MainHand, Rarity.Rare, 23)] },
    intro:
      'I’ve filed a claim on the richest seam left in the peaks, and a whole shardback brood has filed one of their own. Clear twelve and the seam is mine — and yours, in part.',
    progress: 'The shardback brood swarms Vayle’s claim, high in the canyons.',
    complete:
      'The claim’s clear and the assay came back rich. You’ll take a cut, and this pick-hammer besides — it’s bitten better rock than most blades.',
  },
  {
    id: 'q_marrowless',
    name: 'Marrowless',
    giver: 'lampwrightNed',
    minLevel: 24,
    objectives: [
      { kind: 'collect', target: 'crystalScale', count: 8, label: 'Dead scales gathered' },
    ],
    reward: { xp: 1800, gold: 82, choices: [spec(EquipSlot.Legs, Rarity.Rare, 24)] },
    intro:
      'The scales are going dead — dull, marrowless, silent. Bring me eight of the dead ones; if I can’t light lamps with them, at least the assayer can chart how fast the song is dying.',
    progress: 'The Crystalback Lizards of the failing seams shed the marrowless scales.',
    complete:
      'Eight dead scales — and each one a mountain gone quiet. Grim charting. Take these; a walker your size shouldn’t freeze doing my grim errands.',
  },

  // --- Trollmoor Highlands (24–28) ------------------------------------------
  {
    id: 'q_ironhide_cull',
    name: 'The Ironhide Cull',
    giver: 'castellanBrenna',
    minLevel: 24,
    objectives: [
      { kind: 'kill', target: 'ironhideTroll', count: 8, label: 'Ironhide Trolls broken' },
    ],
    reward: { xp: 2000, gold: 95, choices: [spec(EquipSlot.Chest, Rarity.Rare, 24)] },
    intro:
      'The Ironhide war-band presses the keep’s outlands and my garrison is thin. Break eight of the brutes and buy Cairnwick a season’s breathing room.',
    progress: 'The Ironhide Trolls roam the cairns and moors around Cairnwick.',
    complete:
      'Eight broken. The outlands hold another season. You fight like the keep bred you. This mail is yours.',
  },
  {
    id: 'q_carved_tusks',
    name: 'Carved Tusks',
    giver: 'castellanBrenna',
    minLevel: 25,
    objectives: [
      { kind: 'collect', target: 'trollTusk', count: 5, label: 'Carved war-tusks taken' },
    ],
    reward: { xp: 2100, gold: 100 },
    intro:
      'Keld wants every carved tusk we can pull off the war-band — the carvings are Waymaker script, older than the keep. Bring me five and I’ll see them to his desk.',
    progress: 'The Ironhide Trolls carry the carved tusks into the high moor.',
    complete:
      'Five tusks for the loremaster to weep over. Grim trophies, but honest coin. Take your due.',
  },
  {
    id: 'q_peat_drakes',
    name: 'Drakes in the Peat',
    giver: 'huscarlBran',
    minLevel: 25,
    objectives: [{ kind: 'kill', target: 'bogDrake', count: 6, label: 'Bog Drakes slain' }],
    reward: { xp: 1900, gold: 88, choices: [spec(EquipSlot.Feet, Rarity.Rare, 25)] },
    intro:
      'Bran, huscarl of the low watch. The bog drakes have nested in my peat-cuts and taken a cutter. Slay six and the low road is a road again.',
    progress: 'Bog Drakes lair in the peat cuts south of Cairnwick.',
    complete:
      'Six drakes, and the cutters back to work. You’ve the keep’s thanks and mine. Boots for the bog — you’ll want them.',
  },
  {
    id: 'q_drake_scales',
    name: 'Drake-Scale',
    giver: 'huscarlBran',
    minLevel: 26,
    objectives: [
      { kind: 'collect', target: 'drakeScale', count: 5, label: 'Drake-scales stripped' },
    ],
    reward: { xp: 2000, gold: 94, choices: [spec(EquipSlot.Legs, Rarity.Rare, 26)] },
    intro:
      'Drake-scale turns a troll’s club better than good steel. Strip me five and the armourer will plate the low watch before the next raid.',
    progress: 'The Bog Drakes of the peat carry the toughest scale.',
    complete:
      'Five scales — the watch goes armoured. That’s lives, that is. Take these; they’re drake-plated themselves.',
  },
  {
    id: 'q_the_low_road',
    name: 'The Low Road',
    giver: 'huscarlBran',
    minLevel: 26,
    objectives: [
      {
        kind: 'explore',
        target: 'trollmoorPeatCuts',
        label: 'Walk the flooded peat cuts',
        x: 1440,
        z: 600,
        radius: 12,
      },
    ],
    reward: { xp: 1800, gold: 84 },
    intro:
      'The peat-cuts have flooded and I’ve lost the low road under black water. Walk it end to end and mark where a cart can still cross.',
    progress: 'The peat cuts flood the low ground south of Cairnwick.',
    complete:
      'A crossing marked — the low watch can supply itself again. Good legs and a good eye, Wayfarer.',
  },
  {
    id: 'q_cairn_watch',
    name: 'The Cairn Watch',
    giver: 'huscarlBran',
    minLevel: 27,
    objectives: [
      { kind: 'kill', target: 'ironhideTroll', count: 6, label: 'Cairn-trolls driven off' },
    ],
    reward: { xp: 2100, gold: 98, choices: [spec(EquipSlot.MainHand, Rarity.Rare, 27)] },
    intro:
      'Trolls have started toppling the old cairns for the stone in them — and a toppled cairn is a dead watchman’s grave defiled. Drive off six and let the dead keep their houses.',
    progress: 'The Ironhide Trolls work the cairn-fields on the high moor.',
    complete:
      'Six driven off, the cairns standing. The old watch can rest. Here — a blade off a huscarl who won’t need it now. Carry it well.',
  },
  {
    id: 'q_glyph_rubbings',
    name: 'Glyph-Rubbings',
    giver: 'loremasterKeld',
    minLevel: 25,
    objectives: [
      {
        kind: 'explore',
        target: 'cairnGlyphStones',
        label: 'Take rubbings from the north-east cairns',
        x: 1720,
        z: 560,
        radius: 12,
      },
    ],
    reward: { xp: 1800, gold: 82, items: [spec(EquipSlot.Amulet, Rarity.Rare, 25)] },
    intro:
      'The north-east cairns are carved in the old speech, and the trolls topple more each moon. Take rubbings of the glyphs before they’re lost — press the cloth well.',
    progress: 'The glyph-cut cairns stand on the moor north-east of Cairnwick.',
    complete:
      'A whole page of the oldest speech, saved from the rubble. You’ve done history a service today. This charm is copied from those very glyphs — fitting you should have it.',
  },
  {
    id: 'q_keld_dispatch',
    name: "The Loremaster's Dispatch",
    giver: 'loremasterKeld',
    turnIn: 'castellanBrenna',
    minLevel: 26,
    objectives: [
      { kind: 'talk', target: 'castellanBrenna', label: 'Carry Keld’s reading to the Castellan' },
    ],
    reward: { xp: 1700, gold: 80 },
    intro:
      'I’ve read enough of the tusks to trouble the Castellan’s sleep, and she should hear it from the page, not from rumour. Carry my dispatch to Brenna in the keep.',
    progress: 'Castellan Brenna holds the keep at the heart of Cairnwick.',
    complete:
      'So the carvings are a warning after all. Keld’s hand, no mistaking it. Grim news, well carried. My thanks, Wayfarer.',
  },
  {
    id: 'q_old_speech',
    name: 'The Old Speech',
    giver: 'loremasterKeld',
    minLevel: 27,
    objectives: [
      { kind: 'collect', target: 'trollTusk', count: 6, label: 'Inscribed tusks gathered' },
    ],
    reward: { xp: 2200, gold: 104, choices: [spec(EquipSlot.Head, Rarity.Rare, 27)] },
    intro:
      'Every carved tusk is a line of a lost verse, and I’m short the middle of it. Bring me six more of the inscribed ones and I may finally read what the trolls have guarded so long.',
    progress: 'The Ironhide war-band carries the inscribed tusks across the high moor.',
    complete:
      'Six tusks — and with them, the verse entire. It names Ironvein, and what sleeps beneath it. You’ve unlocked a thousand-year silence. Take this; a scholar’s helm for a scholar’s ally.',
  },
  {
    id: 'q_moor_beacons',
    name: 'The Moor Beacons',
    giver: 'castellanBrenna',
    minLevel: 26,
    objectives: [
      {
        kind: 'explore',
        target: 'trollmoorNorthRidge',
        label: 'Relight the north-ridge beacons',
        x: 1400,
        z: 440,
        radius: 12,
      },
    ],
    reward: { xp: 1850, gold: 86 },
    intro:
      'The north-ridge beacons warn the keep of a war-band on the march, and they’ve gone dark one by one. Climb the ridge and relight them — Cairnwick sleeps better for a lit horizon.',
    progress: 'The warning beacons stand along the north ridge above Cairnwick.',
    complete:
      'A line of fire on the ridge again — I can see it from the wall. The keep can sleep. Good climbing, Wayfarer.',
  },
  {
    id: 'q_bogs_bounty',
    name: "The Bog's Bounty",
    giver: 'huscarlBran',
    minLevel: 28,
    objectives: [
      { kind: 'collect', target: 'drakeScale', count: 6, label: 'Prime scales stripped' },
    ],
    reward: { xp: 2300, gold: 108, choices: [spec(EquipSlot.Trinket, Rarity.Rare, 28)] },
    intro:
      'One more haul before the coast calls you — six prime drake-scales, the biggest you can strip. The armourer wants to plate the whole low watch in one before winter.',
    progress: 'The largest Bog Drakes lair in the deep peat south of the keep.',
    complete:
      'Six prime scales — the low watch will winter armoured to the teeth. You’ve done the moor proud. This charm’s drake-bone; may it turn a blow for you.',
  },
  {
    id: 'q_brennas_muster',
    name: "Brenna's Muster",
    giver: 'castellanBrenna',
    minLevel: 28,
    objectives: [{ kind: 'kill', target: 'ironhideTroll', count: 10, label: 'War-band broken' }],
    reward: { xp: 2500, gold: 120, choices: [spec(EquipSlot.Chest, Rarity.Epic, 28)] },
    intro:
      'Before you take the coast road, break the war-band’s back for good — ten of the strongest, and they’ll not muster again this age. Do this, and Cairnwick owes you a debt it can’t pay.',
    progress: 'The Ironhide war-band gathers in strength across the high moor.',
    complete:
      'Ten of their best, broken. The war-band’s finished as a fighting force. Cairnwick will sing your name at the mead-benches. Take the keep’s finest — you’ve more than earned it.',
  },

  // --- Sunlit Coast (28–30) -------------------------------------------------
  {
    id: 'q_tideline_bones',
    name: 'Bones on the Tideline',
    giver: 'harbormasterCole',
    minLevel: 28,
    objectives: [
      { kind: 'kill', target: 'cryptSkeleton', count: 8, label: 'Tideline skeletons scattered' },
    ],
    reward: { xp: 1900, gold: 85, choices: [spec(EquipSlot.Legs, Rarity.Rare, 28)] },
    intro:
      'The walking bones come up with every tide now, right onto my working strand. Scatter eight so my salvagers can pull the wrecks without losing fingers.',
    progress: 'Crypt Skeletons haul themselves along the tideline below Waymeet.',
    complete:
      'Strand’s clear enough to work. You’ve saved a salvager or two a hand. These leggings came off a wreck — good sea-leather, yours now.',
  },
  {
    id: 'q_bone_meal',
    name: 'Bone-Meal',
    giver: 'saltmerchantPryor',
    minLevel: 28,
    objectives: [
      { kind: 'collect', target: 'boneMeal', count: 6, label: 'Ground bone-meal gathered' },
    ],
    reward: { xp: 1950, gold: 88 },
    intro:
      'Salt-Merchant Pryor, at your service — and ground skeleton-bone fetches a fine price as field-meal inland. Bring me six measures and we both profit.',
    progress: 'The Crypt Skeletons of the strand grind down to good bone-meal.',
    complete:
      'Six measures, weighed fair. A grim trade, but coin’s coin and the fields don’t care. Here’s your split.',
  },
  {
    id: 'q_salvage_rights',
    name: 'Salvage Rights',
    giver: 'saltmerchantPryor',
    minLevel: 28,
    objectives: [
      {
        kind: 'explore',
        target: 'coastWreckField',
        label: 'Chart the wreck-field along the strand',
        x: 1840,
        z: 1880,
        radius: 12,
      },
    ],
    reward: { xp: 1850, gold: 84, choices: [spec(EquipSlot.Feet, Rarity.Rare, 28)] },
    intro:
      'Before I bid on salvage rights I need the wreck-field charted — which hulls are worth the danger and which are picked bare. Walk the strand and mark the good ones.',
    progress: 'The wreck-field litters the strand east of Waymeet.',
    complete:
      'Three hulls worth bidding on, by your chart. That’s money in the bidding-room. Take these — dry boots for a wet trade.',
  },
  {
    id: 'q_brine_and_salt',
    name: 'Brine and Salt',
    giver: 'saltmerchantPryor',
    minLevel: 29,
    objectives: [{ kind: 'collect', target: 'brinePearl', count: 5, label: 'Brine-pearls traded' }],
    reward: { xp: 2100, gold: 96, choices: [spec(EquipSlot.Hands, Rarity.Rare, 29)] },
    intro:
      'The drowned carry brine-pearls, and the inland collectors pay a fortune for them — memories, the Archivist calls them, but a merchant calls them stock. Bring me five.',
    progress: 'The Drowned Dead rise from the shallows carrying the brine-pearls.',
    complete:
      'Five pearls, and each one a little fortune. Fine stock. Here — gloves off my best salvager; may they grip as well for you.',
  },
  {
    id: 'q_the_drowned_bell',
    name: 'The Drowned Bell',
    giver: 'harbormasterCole',
    minLevel: 29,
    objectives: [
      { kind: 'kill', target: 'drownedDead', count: 8, label: 'Drowned Dead put to rest' },
    ],
    reward: { xp: 2200, gold: 100, choices: [spec(EquipSlot.MainHand, Rarity.Rare, 29)] },
    intro:
      'A drowned bell tolls under the shallows at each low tide, and the dead answer it, crawling for the crypt. Put eight down and maybe the tide stops giving them up so freely.',
    progress: 'The Drowned Dead haul from the shallows below Waymeet toward the crypt.',
    complete:
      'Eight put to rest, and the bell tolls to a quieter shore tonight. This blade was hauled off a war-wreck; it wants a hand that’ll use it.',
  },
  {
    id: 'q_pier_lanterns',
    name: 'The Pier Lanterns',
    giver: 'harbormasterCole',
    minLevel: 29,
    objectives: [
      {
        kind: 'explore',
        target: 'waymeetPierHead',
        label: 'Relight the lanterns to the pier-head',
        x: 1760,
        z: 1900,
        radius: 10,
      },
    ],
    reward: { xp: 2000, gold: 92 },
    intro:
      'The dead snuffed my pier-lanterns and no boat will make Waymeet blind in the dark. Walk the pier and relight them to the head — mind the boards, they’re rotten in places.',
    progress: 'The pier runs south from Waymeet out over the shallows.',
    complete:
      'Lit to the pier-head — the night boats can make harbour again. Steady nerves, walking that pier alone. My thanks.',
  },
  {
    id: 'q_sentinel_shards',
    name: 'Sentinel-Shards',
    giver: 'archivistSelwynMar',
    minLevel: 29,
    objectives: [
      { kind: 'collect', target: 'runeShard', count: 4, label: 'Rune-shards recovered' },
    ],
    reward: { xp: 2300, gold: 104, choices: [spec(EquipSlot.OffHand, Rarity.Epic, 29)] },
    intro:
      'The Crypt Sentinels are carved over with Waymaker runes, and each one they shed is a page of how the tomb was sealed. Recover four shards; I must know how the seal was made before we break it.',
    progress: 'The Crypt Sentinels ward the flooded gate of the Sunken Crypt.',
    complete:
      'Four shards — and with them, the shape of the seal entire. We can open the way now, whatever waits below. Take this; it’s warded with the very runes you brought me.',
  },
  {
    id: 'q_the_outer_gate',
    name: 'The Outer Gate',
    giver: 'archivistSelwynMar',
    minLevel: 29,
    objectives: [
      {
        kind: 'explore',
        target: 'cryptOuterGate',
        label: 'Reach the outer gate of the Sunken Crypt',
        x: 1720,
        z: 1980,
        radius: 12,
      },
    ],
    reward: { xp: 2200, gold: 100, items: [spec(EquipSlot.Amulet, Rarity.Rare, 29)] },
    intro:
      'Before we dare the crypt itself, I need eyes on the outer gate — how deep the water, how thick the guard. Reach it, and come back to me with what you see. Do not go in.',
    progress: 'The outer gate of the Sunken Crypt lies at the drowned edge of the coast.',
    complete:
      'Flooded to the lintel and Sentinel-guarded, just as the pearls warned. Now we know what we face. Steel yourself, Wayfarer — the last door is close. Take this ward.',
  },
  {
    id: 'q_memory_pearls',
    name: 'Memory-Pearls',
    giver: 'archivistSelwynMar',
    minLevel: 30,
    objectives: [{ kind: 'collect', target: 'brinePearl', count: 6, label: 'Memory-pearls read' }],
    reward: { xp: 2600, gold: 120, choices: [spec(EquipSlot.Head, Rarity.Epic, 30)] },
    intro:
      'Each brine-pearl holds a fragment of the crypt’s own memory, and I would read the whole grief before you face its keeper. Bring me six more — the more I read, the better you’ll understand what you must end.',
    progress: 'The Drowned Dead of the shallows carry the memory-pearls.',
    complete:
      'Six pearls, six fragments — and now I know her whole sorrow. She was not always a monster, Wayfarer. Remember that, down there. Take this; may it keep your head clear when hers was not.',
  },
  {
    id: 'q_shore_watch',
    name: 'The Shore Watch',
    giver: 'saltmerchantPryor',
    minLevel: 30,
    objectives: [
      { kind: 'kill', target: 'cryptSkeleton', count: 10, label: 'Shore-bones scattered' },
    ],
    reward: { xp: 2500, gold: 115, choices: [spec(EquipSlot.Chest, Rarity.Rare, 30)] },
    intro:
      'The whole strand’s crawling now, and my caravans won’t load with bones at the wheels. Scatter ten and hold the shore long enough for one last cart to roll inland.',
    progress: 'Crypt Skeletons swarm the whole strand as the crypt stirs below.',
    complete:
      'Ten scattered and the cart rolled clean. You held the shore, and that’s no small thing at the end of the world’s road. This mail’s yours — a merchant’s poor thanks for a fighter’s work.',
  },
  {
    id: 'q_the_last_lantern',
    name: 'The Last Lantern',
    giver: 'harbormasterCole',
    minLevel: 30,
    objectives: [
      { kind: 'kill', target: 'cryptSentinel', count: 4, label: 'Gate-sentinels shattered' },
    ],
    reward: { xp: 2700, gold: 130, choices: [spec(EquipSlot.Trinket, Rarity.Epic, 30)] },
    intro:
      'The Archivist says the way down opens once the gate-sentinels fall — four of them, warding the flooded threshold. Shatter them and light the last lantern at the gate. Then the crypt is yours to brave.',
    progress: 'Four Crypt Sentinels ward the flooded threshold of the Sunken Crypt.',
    complete:
      'The last lantern burns at the gate, and the way down stands open. Everything the road has made of you waits at the bottom of that dark. Go, Wayfarer — and come back a legend.',
  },
  {
    id: 'q_pryor_ledger',
    name: "Pryor's Ledger",
    giver: 'saltmerchantPryor',
    turnIn: 'harbormasterCole',
    minLevel: 29,
    objectives: [
      {
        kind: 'talk',
        target: 'harbormasterCole',
        label: 'Settle the ledger with Harbormaster Cole',
      },
    ],
    reward: { xp: 1900, gold: 88 },
    intro:
      'My salvage ledger and Cole’s harbour-tolls have drifted apart, and neither of us will cross the strand to argue it. Carry my figures to the Harbormaster and let the two of you square it.',
    progress: 'Harbormaster Cole keeps the harbour-office on the Waymeet waterfront.',
    complete:
      'Pryor’s figures against mine — square to the copper, the old rogue. Tell him we’re even. And here’s a coin for saving me the walk.',
  },
];
