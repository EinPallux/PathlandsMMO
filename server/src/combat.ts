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
  buildEnemyLootTable,
  CharacterClass,
  CHARACTER_CLASSES,
  createCombatState,
  createSpawner,
  drainEvents,
  enemyById,
  levelProgressFromTotalXp,
  makePlayerEntity,
  nearestWaystone,
  rollLoot,
  skillById,
  SPAWN_X,
  SPAWN_Z,
  stepSim,
  stepSpawner,
  WORLD_SPAWNS,
  WORLD_SEED,
  type CombatEvent,
  type CombatState,
  type CombatContext,
  type CombatEntity,
  type Intent,
  type NetCombatSelf,
  type NetEntity,
  type NetItemStack,
  type NetPartyVital,
  type SpawnerState,
  type SpawnRegion,
} from '@pathlands/shared';
import type { ServerWorld } from './world.js';

/** A kill credited to a player: the enemy def id (for their client-side quest objectives) plus
 * the server's authoritative loot roll. Queued per-player and drained at broadcast cadence. */
export interface KillCredit {
  enemyId: string;
  gold: number;
  items: NetItemStack[];
}

/** An authoritative combat visual (floater / hit spark / death poof / boss line) with the world
 * position to play it at + the source id (so a viewer's own predicted hits can be omitted). */
export interface FxRecord {
  kind: 'damage' | 'heal' | 'death' | 'boss';
  sourceId: string;
  x: number;
  y: number;
  z: number;
  amount: number;
  crit: boolean;
  text?: string;
}

/** Cap the per-broadcast fx buffer so a big pull can't balloon the frame (cosmetic; oldest win). */
const FX_CAP = 256;

/** Ticks a released spirit waits before reviving (~2 s at 20 Hz) — no instant chain-res. */
const RELEASE_DELAY_TICKS = 40;

/** Coerce an untrusted class string to a CharacterClass (defaults to Warrior). */
function toClass(raw: string): CharacterClass {
  return (CHARACTER_CLASSES as readonly string[]).includes(raw)
    ? (raw as CharacterClass)
    : CharacterClass.Warrior;
}

/** An entity's cast, projected to the wire: the skill id being cast (or null) + progress 0..1.
 * Shared by the player's combat-self and an enemy's NetEntity (the target-frame cast bar). */
function castProgress(e: CombatEntity, tick: number): { skill: string | null; frac: number } {
  if (e.cast === null) return { skill: null, frac: 0 };
  const skill = skillById(e.cast.skillId);
  if (skill === undefined || skill.castTicks <= 0) return { skill: e.cast.skillId, frac: 0 };
  const remaining = e.cast.endTick - tick;
  return { skill: e.cast.skillId, frac: Math.max(0, Math.min(1, 1 - remaining / skill.castTicks)) };
}

/** Project an authoritative enemy `CombatEntity` onto its replication wire shape. */
function toNetEntity(e: CombatEntity, tick: number): NetEntity {
  const cast = castProgress(e, tick);
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
    castSkill: cast.skill,
    castFrac: cast.frac,
  };
}

/**
 * A compact digest of the fields that appear on the wire, so we only flag an enemy as
 * changed (an UPDATE delta) when something a client would render actually moved. Quantised
 * to the same precision a client interpolates at, so idle enemies produce no traffic. The
 * cast (skill + quantised progress) is included so a wind-up's bar replicates as it fills.
 */
