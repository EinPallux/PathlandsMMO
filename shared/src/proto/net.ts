// Phase-6 network protocol. Pure, serialisable message shapes exchanged between the
// browser client and the authoritative Node server — the wire form of the intent →
// simulation pipeline that has existed since Phase 1 (ARCH §3, §7).
//
// This file is platform-free like the rest of shared/: no DOM, no ws, no Node. Both
// sides import it unchanged. The codec is deliberately a single choke point (JSON
// today) so swapping to length-prefixed MessagePack later (ARCH §7) touches only the
// four encode/decode functions, never a call site.
//
// Trust posture: the server treats every ClientMessage as hostile. Decoders here do
// structural validation and return `null` on anything malformed, so a garbage or
// adversarial frame is dropped at the boundary instead of reaching the sim. Semantic
// validation (range, cooldown, resource, ownership) stays in the sim, where it has
// always lived — the server is authoritative by construction.

import type { CastSkillIntent, Intent, MoveIntent } from '../sim/intents.js';
import type { MoveState } from '../sim/types.js';

/** Bumped on any breaking wire change; the server rejects a mismatched client. */
export const NET_PROTOCOL_VERSION = 1;

/** How another player appears to everyone else — the replication view of a player. */
export interface NetPlayer {
  /** Server-assigned session id (not the account/character id). */
  id: string;
  name: string;
  /** CharacterClass value (e.g. 'warrior'); kept as a string to decouple the wire. */
  cls: string;
  level: number;
  x: number;
  y: number;
  z: number;
  /** Facing yaw in radians. */
  yaw: number;
  move: MoveState;
}

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

/** First frame after the socket opens: who is connecting. */
export interface ClientHello {
  t: 'hello';
  protocol: number;
  name: string;
  cls: string;
  level: number;
}

/**
 * A player intent (sequence-numbered so the server can ack and the client can
 * reconcile prediction in a later part). `tick` is the client's local tick estimate
 * at send time — carried now, used for reconciliation when own-movement authority
 * moves fully server-side.
 */
export interface ClientIntent {
  t: 'intent';
  seq: number;
  tick: number;
  intent: Intent;
}

/** Round-trip latency probe; the server echoes it as a pong. */
export interface ClientPing {
  t: 'ping';
  id: number;
  clientTime: number;
}

export type ClientMessage = ClientHello | ClientIntent | ClientPing;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

/** Reply to a valid hello: your id, the world seed to verify, and the tick clock. */
export interface ServerWelcome {
  t: 'welcome';
  protocol: number;
  you: string;
  seed: number;
  tick: number;
  tickRate: number;
}

/** Complete state of every visible player — sent on join and on (re)subscribe. */
export interface ServerSnapshot {
  t: 'snapshot';
  tick: number;
  players: NetPlayer[];
}

/** Incremental update: players that changed (`players`) and those that left (`gone`). */
export interface ServerDelta {
  t: 'delta';
  tick: number;
  players: NetPlayer[];
  gone: string[];
}

/** Echo of a ping, with the server tick for a coarse clock estimate. */
export interface ServerPong {
  t: 'pong';
  id: number;
  clientTime: number;
  serverTick: number;
}

/** Terminal error the server sends before closing (bad protocol, bad hello…). */
export interface ServerError {
  t: 'error';
  code: string;
  message: string;
}

export type ServerMessage = ServerWelcome | ServerSnapshot | ServerDelta | ServerPong | ServerError;

// ---------------------------------------------------------------------------
// Codec — the one place the wire format lives.
// ---------------------------------------------------------------------------

export function encodeClient(m: ClientMessage): string {
  return JSON.stringify(m);
}

export function encodeServer(m: ServerMessage): string {
  return JSON.stringify(m);
}

/** Parse untrusted JSON into an object, or null if it isn't a JSON object. */
function parseObject(raw: string): Record<string, unknown> | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/**
 * Structurally validate an untrusted intent. Only the shapes the sim can act on are
 * accepted; anything else is rejected at the boundary. This is a syntactic gate, not
 * the authority check — the sim still validates range/resource/cooldown/ownership.
 */
