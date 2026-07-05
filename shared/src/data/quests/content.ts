// Starter quest content (GDD §8, WORLD.md §3.1–3.2). A vertical slice of the quest
// system exercising every objective kind: explore, kill, collect, use, talk (with a
// cross-NPC turn-in), and boss. The full ~110-quest budget is filled in later Phase-4
// parts; this proves the engine end to end. Pure data.

import { EquipSlot, Rarity } from '../items.js';
import type { QuestDef, QuestGiver } from './schema.js';

/** Named quest-giver NPCs, anchored to settlement plazas (client renders them). */
export const QUEST_GIVERS: readonly QuestGiver[] = [
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
];

/**
 * Enemies that drop a quest "collect" tag on death (deterministic, 100% for quest
 * flow). The client emits a `collect` event with the tag when the enemy dies.
 */
export const QUEST_DROP_TAGS: Record<string, string> = {
  blightrat: 'ratTail',
};

// Class-agnostic item specs (the client fills `forClass` from the player at grant).
const spec = (
  slot: EquipSlot,
  rarity: Rarity,
  reqLevel: number,
): { slot: EquipSlot; rarity: Rarity; reqLevel: number } => ({ slot, rarity, reqLevel });

export const QUESTS: readonly QuestDef[] = [
  // --- Brookhollow tutorial arc (Heartmead Vale) ---
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

  // --- Main story: The Waymaker's Path, chapter 1 ---
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

  // --- Hollow lead-in (boss objective) ---
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
