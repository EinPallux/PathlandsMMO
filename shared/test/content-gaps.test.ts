// Content gap-fill audit (Phase 5). The existing quests.test.ts already proves
// referential integrity (givers/prereqs/objective targets resolve, main story is
// reachable). This file adds the *coverage* checks a playtester would otherwise hit
// the hard way: a town with a shop tier but no merchant, a zone with no spawns or no
// waystone, a settlement with no quest-giver, a collect-quest whose only source enemy
// lives in a wildly different level band. These are the "no dead corners" half of the
// Phase-5 acceptance bar (criterion #2).

import { describe, it, expect } from 'vitest';
import {
  QUESTS,
  QUEST_GIVERS,
  QUEST_DROP_TAGS,
  SETTLEMENTS,
  SETTLEMENT_TIER,
  WAYSTONES,
  WORLD_SPAWNS,
  enemyById,
  WORLD_SEED,
} from '../src/index.js';
import { World } from '../src/worldgen/world.js';
import { Biome, BIOME_COUNT } from '../src/worldgen/biomes.js';

const world = new World(WORLD_SEED);
const ALL_BIOMES = Array.from({ length: BIOME_COUNT }, (_, i) => i as Biome);

// dropTag → the enemy that drops it (reverse of the enemyId→tag map).
const TAG_TO_SOURCE = new Map(Object.entries(QUEST_DROP_TAGS).map(([enemy, tag]) => [tag, enemy]));

describe('Content audit — every town can actually sell', () => {
  const npcs = world.authored.npcSpawns();
  // A settlement's vendor NPC ids are `${settlementId}-npc0` etc.; match by prefix.
  const vendorTowns = new Set(
    npcs.filter((n) => n.kind === 'vendor').map((n) => n.id.replace(/-npc\d+$/, '')),
  );

  it('every settlement with a vendor tier has a merchant NPC placed', () => {
    for (const s of SETTLEMENTS) {
      if (SETTLEMENT_TIER[s.id] === undefined) continue;
      expect(vendorTowns.has(s.id), `${s.id} (tier ${SETTLEMENT_TIER[s.id]}) has no merchant`).toBe(
        true,
      );
    }
  });

  it('no settlement is left shopless (all eight towns sell)', () => {
    for (const s of SETTLEMENTS) {
      expect(vendorTowns.has(s.id), `${s.id} shopless`).toBe(true);
    }
  });
});

describe('Content audit — every zone has content', () => {
  const biomeOf = (x: number, z: number): Biome => world.biomeAt(x, z);

  it('every one of the six zones has at least one enemy spawn region', () => {
    const covered = new Set(WORLD_SPAWNS.map((r) => biomeOf(r.cx, r.cz)));
    for (const b of ALL_BIOMES) {
      expect(covered.has(b), `${Biome[b]} has no spawns`).toBe(true);
    }
  });

  it('every one of the six zones has at least one Waystone', () => {
    const covered = new Set(WAYSTONES.map((w) => biomeOf(w.x, w.z)));
    for (const b of ALL_BIOMES) {
      expect(covered.has(b), `${Biome[b]} has no waystone`).toBe(true);
    }
  });
});

describe('Content audit — every settlement anchors a quest-giver', () => {
  it('no town is a dead stop — each has at least one quest-giver', () => {
    const withGiver = new Set(QUEST_GIVERS.map((g) => g.settlement));
    for (const s of SETTLEMENTS) {
      expect(withGiver.has(s.id), `${s.id} has no quest-giver`).toBe(true);
    }
  });
});

describe('Content audit — collect quests are doable at their level', () => {
  it("a collect drop's source enemy is fightable near the quest's level", () => {
    // The source enemy's spawn band must overlap the quest's playable window, or the
    // player is sent to farm something out of reach. Generous window: a quest is
    // typically done from minLevel up a few levels.
    for (const q of QUESTS) {
      for (const o of q.objectives) {
        if (o.kind !== 'collect') continue;
        const source = TAG_TO_SOURCE.get(o.target);
        expect(source, `${q.id}: no source for tag '${o.target}'`).toBeDefined();
        const def = enemyById(source!);
        expect(def, `${q.id}: source enemy ${source} missing`).toBeDefined();
        const [lo, hi] = def!.band;
        const windowLo = q.minLevel - 3;
        const windowHi = q.minLevel + 8;
        const overlaps = lo <= windowHi && hi >= windowLo;
        expect(
          overlaps,
          `${q.id}(L${q.minLevel}) collects '${o.target}' from ${source} (band ${lo}-${hi}) — out of reach`,
        ).toBe(true);
      }
    }
  });
});