export function validateIntent(v: unknown): Intent | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  switch (o.type) {
    case 'Move': {
      if (!isFiniteNumber(o.wishX) || !isFiniteNumber(o.wishZ) || !isFiniteNumber(o.yaw)) {
        return null;
      }
      if (!isBool(o.jump) || !isBool(o.sprint)) return null;
      const move: MoveIntent = {
        type: 'Move',
        wishX: o.wishX,
        wishZ: o.wishZ,
        jump: o.jump,
        sprint: o.sprint,
        yaw: o.yaw,
      };
      if (o.speedMult !== undefined) {
        if (!isFiniteNumber(o.speedMult)) return null;
        move.speedMult = o.speedMult;
      }
      return move;
    }
    case 'SetTarget': {
      if (o.targetId !== null && !isString(o.targetId)) return null;
      return { type: 'SetTarget', targetId: o.targetId };
    }
    case 'CastSkill': {
      if (!isString(o.skillId)) return null;
      const cast: CastSkillIntent = { type: 'CastSkill', skillId: o.skillId };
      if (o.targetId !== undefined) {
        if (o.targetId !== null && !isString(o.targetId)) return null;
        cast.targetId = o.targetId;
      }
      if (o.groundX !== undefined) {
        if (!isFiniteNumber(o.groundX)) return null;
        cast.groundX = o.groundX;
      }
      if (o.groundZ !== undefined) {
        if (!isFiniteNumber(o.groundZ)) return null;
        cast.groundZ = o.groundZ;
      }
      return cast;
    }
    case 'ToggleAutoAttack': {
      if (!isBool(o.on)) return null;
      return { type: 'ToggleAutoAttack', on: o.on };
    }
    case 'Interact': {
      if (!isString(o.targetId)) return null;
      return { type: 'Interact', targetId: o.targetId };
    }
    case 'ReleaseSpirit':
      return { type: 'ReleaseSpirit' };
    default:
      return null;
  }
}

/** Decode + structurally validate a client frame; null ⇒ drop it silently. */
export function decodeClient(raw: string): ClientMessage | null {
  const o = parseObject(raw);
  if (o === null) return null;
  switch (o.t) {
    case 'hello':
      if (!isFiniteNumber(o.protocol) || !isString(o.name) || !isString(o.cls)) return null;
      if (!isFiniteNumber(o.level)) return null;
      return { t: 'hello', protocol: o.protocol, name: o.name, cls: o.cls, level: o.level };
    case 'intent': {
      if (!isFiniteNumber(o.seq) || !isFiniteNumber(o.tick)) return null;
      const intent = validateIntent(o.intent);
      if (intent === null) return null;
      return { t: 'intent', seq: o.seq, tick: o.tick, intent };
    }
    case 'ping':
      if (!isFiniteNumber(o.id) || !isFiniteNumber(o.clientTime)) return null;
      return { t: 'ping', id: o.id, clientTime: o.clientTime };
    default:
      return null;
  }
}

function isNetPlayer(v: unknown): v is NetPlayer {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isString(o.name) &&
    isString(o.cls) &&
    isFiniteNumber(o.level) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z) &&
    isFiniteNumber(o.yaw) &&
    isString(o.move)
  );
}

/** Decode a server frame on the client. Null ⇒ drop (protocol drift / corruption). */
export function decodeServer(raw: string): ServerMessage | null {
  const o = parseObject(raw);
  if (o === null) return null;
  switch (o.t) {
    case 'welcome':
      if (
        !isFiniteNumber(o.protocol) ||
        !isString(o.you) ||
        !isFiniteNumber(o.seed) ||
        !isFiniteNumber(o.tick) ||
        !isFiniteNumber(o.tickRate)
      ) {
        return null;
      }
      return {
        t: 'welcome',
        protocol: o.protocol,
        you: o.you,
        seed: o.seed,
        tick: o.tick,
        tickRate: o.tickRate,
      };
    case 'snapshot': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.players)) return null;
      if (!o.players.every(isNetPlayer)) return null;
      return { t: 'snapshot', tick: o.tick, players: o.players };
    }
    case 'delta': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.players) || !Array.isArray(o.gone)) {
        return null;
      }
      if (!o.players.every(isNetPlayer) || !o.gone.every(isString)) return null;
      return { t: 'delta', tick: o.tick, players: o.players, gone: o.gone };
    }
    case 'pong':
      if (!isFiniteNumber(o.id) || !isFiniteNumber(o.clientTime) || !isFiniteNumber(o.serverTick)) {
        return null;
      }
      return { t: 'pong', id: o.id, clientTime: o.clientTime, serverTick: o.serverTick };
    case 'error':
      if (!isString(o.code) || !isString(o.message)) return null;
      return { t: 'error', code: o.code, message: o.message };
    default:
      return null;
  }
}
