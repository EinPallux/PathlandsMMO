// World events (WORLD.md §4, Phase 4 Part 17). The Phase-4 stub is one repeatable
// solo world-boss event, "Restore the Grand Waystone", built on the ordinary spawn →
// loot → kill pipeline. These verify the event's boss, Deed, spawn region, and
// signature all resolve and stay in sync — so the encounter is real, not a dangling
// reference.

import { describe, it, expect } from 'vitest';
import {
  WORLD_EVENTS,
  GRAND_WAYSTONE_EVENT,
  worldEventForBoss,
  WORLD_SPAWNS,
  enemyById,
  EnemyRank,
  deedById,
  bossSignature,
  DEEDS,
} from '../src/index.js';

describe('World event: Restore the Grand Waystone', () => {
  it('every world event points at a real Boss-rank enemy', () => {
    expect(WORLD_EVENTS.length).toBeGreaterThanOrEqual(1);
    for (const e of WORLD_EVENTS) {
      const boss = enemyById(e.bossId);
      expect(boss, `${e.id} boss ${e.bossId}`).toBeDefined();
      expect(boss!.rank).toBe(EnemyRank.Boss);
    }
  });

  it('each event has a real Deed whose metric is fed on the kill', () => {
    for (const e of WORLD_EVENTS) {
      const deed = deedById(e.deedId);
      expect(deed, `${e.id} deed ${e.deedId}`).toBeDefined();
      // The client feeds the literal 'worldEvent' metric on the world-boss kill; the
      // Deed must listen on it or it can never complete.
      expect(deed!.metric).toBe('worldEvent');
      expect(deed!.pathPoints).toBeGreaterThan(0);
    }
  });

  it('each event boss is world-spawned at the event site (no coord drift)', () => {
    for (const e of WORLD_EVENTS) {
      const region = WORLD_SPAWNS.find((r) => r.enemyId === e.bossId);
      expect(region, `${e.bossId} spawn region`).toBeDefined();
      expect(region!.cx).toBe(e.cx);
      expect(region!.cz).toBe(e.cz);
      expect(region!.count).toBe(1); // a single world boss
    }
  });

  it('each event boss drops a signature unique (endgame reward)', () => {
    for (const e of WORLD_EVENTS) {
      expect(bossSignature(e.bossId), `${e.bossId} signature`).toBeDefined();
    }
  });

  it('worldEventForBoss resolves the warden and only the warden', () => {
    expect(worldEventForBoss('bossGrandWarden')).toBe(GRAND_WAYSTONE_EVENT);
    expect(worldEventForBoss('bossLastWaymaker')).toBeUndefined();
    expect(worldEventForBoss('thornbackBoar')).toBeUndefined();
  });

  it('exactly one Deed uses the worldEvent metric (the restorer)', () => {
    const restorers = DEEDS.filter((d) => d.metric === 'worldEvent');
    expect(restorers).toHaveLength(1);
    expect(restorers[0]!.id).toBe('d_waystone_restorer');
  });
});
