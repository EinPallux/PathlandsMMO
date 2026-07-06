// Server-authoritative enemy entities (Phase 6, combat migration Stage 1). The server
// owns ONE combat sim for the whole world: it runs the deterministic shared spawner +
// `stepSim` (enemy AI + combat resolution) that the client used to run locally, and
// replicates the resulting enemies to clients as NetEntity. Same seed + same shared code
// ⇒ every client sees the same monsters in the same places (ARCH §5, §7).
//
// This module owns the enemies only; players are not injected into the combat state yet
// (that arrives with client-side combat in Stage 2), so enemies idle at their spawns.
// Wall-clock lives at the gateway edge, never here — `step()` is driven by the tick clock.

import {
  createCombatState,
  createSpawner,
  drainEvents,
  stepSim,
  stepSpawner,
  WORLD_SPAWNS,
  WORLD_SEED,
  type CombatState,
  type CombatContext,
  type CombatEntity,
  type NetEntity,
  type SpawnerState,
  type SpawnRegion,
} from '@pathlands/shared';
import type { ServerWorld } from './world.js';

/** Project an authoritative enemy `CombatEntity` onto its replication wire shape. */
function toNetEntity(e: CombatEntity): NetEntity {
  return {
    id: e.id,
    enemyId: e.enemyId ?? '',
    name: e.name,
    level: e.level,
    x: e.x,
    y: e.y,
    z: e.z,
    yaw: e.yaw,
    hp: e.hp,
    maxHP: e.maxHP,
    state: e.aiState ?? 'idle',
  };
}

/**
 * A compact digest of the fields that appear on the wire, so we only flag an enemy as
 * changed (an UPDATE delta) when something a client would render actually moved. Quantised
 * to the same precision a client interpolates at, so idle enemies produce no traffic.
 */
function digest(e: CombatEntity): string {
  const q = (n: number): number => Math.round(n * 100);
  return `${q(e.x)},${q(e.y)},${q(e.z)},${Math.round(e.yaw * 1000)},${e.hp},${e.aiState ?? 'idle'}`;
}

export class ServerCombat {
  readonly state: CombatState;
  private readonly spawner: SpawnerState;
  private readonly regions: readonly SpawnRegion[];
  private readonly ctx: CombatContext;
  /** Per-enemy digest of the last replicated state — the change detector for deltas. */
  private readonly shadow = new Map<string, string>();
  /** Enemy ids whose wire state changed on the most recent `step()` (the UPDATE set). */
  private readonly dirtyIds = new Set<string>();
  /** Enemy ids removed from the sim on the most recent `step()` (died / despawned). */
  private removedIds: string[] = [];

  constructor(world: ServerWorld) {
    this.state = createCombatState(WORLD_SEED);
    this.spawner = createSpawner(WORLD_SEED);
    this.regions = WORLD_SPAWNS;
    this.ctx = { heightAt: (x, z) => world.world.heightAt(Math.floor(x), Math.floor(z)) };
  }

  /** Advance the world's enemies one authoritative tick and recompute the replication diff. */
  step(): void {
    // Maintain every region's population (the server owns the whole world, so — unlike the
    // client — it spawns globally, not just around one player). TODO(scale): gate stepping
    // to regions near a connected player once population/CPU warrants it.
    for (const region of this.regions) stepSpawner(this.state, this.spawner, region, this.ctx);
    // Enemy AI + combat resolution for one tick (pure shared sim; deterministic).
    stepSim(this.state, this.ctx);
    // Stage 1 has no player targets, so no XP/loot/death consequences to apply — drain the
    // event queue so it can't grow unbounded. (Stage 2 consumes these for the player.)
    drainEvents(this.state);
    this.recomputeDiff();
  }

  private recomputeDiff(): void {
    this.dirtyIds.clear();
    this.removedIds = [];
    const seen = new Set<string>();
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'enemy') continue;
      seen.add(e.id);
      const d = digest(e);
      if (this.shadow.get(e.id) !== d) {
        this.dirtyIds.add(e.id); // new (ENTER) or moved/damaged (UPDATE)
        this.shadow.set(e.id, d);
      }
    }
    for (const id of this.shadow.keys()) {
      if (!seen.has(id)) {
        this.shadow.delete(id);
        this.removedIds.push(id);
      }
    }
  }

  /** Every live enemy, projected to the wire (used to seed a joiner's interest set). */
  netEntities(): NetEntity[] {
    const out: NetEntity[] = [];
    for (const e of this.state.entities.values()) {
      if (e.faction === 'enemy' && !e.dead) out.push(toNetEntity(e));
    }
    return out;
  }

  /** The wire projection of one live enemy by id, or null if it isn't a live enemy. */
  netEntity(id: string): NetEntity | null {
    const e = this.state.entities.get(id);
    return e !== undefined && e.faction === 'enemy' && !e.dead ? toNetEntity(e) : null;
  }

  /** Did this enemy's replicated state change on the last step? (drives UPDATE deltas). */
  isDirty(id: string): boolean {
    return this.dirtyIds.has(id);
  }

  /** Any enemy changed or was removed on the last step (so a delta pass is worthwhile). */
  hasChanges(): boolean {
    return this.dirtyIds.size > 0 || this.removedIds.length > 0;
  }

  /** Enemy ids removed from the sim on the last step (died / despawned). */
  removed(): readonly string[] {
    return this.removedIds;
  }
}
