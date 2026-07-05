// Deterministic enemy spawners (GDD §4, WORLD.md spawn tables). A region keeps a
// target population of an enemy type alive within a radius; dead enemies respawn
// after a timer. Positions/levels come from stateless spatial hashing, so the same
// region + tick yields the same spawns on any machine. Pure.

import { hashFloat2, hash2 } from '../core/rng.js';
import { WORLD_SEED } from '../core/constants.js';
import { makeEnemyById, type CombatEntity } from './entity.js';
import type { CombatState, CombatContext } from './combat.js';

export interface SpawnRegion {
  id: string;
  enemyId: string;
  /** Level or inclusive [min,max] band. */
  level: number | [number, number];
  cx: number;
  cz: number;
  radius: number;
  /** Desired number alive. */
  count: number;
  /** Ticks before a fallen member is replaced. */
  respawnTicks: number;
}

interface Slot {
  entityId: string | null;
  /** Tick a dead slot may respawn. */
  readyTick: number;
}

export interface SpawnerState {
  regions: Map<string, Slot[]>;
  seed: number;
}

export function createSpawner(seed = WORLD_SEED): SpawnerState {
  return { regions: new Map(), seed };
}

function levelFor(region: SpawnRegion, slotIndex: number, seed: number): number {
  if (typeof region.level === 'number') return region.level;
  const [lo, hi] = region.level;
  const r = hashFloat2(hash2(slotIndex, 0, seed), region.cx + region.cz, seed);
  return lo + Math.floor(r * (hi - lo + 1));
}

function spawnPos(region: SpawnRegion, slotIndex: number, seed: number): { x: number; z: number } {
  const a = hashFloat2(slotIndex, region.cx, seed) * Math.PI * 2;
  const rad = Math.sqrt(hashFloat2(region.cz, slotIndex, seed)) * region.radius;
  return { x: region.cx + Math.cos(a) * rad, z: region.cz + Math.sin(a) * rad };
}

/**
 * Maintain a region's population for one tick. Spawns up to `count` enemies,
 * respawning dead slots once their timer elapses. Adds new entities to the combat
 * state and returns any spawned this tick.
 */
export function stepSpawner(
  state: CombatState,
  spawner: SpawnerState,
  region: SpawnRegion,
  ctx: CombatContext = {},
): CombatEntity[] {
  let slots = spawner.regions.get(region.id);
  if (!slots) {
    slots = Array.from({ length: region.count }, () => ({ entityId: null, readyTick: 0 }));
    spawner.regions.set(region.id, slots);
  }

  const spawned: CombatEntity[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    // Free the slot if its entity died or vanished.
    if (slot.entityId) {
      const ent = state.entities.get(slot.entityId);
      if (!ent || ent.dead) {
        if (slot.entityId) {
          if (ent && ent.dead) state.entities.delete(slot.entityId);
        }
        slot.entityId = null;
        slot.readyTick = state.tick + region.respawnTicks;
      } else {
        continue;
      }
    }
    if (slot.entityId === null && state.tick >= slot.readyTick) {
      const level = levelFor(region, i, spawner.seed);
      const { x, z } = spawnPos(region, i, spawner.seed);
      const y = ctx.heightAt ? ctx.heightAt(x, z) : 0;
      const id = `${region.id}#${i}@${state.tick}`;
      const ent = makeEnemyById(id, region.enemyId, level, x, y, z);
      if (ent) {
        state.entities.set(ent.id, ent);
        slot.entityId = ent.id;
        spawned.push(ent);
      }
    }
  }
  return spawned;
}

/** Count how many of a region's slots currently hold a live enemy. */
export function liveCount(spawner: SpawnerState, regionId: string, state: CombatState): number {
  const slots = spawner.regions.get(regionId);
  if (!slots) return 0;
  let n = 0;
  for (const s of slots) {
    if (s.entityId && state.entities.get(s.entityId)?.dead === false) n++;
  }
  return n;
}
