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

import type { ItemDef } from '../data/items.js';
import type { CastSkillIntent, Intent, MoveIntent } from '../sim/intents.js';
import type { MoveState, PlayerPhysics } from '../sim/types.js';

/**
 * Bumped on any breaking wire change; the server rejects a mismatched client.
 * v2 added the per-connection `self` reconciliation channel (ServerSelf);
 * v3 added the optional account `token` on the hello (accounts & persistence);
 * v4 added the chat channel (ClientChat / ServerChat);
 * v5 added server-authoritative enemy entities (NetEntity in snapshot / delta);
 * v6 added the per-connection combat-self channel (ServerCombatSelf);
 * v7 added server-authoritative XP progression (totalXp on NetCombatSelf);
 * v8 added server-authoritative loot: the per-kill ServerKill credit (enemyId + gold + items);
 * v9 added the combat-events channel (ServerCombatEvents — authoritative floaters + death VFX);
 * v10 added enemy cast replication (castSkill / castFrac on NetEntity — the target-frame cast bar);
 * v11 added the party channel (ClientParty / ServerPartyState / ServerPartyInvite);
 * v12 added party vitals (ServerPartyVitals — live ally HP/resource frames, world-wide);
 * v13 added directed whispers (ClientChat.to session id / ServerChat.whisper flag);
 * v14 added the online roster query (ClientWho / ServerWho);
 * v15 added GM tooling (ClientGm + ServerWelcome.gm);
 * v16 added droppable ground items (ClientDropItem / ClientPickupItem / ServerWorldItems /
 *     ServerItemGranted) — the way players trade now that bank/mail/trade are scrapped;
 * v17 added the server-authoritative inventory channel (ServerInventory — the owner's bag / gold /
 *     equipment) as the economy migration begins moving inventory authority server-side.
 */
export const NET_PROTOCOL_VERSION = 17;

/** Max players in one party (GDD §Party). */
export const MAX_PARTY = 4;

/** Valid party actions on the wire (validated at the boundary; the server enforces semantics). */
const PARTY_ACTIONS = ['invite', 'accept', 'decline', 'leave', 'kick'];

/** Valid GM actions on the wire (the server re-checks GM privilege before acting). */
const GM_ACTIONS = ['kick', 'mute', 'unmute', 'ban', 'unban', 'teleport', 'give'];

/** Valid inventory actions on the wire (the server re-validates each against the authoritative bag). */
const INV_ACTIONS = ['equip', 'unequip', 'sell', 'buy', 'buyback'];

/** Max chat text length accepted at the wire (the server trims further). */
export const MAX_CHAT_LEN = 300;

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

/**
 * How a server-authoritative enemy appears to clients — the replication view of a
 * `CombatEntity` of faction 'enemy'. Position/hp/state are the server's truth; the client
 * renders and interpolates it exactly like a remote player (it never simulates the enemy).
 * `enemyId` is the EnemyDef id so the client picks the right voxel model; `state` is the
 * AI state ('idle' | 'aggro' | 'leash') for animation selection.
 */
export interface NetEntity {
  id: string;
  /** EnemyDef id (e.g. 'wolf'), for model selection on the client. */
  enemyId: string;
  name: string;
  level: number;
  x: number;
  y: number;
  z: number;
  /** Facing yaw in radians. */
  yaw: number;
  hp: number;
  maxHP: number;
  /** AI state for animation: 'idle' | 'aggro' | 'leash'. */
  state: string;
  /** Skill id the enemy is currently casting, or null — drives the target-frame cast bar +
   * the wind-up animation. Server-authoritative (the client never simulates enemy casts). */
  castSkill: string | null;
  /** Cast progress 0..1 (0 when not casting). */
  castFrac: number;
}

/**
 * A stack of items lying on the ground — the replication view of a server-authoritative world
 * item. Any player nearby can pick it up (first-come-wins, resolved server-side), and it despawns
 * after a fixed lifetime. This is how players trade now (bank/mail/trade were scrapped): you drop
 * a stack, another player walks over and picks it up. `item` is a full loot-rolled ItemDef (there
 * is no registry id for procedural loot), `qty` the stack size, and `x/y/z` the drop position.
 */
export interface NetWorldItem {
  id: string;
  item: ItemDef;
  qty: number;
  x: number;
  y: number;
  z: number;
}

/**
 * The FULL kinematic state of a player — the wire form of PlayerPhysics. Sent only to
 * a player about THEIR OWN character (ServerSelf) so the client can reconcile its
 * prediction. Full physics (not just position) is required because the client resumes
 * the shared movement integrator from this state: `vx/vy/vz` carry momentum and
 * accumulated gravity, `onGround` gates jumping and the step-up assist, and `inWater`
 * selects the buoyancy/swim branch. Reset position-only and the first replayed tick
 * integrates the wrong dynamics — exactly during falls, jumps, and water.
 */