function digest(e: CombatEntity, tick: number): string {
  const q = (n: number): number => Math.round(n * 100);
  const cast = castProgress(e, tick);
  return `${q(e.x)},${q(e.y)},${q(e.z)},${Math.round(e.yaw * 1000)},${e.hp},${e.aiState ?? 'idle'},${cast.skill ?? ''},${Math.round(cast.frac * 20)}`;
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
  /** Per-player authoritative progression (Stage 2c): total lifetime XP. */
  private readonly progress = new Map<string, { totalXp: number }>();
  /** Per-player queue of kills to credit (loot + quest-objective enemy id), drained by the
   * gateway each broadcast and sent to that player as ServerKill frames (Stage 2c-2). */
  private readonly killFeed = new Map<string, KillCredit[]>();
  /** Authoritative combat visuals accumulated since the last broadcast drain (Stage 2c-3). */
  private fxBuffer: FxRecord[] = [];
  /** Players revived this step, to relocate in the MOVEMENT authority (Stage 2c-4). The combat
   * entity's position is synced FROM the physics each tick, so a respawn must move the physics
   * too — the gateway drains these and teleports each. */
  private respawns: { id: string; x: number; z: number }[] = [];

  constructor(world: ServerWorld) {
    this.state = createCombatState(WORLD_SEED);
    this.spawner = createSpawner(WORLD_SEED);
    this.regions = WORLD_SPAWNS;
    this.ctx = { heightAt: (x, z) => world.world.heightAt(Math.floor(x), Math.floor(z)) };
  }

  // --- players in the combat sim (Stage 2a) ---

  /** Admit a player as a combat entity so enemies can target it and it can cast. The level
   * is derived from the (persisted) total XP so progression is authoritative from the start. */
  addPlayer(
    id: string,
    name: string,
    cls: string,
    level: number,
    x: number,
    y: number,
    z: number,
    totalXp = 0,
  ): void {
    if (this.state.entities.has(id)) return;
    const lvl = totalXp > 0 ? levelProgressFromTotalXp(totalXp).level : level;
    this.state.entities.set(id, makePlayerEntity(id, name, toClass(cls), lvl, x, y, z));
    this.progress.set(id, { totalXp });
  }

  /** Remove a departed player's combat entity (and any enemy threat/target it held). */
  removePlayer(id: string): void {
    this.state.entities.delete(id);
    this.progress.delete(id);
    this.killFeed.delete(id);
    for (const e of this.state.entities.values()) {
      if (e.faction === 'enemy') {
        if (e.targetId === id) e.targetId = null;
        if (e.threat[id] !== undefined) delete e.threat[id];
      }
    }
  }

  /** A player's authoritative progression (total XP + derived level), for persistence. */
  progressionOf(id: string): { totalXp: number; level: number } | null {
    const pr = this.progress.get(id);
    const e = this.state.entities.get(id);
    if (pr === undefined || e === undefined || e.faction !== 'player') return null;
    return { totalXp: pr.totalXp, level: e.level };
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
    const cast = castProgress(e, this.state.tick);
    return {
      hp: e.hp,
      maxHP: e.maxHP,
      resource: e.resource,
      maxResource: e.maxResource,
      resourceKind: e.resourceKind,
      level: e.level,
      totalXp: this.progress.get(id)?.totalXp ?? 0,
      targetId: e.targetId,
      castSkill: cast.skill,
      castFrac: cast.frac,
      dead: e.dead,
      inCombat: e.inCombatUntil > this.state.tick,
    };
  }

  /** A player's live vitals for the party ally frames (hp / resource / dead), or null. Lighter
   *  than combatSelf — no cast/xp/target — and used world-wide (not interest-filtered). */
  vitalsOf(id: string): NetPartyVital | null {
    const e = this.state.entities.get(id);
    if (e === undefined || e.faction !== 'player') return null;
    return {
      id,
      hp: e.hp,
      maxHP: e.maxHP,
      resource: e.resource,
      maxResource: e.maxResource,
      resourceKind: e.resourceKind,
      dead: e.dead,
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
    this.processEvents();
    this.reviveReleasedPlayers();
    this.pruneAdds();
  }

  /** Apply the shared sim's combat events to server-authoritative progression + loot (Stage 2c). */
  private processEvents(): void {
    for (const ev of drainEvents(this.state)) {
      if (ev.type === 'xp') this.awardXp(ev.entityId, ev.amount);
      else if (ev.type === 'death' && ev.killerId !== null && ev.enemyId !== undefined) {
        this.creditKill(ev.killerId, ev.enemyId, ev.level);
      }
      this.collectFx(ev); // authoritative floaters / hit sparks / death poofs (Stage 2c-3)
    }
  }

  /**
   * Buffer the visual side of a combat event (a floater / hit spark / death poof / boss line) at
   * a world position, for the gateway to replicate. Damage/heal read the (live) target's
   * position; a death reads the position carried on the event (the corpse may already be reaped).
   */
  private collectFx(ev: CombatEvent): void {
    if (this.fxBuffer.length >= FX_CAP) return;
    if (ev.type === 'damage' || ev.type === 'heal') {
      const target = this.state.entities.get(ev.targetId);
      if (target === undefined) return; // reaped by an instant-cast kill — the death poof covers it
      this.fxBuffer.push({
        kind: ev.type,
        sourceId: ev.sourceId,
        x: target.x,
        y: target.y,
        z: target.z,
        amount: ev.amount,
        crit: ev.crit,
      });
    } else if (ev.type === 'death' && ev.enemyId !== undefined) {
      this.fxBuffer.push({
        kind: 'death',
        sourceId: ev.killerId ?? '',
        x: ev.x,
        y: ev.y,
        z: ev.z,
        amount: 0,
        crit: false,
      });
    } else if (ev.type === 'bossPhase') {
      const boss = this.state.entities.get(ev.entityId);
      if (boss === undefined) return;
      this.fxBuffer.push({
        kind: 'boss',
        sourceId: '',
        x: boss.x,
        y: boss.y,
        z: boss.z,
        amount: 0,
        crit: false,
        text: ev.say,
      });
    }
  }

  /** Take and clear the combat visuals accumulated since the last broadcast (Stage 2c-3). The
   * gateway filters these per-connection (interest + omit the viewer's own predicted hits). */
  drainFx(): FxRecord[] {
    if (this.fxBuffer.length === 0) return [];
    const out = this.fxBuffer;
    this.fxBuffer = [];
    return out;
  }

  /**
   * Credit a player for killing an enemy: roll its loot table (server-authoritative, on the
   * shared seeded RNG — never `Math.random`) and queue the drop + the enemy def id for the
   * killer. The enemy id + level ride the death EVENT (not looked up in the state), because an
   * instant-cast kill resolves inside `applyIntent` and the corpse is reaped by the next tick's
   * spawner before this drain runs. Only a live player killer is credited.
   */
  private creditKill(killerId: string, enemyId: string, level: number): void {
    const killer = this.state.entities.get(killerId);
    if (killer === undefined || killer.faction !== 'player') return;
    const def = enemyById(enemyId);
    if (def === undefined) return;
    const table = buildEnemyLootTable(def, level);
    const result = rollLoot(table, this.state.rng, { forClass: killer.cls });
    const credit: KillCredit = {
      enemyId,
      gold: result.gold,
      items: result.items.map((s) => ({ item: s.item, qty: s.qty })),
    };
    const queue = this.killFeed.get(killerId);
    if (queue === undefined) this.killFeed.set(killerId, [credit]);
    else queue.push(credit);
  }

  /** Take and clear a player's pending kill credits (the gateway sends them as ServerKill). */
  drainKills(id: string): KillCredit[] {
    const queue = this.killFeed.get(id);
    if (queue === undefined || queue.length === 0) return [];
    this.killFeed.set(id, []);
    return queue;
  }

  /** Add XP to a player and level them up (rebuilding stats) when they cross a threshold. */
  private awardXp(playerId: string, amount: number): void {
    const pr = this.progress.get(playerId);
    const e = this.state.entities.get(playerId);
    if (pr === undefined || e === undefined || e.faction !== 'player' || amount <= 0) return;
    pr.totalXp += amount;
    const newLevel = levelProgressFromTotalXp(pr.totalXp).level;
    if (newLevel > e.level) {
      // Level up: rebuild the entity at the new level (fresh stats + full HP), preserving
      // position, current target, and auto-attack toggle.
      const rebuilt = makePlayerEntity(
        e.id,
        e.name,
        e.cls ?? CharacterClass.Warrior,
        newLevel,
        e.x,
        e.y,
        e.z,
      );
      rebuilt.yaw = e.yaw;
      rebuilt.targetId = e.targetId;
      rebuilt.autoAttack = e.autoAttack;
      // A player can cross a level boundary WHILE DEAD (a lingering DoT lands a killing blow
      // after they died). `makePlayerEntity` returns a fresh, ALIVE entity — so preserve the
      // death state, or the rebuild would silently resurrect them in place and bypass the whole
      // Waystone-respawn/freeze flow (reviveReleasedPlayers only acts on a `dead` entity). The
      // new-level max HP is applied when they actually revive.
      if (e.dead) {
        rebuilt.dead = true;
        rebuilt.hp = 0;
        rebuilt.respawnTick = e.respawnTick;
      }
      this.state.entities.set(e.id, rebuilt);
    }
  }

  /**
   * A dead player who has released their spirit revives after a short delay (no instant
   * chain-res), **relocated to the nearest Waystone** (GDD §7 — the graveyard-run respawn).
   * The combat entity's position is synced from the movement authority each tick, so we also
   * queue a `respawn` for the gateway to teleport the physics; both are moved here so the entity
   * is consistent within this tick. (Respawning at the nearest Waystone by position, not the
   * nearest ATTUNED one — the server doesn't track per-character activations yet; it lands with
   * server-side character identity.)
   */
  private reviveReleasedPlayers(): void {
    for (const e of this.state.entities.values()) {
      if (e.faction !== 'player' || !e.dead || e.respawnTick === undefined) continue;
      if (this.state.tick - e.respawnTick < RELEASE_DELAY_TICKS) continue; // still a spirit
      const ws = nearestWaystone(e.x, e.z);
      const rx = ws?.x ?? SPAWN_X;
      const rz = ws?.z ?? SPAWN_Z;
      e.x = rx;
      e.z = rz;
      e.y = this.ctx.heightAt ? this.ctx.heightAt(rx, rz) + 2 : e.y; // matches world.surfaceSpawnY
      e.dead = false;
      e.hp = e.maxHP;
      e.resource = e.resourceKind === 'rage' ? 0 : e.maxResource;
      e.respawnTick = undefined;
      e.auras = [];
      e.threat = {};
      e.targetId = null;
      e.cast = null;
      e.inCombatUntil = 0;
      this.respawns.push({ id: e.id, x: rx, z: rz });
    }
  }

  /** Whether a player's combat entity is currently dead (drives the gateway's movement freeze). */
  isDead(id: string): boolean {
    const e = this.state.entities.get(id);
    return e !== undefined && e.faction === 'player' && e.dead;
  }

  /** Take and clear the players revived this step, so the gateway can teleport the movement
   * authority (physics) to the Waystone they respawned at (Stage 2c-4). */
  drainRespawns(): { id: string; x: number; z: number }[] {
    if (this.respawns.length === 0) return [];
    const out = this.respawns;
    this.respawns = [];
    return out;
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
      const d = digest(e, this.state.tick);
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
      if (e.faction === 'enemy' && !e.dead) out.push(toNetEntity(e, this.state.tick));
    }
    return out;
  }

  /** The wire projection of one live enemy by id, or null if it isn't a live enemy. */
  netEntity(id: string): NetEntity | null {
    const e = this.state.entities.get(id);
    return e !== undefined && e.faction === 'enemy' && !e.dead
      ? toNetEntity(e, this.state.tick)
      : null;
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
