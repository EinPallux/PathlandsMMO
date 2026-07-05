// Deeds & Path-Point rewards (GDD §10). Deeds are achievements across exploration,
// combat, quests, and professions; completing one awards account Path Points spent on
// perks (perks.ts). Pure data + a helper. The client feeds progress events; the engine
// (shared/meta/deeds.ts) tracks completion.

export enum DeedCategory {
  Exploration = 'exploration',
  Combat = 'combat',
  Quests = 'quests',
  Professions = 'professions',
}

export interface DeedDef {
  id: string;
  name: string;
  description: string;
  category: DeedCategory;
  /** Counter this deed advances on (a MetaEvent metric). */
  metric: string;
  /** Progress needed to complete. */
  threshold: number;
  /** Path Points awarded on completion (GDD §10: 1–5 by difficulty). */
  pathPoints: number;
}

export const DEEDS: readonly DeedDef[] = [
  // --- Exploration ---
  {
    id: 'd_wayfarer',
    name: 'Wayfarer',
    description: 'Attune 3 Waystones.',
    category: DeedCategory.Exploration,
    metric: 'waystone',
    threshold: 3,
    pathPoints: 1,
  },
  {
    id: 'd_pathfinder',
    name: 'Pathfinder',
    description: 'Attune 8 Waystones.',
    category: DeedCategory.Exploration,
    metric: 'waystone',
    threshold: 8,
    pathPoints: 2,
  },
  // --- Combat ---
  {
    id: 'd_first_blood',
    name: 'First Blood',
    description: 'Slay 10 foes.',
    category: DeedCategory.Combat,
    metric: 'kill',
    threshold: 10,
    pathPoints: 1,
  },
  {
    id: 'd_slayer',
    name: 'Slayer',
    description: 'Slay 150 foes.',
    category: DeedCategory.Combat,
    metric: 'kill',
    threshold: 150,
    pathPoints: 2,
  },
  {
    id: 'd_hollow_delver',
    name: 'Hollow-Delver',
    description: 'Defeat a Hollow boss.',
    category: DeedCategory.Combat,
    metric: 'boss',
    threshold: 1,
    pathPoints: 3,
  },
  {
    id: 'd_hollow_master',
    name: 'Hollow-Master',
    description: 'Defeat 3 Hollow bosses.',
    category: DeedCategory.Combat,
    metric: 'boss',
    threshold: 3,
    pathPoints: 4,
  },
  // --- Quests ---
  {
    id: 'd_helping_hand',
    name: 'Helping Hand',
    description: 'Complete 5 quests.',
    category: DeedCategory.Quests,
    metric: 'quest',
    threshold: 5,
    pathPoints: 1,
  },
  {
    id: 'd_the_waymakers_path',
    name: "The Waymaker's Path",
    description: 'Complete 15 quests.',
    category: DeedCategory.Quests,
    metric: 'quest',
    threshold: 15,
    pathPoints: 3,
  },
  // --- Professions ---
  {
    id: 'd_apprentice',
    name: 'Apprentice',
    description: 'Reach 25 skill in a gathering profession.',
    category: DeedCategory.Professions,
    metric: 'gatherSkill25',
    threshold: 1,
    pathPoints: 1,
  },
  {
    id: 'd_artisan',
    name: 'Artisan',
    description: 'Craft 10 items.',
    category: DeedCategory.Professions,
    metric: 'craft',
    threshold: 10,
    pathPoints: 2,
  },
];

const DEED_BY_ID = new Map<string, DeedDef>(DEEDS.map((d) => [d.id, d]));
export function deedById(id: string): DeedDef | undefined {
  return DEED_BY_ID.get(id);
}