export interface NetSelf {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  onGround: boolean;
  inWater: boolean;
  move: MoveState;
}

/** Project the authoritative physics onto the wire (server side). */
export function physToNetSelf(p: PlayerPhysics): NetSelf {
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    vx: p.vx,
    vy: p.vy,
    vz: p.vz,
    yaw: p.yaw,
    onGround: p.onGround,
    inWater: p.inWater,
    move: p.moveState,
  };
}

/** Overwrite a physics record with an authoritative self-state (client side). */
export function applyNetSelf(dst: PlayerPhysics, s: NetSelf): void {
  dst.x = s.x;
  dst.y = s.y;
  dst.z = s.z;
  dst.vx = s.vx;
  dst.vy = s.vy;
  dst.vz = s.vz;
  dst.yaw = s.yaw;
  dst.onGround = s.onGround;
  dst.inWater = s.inWater;
  dst.moveState = s.move;
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
  /**
   * Optional account session token (from POST /auth/login). When present and valid the
   * server binds the session to that account and loads the persisted character (its
   * class/level/position override the name/cls/level fields, which are the guest identity
   * used when no token is supplied). Absent ⇒ an ephemeral guest session.
   */
  token?: string;
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

/**
 * A line of chat typed by the player. The server sanitises and trims `text`, applies a
 * per-connection rate limit, and rebroadcasts it as a ServerChat to every joined session.
 * Untrusted: the server never echoes the raw text — it re-derives the display name and
 * caps length itself, so a client can't spoof another player or blow the wire budget.
 */
export interface ClientChat {
  t: 'chat';
  text: string;
  /**
   * A directed whisper's target SESSION id (the client resolves a typed name → id against its
   * party roster + visible players, so it's unambiguous — names are not unique). Absent for an
   * ordinary (global) say/emote line. The server validates the id is a joined player and routes
   * the line only to that recipient + an echo to the sender.
   */
  to?: string;
}

/**
 * A party control action. `invite` / `kick` carry the target's SESSION id (the client has it from
 * the snapshot / roster — an id is unambiguous where player names are not); `accept` / `decline`
 * act on the recipient's one pending invite; `leave` drops the sender from its party. All are
 * validated server-side (the server confirms the id is a joined player / a party member).
 */
export interface ClientParty {
  t: 'party';
  action: 'invite' | 'accept' | 'decline' | 'leave' | 'kick';
  /** Target player session id for `invite` / `kick`; ignored otherwise. */
  target?: string;
}

/** A request for the current online-player roster (answered with a ServerWho). No payload. */
export interface ClientWho {
  t: 'who';
}

/**
 * A GM tooling action. Gated server-side on the sender's account `is_gm` flag (never trusted from
 * the client). `target` is a player NAME — a GM is trusted, so the server resolves it globally and
 * reports the result on the system channel. Field use by action: `mute` → `minutes`; `teleport` →
 * `x`/`z`; `give` → `item` (registry id) + `qty`; `kick`/`ban`/`unban`/`unmute` → none.
 */
export interface ClientGm {
  t: 'gm';
  action: 'kick' | 'mute' | 'unmute' | 'ban' | 'unban' | 'teleport' | 'give';
  target: string;
  minutes?: number;
  x?: number;
  z?: number;
  item?: string;
  qty?: number;
}

/**
 * Drop a bag stack onto the ground at the player's position — the way players hand items to each
 * other now. The client sends the full `item` (procedural loot has no registry id) + `qty`; the
 * server spawns the world item at the sender's AUTHORITATIVE position (it never trusts a
 * client-supplied position). Trust note: while inventory is still client-authoritative, the server
 * can't verify the sender actually held the stack — this is consistent with the current model (a
 * cheat client can already edit its own local bag). Server-side inventory authority (the economy
 * migration) will validate the drop against the real bag.
 */
export interface ClientDropItem {
  t: 'dropItem';
  item: ItemDef;
  qty: number;
}

/**
 * Pick up a ground item by id. The server validates the item exists and the sender is within
 * pickup range, then removes it ATOMICALLY — first-come-wins. That authoritative removal is the
 * anti-duplication guarantee: two players racing for one stack, only one gets it.
 */
export interface ClientPickupItem {
  t: 'pickupItem';
  id: string;
}

/**
 * A server-validated inventory action (economy migration, Stage 1b). Each mutates the recipient's
 * OWN authoritative inventory, which the server re-validates before applying (capacity, gold,
 * equippability, valid index/slot) — a cheat client can't equip what it can't wear or oversell.
 * `equip`/`sell`/`buyback` carry a bag/buyback `index`; `unequip` a `slot`; `buy` the vendor's
 * `seed` + `tier` + stock `index` (the server recomputes the deterministic stock + price, so the
 * client can't set its own price).
 */
export interface ClientInvAction {
  t: 'inv';
  action: 'equip' | 'unequip' | 'sell' | 'buy' | 'buyback';
  index?: number;
  slot?: string;
  seed?: number;
  tier?: number;
}

export type ClientMessage =
  | ClientHello
  | ClientIntent
  | ClientPing
  | ClientChat
  | ClientParty
  | ClientWho
  | ClientGm
  | ClientDropItem
  | ClientPickupItem
  | ClientInvAction;

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
  /** True when this session's account has GM privileges (unlocks the client's GM commands). */
  gm?: boolean;
}

