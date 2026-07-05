// Quest content barrel + lookups (GDD §8).

export * from './schema.js';
export * from './content.js';

import { QUESTS } from './content.js';
import { QUEST_GIVERS } from './content.js';
import type { QuestDef, QuestGiver } from './schema.js';

const QUEST_BY_ID = new Map<string, QuestDef>(QUESTS.map((q) => [q.id, q]));
const GIVER_BY_ID = new Map<string, QuestGiver>(QUEST_GIVERS.map((g) => [g.id, g]));

export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID.get(id);
}

export function questGiverById(id: string): QuestGiver | undefined {
  return GIVER_BY_ID.get(id);
}
