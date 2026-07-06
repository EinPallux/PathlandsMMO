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
  applyIntent,
  CharacterClass,
  CHARACTER_CLASSES,
  createCombatState,
  createSpawner,
  drainEvents,
  makePlayerEntity,
  skillById,
  stepSim,
  stepSpawner,
  WORLD_SPAWNS,
  WORLD_SEED,
  type CombatState,
  type CombatContext,
  type CombatEntity,
  type Intent,
  type NetCombatSelf,
  type NetEntity,
  type SpawnerState,
  type SpawnRegion,
} from '@pathlands/shared';
import type { ServerWorld } from './world.js';

/** Ticks a released spirit waits before reviving (~2 s at 20 Hz) — no instant chain-res. */
const RELEASE_DELAY_TICKS = 40;

/** Coerce an untrusted class string to a CharacterClass (defaults to Warrior). */
function toClass(raw: string): CharacterClass {
  return (CHARACTER_CLASSES as readonly string[]).includes(raw)
    ? (raw as CharacterClass)
    : CharacterClass.Warrior;
}

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

  // --- players in the combat sim (Stage 2a) ---

  /** Admit a player as a combat entity so enemies can target it and it can cast. */
  addPlayer(
    id: string,
    name: string,
    cls: string,
    level: number,
    x: number,
    y: number,
    z: number,
  ): void {
    if (this.state.entities.has(id)) return;
    this.state.entities.set(id, makePlayerEntity(id, name, toClass(cls), level, x, y, z));
  }

  /** Remove a departed player's combat entity (and any enemy threat/target it held). */
  removePlayer(id: string): void {
    this.state.entities.delete(id);
    for (const e of this.state.entities.values()) {
      if (e.faction === 'enemy') {
        if (e.targetId === id) e.targetId = null;
        if (e.threat[id] !== undefined) delete e.threat[id];
      }
    }
  }

  /** Write a player's authoritative movement position into its combat entity (pre-step). */
  syncPlayer(id: string, x: number, y: number, z: number, yaw: number): void {
    const e = this.state.entities.get(id);
    if (e === undefined || e.faction !== 'player') return;
    e.x = x;
    e.y = y;
    e.z = z;
    e.yaw = yaw;
  }

  /** Apply a validated combat intent (cast / target / auto / release) for a player. */
  applyPlayerIntent(id: string, intent: Intent): void {
    if (intent.type === 'Move') return; // movement is the ServerSim's authority, not combat's
    applyIntent(this.state, id, intent);
  }

  /** The player's own combat state projected to the wire, or null if it isn't a player. */
  combatSelf(id: string): NetCombatSelf | null {
    const e = this.state.entities.get(id);
    if (e === undefined || e.faction !== 'player') return null;
    let castSkill: string | null = null;
    let castFrac = 0;
    if (e.cast !== null) {
      castSkill = e.cast.skillId;
      const skill = skillById(e.cast.skillId);
      if (skill !== undefined && skill.castTicks > 0) {
        const remaining = e.cast.endTick - this.state.tick;
        castFrac = Math.max(0, Math.min(1, 1 - remaining / skill.castTicks));
      }
    }
    return {
      hp: e.hp,
      maxHP: e.maxHP,
      resource: e.resource,
      maxResource: e.maxResource,
      resourceKind: e.resourceKind,
      level: e.level,
      targetId: e.targetId,
      castSkill,
      castFrac,
      dead: e.dead,
      inCombat: e.inCombatUntil > this.state.tick,
    };
  }

  /** Advance the world one authoritative tick. The replication diff is refreshed separately
   * at broadcast cadence (refreshDiff) — NOT here — so a change on a non-broadcast tick isn't
   * lost by advancing the shadow baseline before a broadcast ever reads it. */
  step(): void {
    // Maintain every region's population (the server owns the whole world, so — unlike the
    // client — it spawns globally, not just around one player). TODO(scale): gate stepping
    // to regions near a connected player once population/CPU warrants it.
    for (const region of this.regions) stepSpawner(this.state, this.spawner, region, this.ctx);
    // Enemy AI + combat resolution for one tick (pure shared sim; deterministic). With
    // players now in the state, enemies aggro/chase/attack and player casts resolve here.
    stepSim(this.state, this.ctx);
    this.reviveReleasedPlayers();
    this.pruneAdds();
    // Stage 2a doesn't yet grant XP/loot from the drained events (that lands with the
    // client flip + persistence); drain so the queue can't grow unbounded.
    drainEvents(this.state);
  }

  /**
   * A dead player who has released their spirit revives after a short delay. The full death
   * flow (Waystone relocation + penalty, coordinated with the ServerSim movement authority)
   * lands in Stage 2c — this keeps a dead player from chain-resurrecting in place instantly.
   */
  private reviveReleasedPlayers(): void {
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'player' || !e.dead || e.respawnTick === undefined) continue;
      if (this.state.tick - e.respawnTick < RELEASE_DELAY_TICKS) continue; // still a spirit
      e.dead = false;
      e.hp = e.maxHP;
      e.resource = e.resourceKind === 'rage' ? 0 : e.maxResource;
      e.respawnTick = undefined;
      e.auras = [];
      e.threat = {};
      e.targetId = null;
      e.cast = null;
      e.inCombatUntil = 0;
    }
  }

  /**
   * Reap boss-summoned adds, which are NOT owned by a spawner slot and so would otherwise
   * leak into the state forever (the spawner only reaps slot enemies). A dead add is removed
   * immediately; a live add is removed once its boss is gone, dead, or no longer engaged
   * (adds exist only for an active fight). Slot enemies (no '~' in their id) are left to the
   * spawner, exactly as before.
   */
  private pruneAdds(): void {
    for (const [id, e] of [...this.state.entities]) {
      if (e.faction !== 'enemy') continue;
      const sep = id.indexOf('~');
      if (sep <= 0) continue; // a slot enemy — the spawner owns its lifecycle
      const boss = this.state.entities.get(id.slice(0, sep));
      if (e.dead || boss === undefined || boss.dead || boss.aiState !== 'aggro') {
        this.state.entities.delete(id);
      }
    }
  }

  /** Refresh the enemy replication diff (dirty / removed). Call ONCE per broadcast, before
   * reading isDirty/hasChanges — this advances the shadow baseline to "last broadcast". */
  refreshDiff(): void {
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