/**
 * Complete state of the visible players — sent on join and on (re)subscribe. With
 * interest management this is the interest-filtered set around the joiner (the 3×3
 * chunk region), always including the joiner's own player, not the whole world.
 */
export interface ServerSnapshot {
  t: 'snapshot';
  tick: number;
  players: NetPlayer[];
  /** Interest-filtered enemy entities around the joiner (server-authoritative). */
  entities: NetEntity[];
}

/**
 * Incremental update. `players` are those that entered the recipient's interest or
 * changed within it (full state each — an entering player has no prior baseline).
 * `gone` are ids to DESPAWN: either they left the recipient's interest region or they
 * disconnected — the client despawns them the same way in both cases.
 */
export interface ServerDelta {
  t: 'delta';
  tick: number;
  players: NetPlayer[];
  gone: string[];
  /** Enemy entities that entered the recipient's interest or changed within it. */
  entities: NetEntity[];
  /** Enemy ids to DESPAWN: left interest, died, or were removed from the sim. */
  goneEntities: string[];
}

/**
 * The recipient's OWN authoritative state + the highest input sequence the server has
 * applied (`ackedSeq`). Sent per-connection at the broadcast cadence, independent of
 * interest. The client resets its prediction to `phys` and replays inputs with
 * seq > ackedSeq — client-side prediction reconciliation (ARCH §7).
 */
export interface ServerSelf {
  t: 'self';
  tick: number;
  ackedSeq: number;
  phys: NetSelf;
}

/**
 * The recipient's OWN combat state — health, resource, target, cast, and combat flags —
 * projected from its authoritative player `CombatEntity` on the server. Sent per-connection
 * at the broadcast cadence (independent of interest, like ServerSelf). This is the wire form
 * of what the client's combat HUD used to read from its LOCAL combat sim; server-authoritative
 * now (ARCH §7). Kinematics stay on the ServerSelf channel — this carries only combat.
 */
export interface NetCombatSelf {
  hp: number;
  maxHP: number;
  resource: number;
  maxResource: number;
  /** ResourceKind value as a string (e.g. 'rage', 'mana'); decouples the wire from the enum. */
  resourceKind: string;
  level: number;
  /** Total lifetime XP (the client derives level + xp-into-level; server-authoritative). */
  totalXp: number;
  /** Current target entity id (player or enemy), or null. */
  targetId: string | null;
  /** Skill id currently being cast, or null when not casting. */
  castSkill: string | null;
  /** Cast progress 0..1 (0 when not casting). */
  castFrac: number;
  dead: boolean;
  inCombat: boolean;
}

/** The recipient's own combat state (health / resource / target / cast). */
export interface ServerCombatSelf {
  t: 'combatSelf';
  tick: number;
  self: NetCombatSelf;
}

/** One stack of looted items on the wire — a full item definition (loot generates unique,
 * rolled items, not registry ids) plus a quantity. Same shape as the save's `ItemStackSave`. */
export interface NetItemStack {
  item: ItemDef;
  qty: number;
}

/**
 * A kill credited to the recipient — the server-authoritative outcome of THIS player landing
 * the killing blow on an enemy. `enemyId` is the enemy DEFINITION id (e.g. 'thornbackBoar')
 * so the client can advance its (still client-side) quest / bounty objectives; `gold` + `items`
 * are the server's authoritative loot roll for the kill (possibly empty). Sent once per kill to
 * the killer only. The client is the inventory/gold AGGREGATOR (it also holds quest / craft /
 * vendor changes), so it applies this grant onto its own bag under its own capacity rules — the
 * server owns WHAT dropped, the client owns where it goes. (Full server-side inventory authority
 * follows when quests/crafting/vendors migrate.)
 */
