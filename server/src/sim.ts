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
  physToNetSelf,
  SPAWN_X,
  SPAWN_Z,
  stepPlayerMovement,
  TICK_DT,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
  type MoveIntent,
  type NetPlayer,
  type NetSelf,
  type PlayerPhysics,
} from '@pathlands/shared';
import type { ServerWorld } from './world.js';

/** A sequence-numbered input queued for the authoritative tick that will apply it. */
interface QueuedInput {
  seq: number;
  intent: MoveIntent;
}

/** One connected player's authoritative state. */
export interface ServerPlayer {
  readonly id: string;
  name: string;
  cls: CharacterClass;
  level: number;
  readonly phys: PlayerPhysics;
  /**
   * FIFO of accepted move intents, drained one per tick. A jitter/catch-up buffer:
   * when the client sends a burst (a frame hitch replays several ticks at once), the
   * server applies them over successive ticks instead of collapsing them to the newest,
   * so the authoritative path matches the client's predicted path input-for-input.
   */
  readonly inputs: QueuedInput[];
  /** Highest intent sequence accepted into the queue — the ordering gate. */
  lastRecvSeq: number;
  /** Sequence of the last input actually APPLIED — the ack reported to the client. */
  lastAppliedSeq: number;
  /** Set when the player's replicated state changed since the last broadcast. */
  dirty: boolean;
}

const MAX_NAME_LEN = 24;
const MIN_LEVEL = 1;
const MAX_LEVEL = 30;
/**
 * Input-queue cap (0.8 s at 20 Hz). A legitimate client — even one replaying a 5-tick
 * catch-up burst after a frame hitch — stays far below this. Only a client sending
 * faster than the tick rate SUSTAINED (broken or malicious) overflows; on overflow we
 * drop the oldest so the freshest input still applies. That client throttles to 20 Hz
 * authority and its own reconciliation drifts — its problem, not the server's.
 */
const MAX_INPUT_QUEUE = 16;

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

/** A persisted spawn position is trusted only if finite and inside the world bounds. */
function validSpawn(
  s: { x: number; y: number; z: number; yaw: number } | undefined,
): s is { x: number; y: number; z: number; yaw: number } {
  if (s === undefined) return false;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) return false;
  if (!Number.isFinite(s.yaw)) return false;
  return s.x >= 0 && s.x < WORLD_SIZE_X && s.z >= 0 && s.z < WORLD_SIZE_Z && s.y > 0 && s.y < 512;
}

export class ServerSim {
  /** Monotonic simulation tick since server start. */
  tick = 0;
  readonly players = new Map<string, ServerPlayer>();
  private nextSession = 1;

  constructor(private readonly world: ServerWorld) {}

  /**
   * Admit a new player. Spawns at the shared plaza, or at `spawn` (a persisted
   * character's last position) when given and in-bounds. Marks it dirty so others learn
   * of it.
   */
  join(
    name: string,
    cls: string,
    level: number,
    spawn?: { x: number; y: number; z: number; yaw: number },
  ): ServerPlayer {
    const id = `p${this.nextSession++}`;
    let phys;
    if (validSpawn(spawn)) {
      phys = makePlayerPhysics(spawn.x, spawn.y, spawn.z);
      phys.yaw = spawn.yaw;
    } else {
      phys = makePlayerPhysics(SPAWN_X, this.world.surfaceSpawnY(SPAWN_X, SPAWN_Z), SPAWN_Z);
    }
    const player: ServerPlayer = {
      id,
      name: sanitizeName(name),
      cls: sanitizeClass(cls),
      level: sanitizeLevel(level),
      phys,
      inputs: [],
      lastRecvSeq: -1,
      lastAppliedSeq: -1,
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
   * Queue a player's move intent for the next tick(s). Out-of-order or replayed
   * sequence numbers are dropped by the gate; a full queue drops its oldest entry.
   * Only Move affects the sim in this slice; other intent kinds are accepted at the
   * wire but simulated in later parts.
   */
  applyMove(id: string, intent: MoveIntent, seq: number): void {
    const p = this.players.get(id);
    if (p === undefined) return;
    if (seq <= p.lastRecvSeq) return; // out-of-order / replayed — drop
    p.lastRecvSeq = seq;
    p.inputs.push({ seq, intent });
    if (p.inputs.length > MAX_INPUT_QUEUE) p.inputs.shift();
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

      // One input per tick: the authoritative rate governs how fast the sim advances,
      // so a burst of buffered inputs plays out across successive ticks (never faster).
      const queued = p.inputs.shift();
      const intent = queued?.intent ?? idleIntent(before.yaw);
      if (queued !== undefined) p.lastAppliedSeq = queued.seq;
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

  /** Full state of every player (admin/debug; replication uses interest-filtered sets). */
  allNet(): NetPlayer[] {
    return Array.from(this.players.values(), (p) => this.netOf(p));
  }

  /** A player's own authoritative state + the last input seq applied — for reconciliation. */
  selfOf(p: ServerPlayer): { ackedSeq: number; phys: NetSelf } {
    return { ackedSeq: p.lastAppliedSeq, phys: physToNetSelf(p.phys) };
  }

  /** True if any player changed since the last `clearDirty()` (drives the idle-skip). */
  anyDirty(): boolean {
    for (const p of this.players.values()) if (p.dirty) return true;
    return false;
  }

  clearDirty(): void {
    for (const p of this.players.values()) p.dirty = false;
  }
}
