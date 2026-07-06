// The authoritative simulation. It runs the SAME shared movement rules the client
// runs (stepPlayerMovement), on a fixed tick, and is the sole source of truth for
// where every player is (ARCH §7). Intents arrive from clients; the sim validates and
// applies them. Nothing here reads wall-clock time or unseeded randomness in the
// simulation path — session ids are an integration-edge concern (a plain counter), not
// sim state, so replays stay deterministic.
//
// Part 1 (this vertical slice) simulates player MOVEMENT authoritatively. Combat,
// loot, quests and professions are added to the same tick pipeline in later parts —
// the point of the intent → sim boundary is that they slot in without reshaping this.

import {
  CHARACTER_CLASSES,
  CharacterClass,
  makePlayerPhysics,
  SPAWN_X,
  SPAWN_Z,
  stepPlayerMovement,
  TICK_DT,
  type MoveIntent,
  type NetPlayer,
  type PlayerPhysics,
} from '@pathlands/shared';
import type { ServerWorld } from './world.js';

/** One connected player's authoritative state. */
export interface ServerPlayer {
  readonly id: string;
  name: string;
  cls: CharacterClass;
  level: number;
  readonly phys: PlayerPhysics;
  /** The move intent to apply next tick (last-wins; consumed each step). */
  pendingMove: MoveIntent | null;
  /** Highest intent sequence number accepted from this player (for later acks). */
  lastSeq: number;
  /** Set when the player's replicated state changed since the last broadcast. */
  dirty: boolean;
}

const MAX_NAME_LEN = 24;
const MIN_LEVEL = 1;
const MAX_LEVEL = 30;

/** Idle input that preserves facing — used when no move intent arrived this tick. */
function idleIntent(yaw: number): MoveIntent {
  return { type: 'Move', wishX: 0, wishZ: 0, jump: false, sprint: false, yaw };
}

function sanitizeName(raw: string): string {
  const trimmed = raw.trim().slice(0, MAX_NAME_LEN);
  return trimmed.length > 0 ? trimmed : 'Wanderer';
}

function sanitizeClass(raw: string): CharacterClass {
  return (CHARACTER_CLASSES as readonly string[]).includes(raw)
    ? (raw as CharacterClass)
    : CharacterClass.Warrior;
}

function sanitizeLevel(raw: number): number {
  if (!Number.isFinite(raw)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(raw)));
}

export class ServerSim {
  /** Monotonic simulation tick since server start. */
  tick = 0;
  readonly players = new Map<string, ServerPlayer>();
  private nextSession = 1;

  constructor(private readonly world: ServerWorld) {}

  /** Admit a new player at the shared spawn plaza. Marks it dirty so others learn of it. */
  join(name: string, cls: string, level: number): ServerPlayer {
    const id = `p${this.nextSession++}`;
    const spawnY = this.world.surfaceSpawnY(SPAWN_X, SPAWN_Z);
    const phys = makePlayerPhysics(SPAWN_X, spawnY, SPAWN_Z);
    const player: ServerPlayer = {
      id,
      name: sanitizeName(name),
      cls: sanitizeClass(cls),
      level: sanitizeLevel(level),
      phys,
      pendingMove: null,
      lastSeq: -1,
      dirty: true,
    };
    this.players.set(id, player);
    return player;
  }

  /** Drop a player. Returns true if the id was present. */
  remove(id: string): boolean {
    return this.players.delete(id);
  }

  /**
   * Buffer a player's latest move intent (last-wins within a tick). Stale or unknown
   * sequence numbers are ignored. Only Move affects the sim in this slice; other intent
   * kinds are accepted at the wire but simulated in later parts.
   */
  applyMove(id: string, intent: MoveIntent, seq: number): void {
    const p = this.players.get(id);
    if (p === undefined) return;
    if (seq <= p.lastSeq) return; // out-of-order / replayed — drop
    p.lastSeq = seq;
    p.pendingMove = intent;
  }

  /** Advance the whole simulation by one tick. */
  step(): void {
    for (const p of this.players.values()) {
      const before = p.phys;
      const px = before.x;
      const py = before.y;
      const pz = before.z;
      const pyaw = before.yaw;
      const pmove = before.moveState;

      const intent = p.pendingMove ?? idleIntent(before.yaw);
      p.pendingMove = null;
      stepPlayerMovement(this.world.sampler, p.phys, intent, TICK_DT);

      if (
        p.phys.x !== px ||
        p.phys.y !== py ||
        p.phys.z !== pz ||
        p.phys.yaw !== pyaw ||
        p.phys.moveState !== pmove
      ) {
        p.dirty = true;
      }
    }
    this.tick++;
  }

  /** Project a player to the network replication shape. */
  netOf(p: ServerPlayer): NetPlayer {
    return {
      id: p.id,
      name: p.name,
      cls: p.cls,
      level: p.level,
      x: p.phys.x,
      y: p.phys.y,
      z: p.phys.z,
      yaw: p.phys.yaw,
      move: p.phys.moveState,
    };
  }

  /** Full state of every player (sent on join / resubscribe). */
  allNet(): NetPlayer[] {
    return Array.from(this.players.values(), (p) => this.netOf(p));
  }

  /** Players whose replicated state changed since the last `clearDirty()`. */
  dirtyNet(): NetPlayer[] {
    const out: NetPlayer[] = [];
    for (const p of this.players.values()) if (p.dirty) out.push(this.netOf(p));
    return out;
  }

  clearDirty(): void {
    for (const p of this.players.values()) p.dirty = false;
  }
}