export interface ServerKill {
  t: 'kill';
  tick: number;
  enemyId: string;
  gold: number;
  items: NetItemStack[];
}

/**
 * One authoritative combat visual to play at a world position: a damage / heal floater (+ hit
 * spark), an enemy death poof, or a boss-phase line. Purely cosmetic — the numbers that matter
 * (hp / resource) ride the combat-self channel; this makes the WORLD's combat legible (incoming
 * hits on you, other players' fights, monster deaths) which client prediction alone can't show.
 * The position is server-resolved so the client renders it even for a corpse it has already
 * dropped.
 */
export interface NetCombatEvent {
  kind: 'damage' | 'heal' | 'death' | 'boss';
  x: number;
  y: number;
  z: number;
  /** Damage / heal amount (0 for death / boss). */
  amount: number;
  /** Whether the hit crit (false for death / boss). */
  crit: boolean;
  /** Boss-phase line (only on `kind:'boss'`). */
  text?: string;
}

/** A batch of authoritative combat visuals for the recipient's vicinity this broadcast. Interest-
 * filtered, and the recipient's OWN outgoing hits are omitted (the client predicts those). */
export interface ServerCombatEvents {
  t: 'fx';
  tick: number;
  events: NetCombatEvent[];
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

/**
 * A chat line rebroadcast to every joined session. `fromId` is the sender's session id
 * (so the client can flag its own lines) and `from` is the server-authoritative display
 * name — never the client-supplied name — so no player can impersonate another. When
 * `emote` is set, `text` is a third-person action phrase and the client renders it as
 * `${from} ${text}` (an emote line) rather than `${from}: ${text}`.
 */
export interface ServerChat {
  t: 'chat';
  fromId: string;
  from: string;
  text: string;
  tick: number;
  emote?: boolean;
  /**
   * A directed whisper. `from` is the OTHER party's display name in both copies (the recipient's
   * sender, the sender's echo target); the client renders `From ${from}:` when the line isn't its
   * own (fromId ≠ you) and `To ${from}:` when it is (fromId = you).
   */
  whisper?: boolean;
}

/** One member of a party, as the client's party panel shows them. */
export interface NetPartyMember {
  /** Session id (matches NetPlayer.id — the client can cross-reference for position). */
  id: string;
  name: string;
  /** CharacterClass value as a string. */
  cls: string;
  level: number;
}

/**
 * The recipient's current party roster. `members` is empty (and `leaderId` '') when the recipient
 * is solo — so this frame both forms and disbands the party panel. Sent to every affected member
 * on any party change (join / leave / kick / disband / disconnect).
 */
export interface ServerPartyState {
  t: 'partyState';
  members: NetPartyMember[];
  leaderId: string;
}

/** A pending party invite the recipient can accept / decline (from a server-authoritative name). */
export interface ServerPartyInvite {
  t: 'partyInvite';
  fromId: string;
  fromName: string;
}

/** One party member's live combat vitals, for the ally frames (keyed by session id). */
export interface NetPartyVital {
  id: string;
  hp: number;
  maxHP: number;
  resource: number;
  maxResource: number;
  /** ResourceKind value as a string (e.g. 'rage', 'mana') — tints the resource bar. */
  resourceKind: string;
  /** True when the member is dead (grey out the frame). */
  dead: boolean;
}

/**
 * Live vitals for the recipient's whole party (including themselves), sent at broadcast cadence.
 * Unlike entity replication this is NOT interest-filtered — you see your party's health across the
 * world, apart or together. Sent only to players who are in a party; solo players get none.
 */
export interface ServerPartyVitals {
  t: 'partyVitals';
  tick: number;
  vitals: NetPartyVital[];
}

/** One online player in the /who roster (identity only — no position). */
export interface NetWhoEntry {
  name: string;
  level: number;
  /** CharacterClass value as a string. */
  cls: string;
}

/** The current online-player roster, in reply to a ClientWho (capped server-side). */
export interface ServerWho {
  t: 'who';
  players: NetWhoEntry[];
}

/**
 * Interest-filtered ground items around the recipient (the 3×3-chunk region, same policy as
 * enemies). `items` are those that ENTERED interest (newly dropped, or the viewer moved into
 * range); `gone` are ids to REMOVE (picked up, despawned, or left interest). A ground item is
 * immutable once dropped, so there is no UPDATE case — an id appears in `items` exactly once.
 */
export interface ServerWorldItems {
  t: 'worldItems';
  tick: number;
  items: NetWorldItem[];
  gone: string[];
}

/**
 * A server grant of item stacks straight into the recipient's bag — sent when the player picks a
 * ground item up. Kept separate from ServerKill so a pickup plays a loot cue (not a death cue) and
 * never advances quest/bounty objectives. The client is the bag aggregator, so capacity rules
 * apply where it places the stacks.
 */
export interface ServerItemGranted {
  t: 'grant';
  tick: number;
  items: NetItemStack[];
}

/**
 * The recipient's OWN authoritative inventory — bag stacks, gold, and worn equipment — sent to the
 * owner only (like ServerSelf / ServerCombatSelf), at broadcast cadence when it changes. As the
 * economy migrates server-side, this becomes the single source of truth the client's bag / gold /
 * character sheet render from; the client stops locally aggregating loot into a client-owned bag.
 */
export interface ServerInventory {
  t: 'inventory';
  tick: number;
  bag: NetItemStack[];
  gold: number;
  /** Equip slot id → the worn item (a full ItemDef, same shape as the save's equipment map). */
  equipment: Record<string, ItemDef>;
}

export type ServerMessage =
  | ServerWelcome
  | ServerSnapshot
  | ServerDelta
  | ServerSelf
  | ServerCombatSelf
  | ServerKill
  | ServerCombatEvents
  | ServerPartyState
  | ServerPartyInvite
  | ServerPartyVitals
  | ServerWho
  | ServerWorldItems
  | ServerItemGranted
  | ServerInventory
  | ServerPong
  | ServerError
  | ServerChat;

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

/**
 * A non-negative SAFE integer — the shape of a sequence number / tick counter on the
 * wire. Safe-integer bounds it (≤ 2^53−1, ~14k years at 20 Hz) so a fractional, negative,
 * or absurdly large value can't poison the server's monotonic sequence gate.
 */
function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/**
 * Deep sanity check on an untrusted item object (a dropped `ItemDef`). Rejects any NON-FINITE
 * number anywhere in the tree — a NaN/Infinity stat would poison a PICKER's character sheet and
 * combat math once it flows drop → grant → equip — and bounds depth + node count so a pathological
 * object can't blow the stack or memory. Boundary hardening, not full schema validation: a
 * finite-but-absurd stat still passes here (that's closed by server-authoritative items in the
 * economy migration), but the crash/corruption vector is shut.
 */
function isSafeItemTree(v: unknown, depth: number, budget: { n: number }): boolean {
  if (depth > 8) return false;
  if (--budget.n < 0) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' || typeof v === 'boolean' || v === null) return true;
  if (Array.isArray(v)) {
    for (const el of v) if (!isSafeItemTree(el, depth + 1, budget)) return false;
    return true;
  }
  if (typeof v === 'object') {
    for (const val of Object.values(v as Record<string, unknown>)) {
      if (!isSafeItemTree(val, depth + 1, budget)) return false;
    }
    return true;
  }
  return false; // functions / symbols / undefined — never valid JSON item data
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
    case 'hello': {
      if (!isFiniteNumber(o.protocol) || !isString(o.name) || !isString(o.cls)) return null;
      if (!isFiniteNumber(o.level)) return null;
      const hello: ClientHello = {
        t: 'hello',
        protocol: o.protocol,
        name: o.name,
        cls: o.cls,
        level: o.level,
      };
      if (o.token !== undefined) {
        if (!isString(o.token)) return null;
        hello.token = o.token;
      }
      return hello;
    }
    case 'intent': {
      // seq/tick must be non-negative integers: the server's monotonic seq gate would be
      // poisoned by a huge or fractional value (dropping all later inputs of that session).
      if (!isNonNegInt(o.seq) || !isNonNegInt(o.tick)) return null;
      const intent = validateIntent(o.intent);
      if (intent === null) return null;
      return { t: 'intent', seq: o.seq, tick: o.tick, intent };
    }
    case 'ping':
      if (!isFiniteNumber(o.id) || !isFiniteNumber(o.clientTime)) return null;
      return { t: 'ping', id: o.id, clientTime: o.clientTime };
    case 'chat': {
      // Structural only: non-empty string, capped at the wire limit. The server still
      // trims whitespace, collapses control chars, and rate-limits before rebroadcast.
      if (!isString(o.text) || o.text.length === 0 || o.text.length > MAX_CHAT_LEN) return null;
      // An optional whisper target (session id); the server validates it's a joined player.
      if (o.to !== undefined && (!isString(o.to) || o.to.length > MAX_CHAT_LEN)) return null;
      const chat: ClientChat = { t: 'chat', text: o.text };
      if (o.to !== undefined) chat.to = o.to;
      return chat;
    }
    case 'who':
      return { t: 'who' };
    case 'party': {
      if (!isString(o.action) || !PARTY_ACTIONS.includes(o.action)) return null;
      // A target name (invite / kick) is optional here; the server validates + caps it.
      if (o.target !== undefined && (!isString(o.target) || o.target.length > MAX_CHAT_LEN)) {
        return null;
      }
      const party: ClientParty = { t: 'party', action: o.action as ClientParty['action'] };
      if (o.target !== undefined) party.target = o.target;
      return party;
    }
    case 'gm': {
      if (!isString(o.action) || !GM_ACTIONS.includes(o.action)) return null;
      if (!isString(o.target) || o.target.length > MAX_CHAT_LEN) return null;
      const gm: ClientGm = { t: 'gm', action: o.action as ClientGm['action'], target: o.target };
      if (o.minutes !== undefined) {
        if (!isFiniteNumber(o.minutes)) return null;
        gm.minutes = o.minutes;
      }
      if (o.x !== undefined) {
        if (!isFiniteNumber(o.x)) return null;
        gm.x = o.x;
      }
      if (o.z !== undefined) {
        if (!isFiniteNumber(o.z)) return null;
        gm.z = o.z;
      }
      if (o.item !== undefined) {
        if (!isString(o.item) || o.item.length > MAX_CHAT_LEN) return null;
        gm.item = o.item;
      }
      if (o.qty !== undefined) {
        if (!isFiniteNumber(o.qty)) return null;
        gm.qty = o.qty;
      }
      return gm;
    }
    case 'dropItem': {
      // The dropped item is a full ItemDef (procedural loot has no registry id). Structural
      // gate only: an object with a string id + name and a positive integer qty; the server
      // clamps qty and stamps the authoritative position. Semantic ownership isn't checkable
      // while inventory is client-authoritative (see ClientDropItem's trust note).
      if (typeof o.item !== 'object' || o.item === null) return null;
      const item = o.item as Record<string, unknown>;
      if (!isString(item.id) || !isString(item.name)) return null;
      // Reject NaN/Infinity anywhere in the item + bound its size — a forged item is re-broadcast
      // to and stored by OTHER players, so a poisoned stat can't be allowed through.
      if (!isSafeItemTree(o.item, 0, { n: 256 })) return null;
      if (!isNonNegInt(o.qty) || o.qty < 1) return null;
      return { t: 'dropItem', item: o.item as unknown as ItemDef, qty: o.qty };
    }
    case 'pickupItem': {
      if (!isString(o.id) || o.id.length === 0 || o.id.length > MAX_CHAT_LEN) return null;
      return { t: 'pickupItem', id: o.id };
    }
    case 'inv': {
      if (!isString(o.action) || !INV_ACTIONS.includes(o.action)) return null;
      const act: ClientInvAction = { t: 'inv', action: o.action as ClientInvAction['action'] };
      // Optional fields are validated when present; the gateway enforces which each action needs.
      if (o.index !== undefined) {
        if (!isNonNegInt(o.index)) return null;
        act.index = o.index;
      }
      if (o.slot !== undefined) {
        if (!isString(o.slot) || o.slot.length > 32) return null;
        act.slot = o.slot;
      }
      if (o.seed !== undefined) {
        if (!isFiniteNumber(o.seed)) return null;
        act.seed = o.seed;
      }
      if (o.tier !== undefined) {
        if (!isNonNegInt(o.tier)) return null;
        act.tier = o.tier;
      }
      return act;
    }
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

function isNetEntity(v: unknown): v is NetEntity {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isString(o.enemyId) &&
    isString(o.name) &&
    isFiniteNumber(o.level) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z) &&
    isFiniteNumber(o.yaw) &&
    isFiniteNumber(o.hp) &&
    isFiniteNumber(o.maxHP) &&
    isString(o.state) &&
    (o.castSkill === null || isString(o.castSkill)) &&
    isFiniteNumber(o.castFrac)
  );
}

/** Validate an optional NetEntity[] wire field, returning [] when absent. Null ⇒ invalid. */
function decodeEntities(v: unknown): NetEntity[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every(isNetEntity)) return null;
  return v;
}

function isNetSelf(v: unknown): v is NetSelf {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z) &&
    isFiniteNumber(o.vx) &&
    isFiniteNumber(o.vy) &&
    isFiniteNumber(o.vz) &&
    isFiniteNumber(o.yaw) &&
    isBool(o.onGround) &&
    isBool(o.inWater) &&
    isString(o.move)
  );
}

function isNetCombatSelf(v: unknown): v is NetCombatSelf {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isFiniteNumber(o.hp) &&
    isFiniteNumber(o.maxHP) &&
    isFiniteNumber(o.resource) &&
    isFiniteNumber(o.maxResource) &&
    isString(o.resourceKind) &&
    isFiniteNumber(o.level) &&
    isFiniteNumber(o.totalXp) &&
    (o.targetId === null || isString(o.targetId)) &&
    (o.castSkill === null || isString(o.castSkill)) &&
    isFiniteNumber(o.castFrac) &&
    isBool(o.dead) &&
    isBool(o.inCombat)
  );
}

/**
 * A looted item stack on the wire. This is a SERVER→client frame (the server is trusted), so
 * we do a structural sanity check rather than full item validation: an `item` object with a
 * string id + name (enough that a corrupted frame can't crash the bag UI) and a finite qty.
 * The `item` is passed through as an `ItemDef` — the client consumes the same shape from its
 * own save.
 */
function isNetItemStack(v: unknown): v is NetItemStack {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.qty) || typeof o.item !== 'object' || o.item === null) return false;
  const item = o.item as Record<string, unknown>;
  return isString(item.id) && isString(item.name);
}

/**
 * A worn-equipment map on the wire (slot id → ItemDef) for ServerInventory. SERVER→client (trusted),
 * so a structural check: an object whose every value is an item with a string id + name. Returns the
 * validated map, or null on a malformed shape.
 */
function decodeEquipment(v: unknown): Record<string, ItemDef> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: Record<string, ItemDef> = {};
  for (const [slot, item] of Object.entries(v as Record<string, unknown>)) {
    if (typeof item !== 'object' || item === null) return null;
    const it = item as Record<string, unknown>;
    if (!isString(it.id) || !isString(it.name)) return null;
    out[slot] = item as unknown as ItemDef;
  }
  return out;
}

/** A ground item on the wire (SERVER→client; trusted source, so a structural sanity check). */
function isNetWorldItem(v: unknown): v is NetWorldItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!isString(o.id) || !isFiniteNumber(o.qty)) return false;
  if (!isFiniteNumber(o.x) || !isFiniteNumber(o.y) || !isFiniteNumber(o.z)) return false;
  if (typeof o.item !== 'object' || o.item === null) return false;
  const item = o.item as Record<string, unknown>;
  return isString(item.id) && isString(item.name);
}

const FX_KINDS = new Set(['damage', 'heal', 'death', 'boss']);

/** Validate one combat-visual record. Position + amount finite; kind known; optional boss text. */
function isNetCombatEvent(v: unknown): v is NetCombatEvent {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.kind) &&
    FX_KINDS.has(o.kind) &&
    isFiniteNumber(o.x) &&
    isFiniteNumber(o.y) &&
    isFiniteNumber(o.z) &&
    isFiniteNumber(o.amount) &&
    isBool(o.crit) &&
    (o.text === undefined || isString(o.text))
  );
}

/** Decode a server frame on the client. Null ⇒ drop (protocol drift / corruption). */
export function decodeServer(raw: string): ServerMessage | null {
  const o = parseObject(raw);
  if (o === null) return null;
  switch (o.t) {
    case 'welcome': {
      if (
        !isFiniteNumber(o.protocol) ||
        !isString(o.you) ||
        !isFiniteNumber(o.seed) ||
        !isFiniteNumber(o.tick) ||
        !isFiniteNumber(o.tickRate)
      ) {
        return null;
      }
      const welcome: ServerWelcome = {
        t: 'welcome',
        protocol: o.protocol,
        you: o.you,
        seed: o.seed,
        tick: o.tick,
        tickRate: o.tickRate,
      };
      if (o.gm !== undefined) {
        if (!isBool(o.gm)) return null;
        welcome.gm = o.gm;
      }
      return welcome;
    }
    case 'snapshot': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.players)) return null;
      if (!o.players.every(isNetPlayer)) return null;
      const entities = decodeEntities(o.entities);
      if (entities === null) return null;
      return { t: 'snapshot', tick: o.tick, players: o.players, entities };
    }
    case 'delta': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.players) || !Array.isArray(o.gone)) {
        return null;
      }
      if (!o.players.every(isNetPlayer) || !o.gone.every(isString)) return null;
      const entities = decodeEntities(o.entities);
      if (entities === null) return null;
      const goneEntities =
        o.goneEntities === undefined
          ? []
          : Array.isArray(o.goneEntities) && o.goneEntities.every(isString)
            ? (o.goneEntities as string[])
            : null;
      if (goneEntities === null) return null;
      return { t: 'delta', tick: o.tick, players: o.players, gone: o.gone, entities, goneEntities };
    }
    case 'self': {
      if (!isFiniteNumber(o.tick) || !isFiniteNumber(o.ackedSeq) || !isNetSelf(o.phys)) return null;
      return { t: 'self', tick: o.tick, ackedSeq: o.ackedSeq, phys: o.phys };
    }
    case 'combatSelf': {
      if (!isFiniteNumber(o.tick) || !isNetCombatSelf(o.self)) return null;
      return { t: 'combatSelf', tick: o.tick, self: o.self };
    }
    case 'kill': {
      if (
        !isFiniteNumber(o.tick) ||
        !isString(o.enemyId) ||
        !isFiniteNumber(o.gold) ||
        !Array.isArray(o.items) ||
        !o.items.every(isNetItemStack)
      ) {
        return null;
      }
      return { t: 'kill', tick: o.tick, enemyId: o.enemyId, gold: o.gold, items: o.items };
    }
    case 'fx': {
      if (
        !isFiniteNumber(o.tick) ||
        !Array.isArray(o.events) ||
        !o.events.every(isNetCombatEvent)
      ) {
        return null;
      }
      return { t: 'fx', tick: o.tick, events: o.events };
    }
    case 'pong':
      if (!isFiniteNumber(o.id) || !isFiniteNumber(o.clientTime) || !isFiniteNumber(o.serverTick)) {
        return null;
      }
      return { t: 'pong', id: o.id, clientTime: o.clientTime, serverTick: o.serverTick };
    case 'error':
      if (!isString(o.code) || !isString(o.message)) return null;
      return { t: 'error', code: o.code, message: o.message };
    case 'chat': {
      if (
        !isString(o.fromId) ||
        !isString(o.from) ||
        !isString(o.text) ||
        !isFiniteNumber(o.tick)
      ) {
        return null;
      }
      const chat: ServerChat = {
        t: 'chat',
        fromId: o.fromId,
        from: o.from,
        text: o.text,
        tick: o.tick,
      };
      if (o.whisper !== undefined) {
        if (!isBool(o.whisper)) return null;
        chat.whisper = o.whisper;
      }
      if (o.emote !== undefined) {
        if (!isBool(o.emote)) return null;
        chat.emote = o.emote;
      }
      return chat;
    }
    case 'partyState': {
      if (
        !isString(o.leaderId) ||
        !Array.isArray(o.members) ||
        !o.members.every(isNetPartyMember)
      ) {
        return null;
      }
      return { t: 'partyState', leaderId: o.leaderId, members: o.members };
    }
    case 'partyInvite':
      if (!isString(o.fromId) || !isString(o.fromName)) return null;
      return { t: 'partyInvite', fromId: o.fromId, fromName: o.fromName };
    case 'partyVitals': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.vitals) || !o.vitals.every(isNetPartyVital)) {
        return null;
      }
      return { t: 'partyVitals', tick: o.tick, vitals: o.vitals };
    }
    case 'who': {
      if (!Array.isArray(o.players) || !o.players.every(isNetWhoEntry)) return null;
      return { t: 'who', players: o.players };
    }
    case 'worldItems': {
      if (
        !isFiniteNumber(o.tick) ||
        !Array.isArray(o.items) ||
        !o.items.every(isNetWorldItem) ||
        !Array.isArray(o.gone) ||
        !o.gone.every(isString)
      ) {
        return null;
      }
      return { t: 'worldItems', tick: o.tick, items: o.items, gone: o.gone };
    }
    case 'grant': {
      if (!isFiniteNumber(o.tick) || !Array.isArray(o.items) || !o.items.every(isNetItemStack)) {
        return null;
      }
      return { t: 'grant', tick: o.tick, items: o.items };
    }
    case 'inventory': {
      if (!isFiniteNumber(o.tick) || !isFiniteNumber(o.gold)) return null;
      if (!Array.isArray(o.bag) || !o.bag.every(isNetItemStack)) return null;
      const equipment = decodeEquipment(o.equipment);
      if (equipment === null) return null;
      return { t: 'inventory', tick: o.tick, bag: o.bag, gold: o.gold, equipment };
    }
    default:
      return null;
  }
}

function isNetPartyMember(v: unknown): v is NetPartyMember {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isString(o.id) && isString(o.name) && isString(o.cls) && isFiniteNumber(o.level);
}

function isNetPartyVital(v: unknown): v is NetPartyVital {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    isString(o.id) &&
    isFiniteNumber(o.hp) &&
    isFiniteNumber(o.maxHP) &&
    isFiniteNumber(o.resource) &&
    isFiniteNumber(o.maxResource) &&
    isString(o.resourceKind) &&
    isBool(o.dead)
  );
}

function isNetWhoEntry(v: unknown): v is NetWhoEntry {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isString(o.name) && isFiniteNumber(o.level) && isString(o.cls);
}
