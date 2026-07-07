// The browser side of the Phase-6 netcode. Mirror of the server gateway: it sends the
// local player's intents, reconciles its own prediction against the server's authority,
// and renders the OTHER players the server reports — interpolated in the recent past so
// their motion is smooth despite a 10 Hz wire (ARCH §7). It is entirely OPT-IN: the game
// constructs a NetClient only when a server URL is configured, so the single-player
// build stays server-free.
//
// Three responsibilities live here:
//   1. Reconciliation — keep a history of unacknowledged inputs; when the server reports
//      our authoritative state + the last input it applied, the game resets prediction
//      to that state and replays the unacked inputs (see game.ts reconcileSelf).
//   2. Remote interpolation — buffer snapshots on the SERVER's timeline (each carries a
//      server tick) so jittery arrival can't warp a remote's apparent speed; render
//      ~150 ms behind an estimated server clock.
//   3. Connection UX — measure RTT with pings and expose a connection phase + latency.

import {
  decodeServer,
  encodeClient,
  lerp,
  lerpAngle,
  NET_PROTOCOL_VERSION,
  CharacterClass,
  CHARACTER_CLASSES,
  TICK_DURATION_MS,
  type Intent,
  type MoveIntent,
  type MoveState,
  type NetCombatEvent,
  type NetCombatSelf,
  type NetEntity,
  type NetPartyMember,
  type NetPartyVital,
  type NetPlayer,
  type NetWhoEntry,
  type ServerKill,
  type ServerSelf,
} from '@pathlands/shared';

/** What the renderer needs to draw one remote player this frame. */
export interface RemoteRenderState {
  id: string;
  name: string;
  cls: CharacterClass;
  level: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  move: MoveState;
}

export type NetPhase = 'connecting' | 'connected' | 'reconnecting';

/** A chat line delivered from the server, tagged with whether it is our own. */
export interface ChatEvent {
  fromId: string;
  from: string;
  text: string;
  /** True when the server attributes this line to our own session. */
  self: boolean;
  /** True when `text` is a third-person emote phrase (render `${from} ${text}`). */
  emote: boolean;
  /** True for a directed whisper — `from` is the other party; render `To/From ${from}:`. */
  whisper: boolean;
}

/** The party roster as the UI needs it: the leader, the members, and which member is us. */
export interface PartyEvent {
  leaderId: string;
  /** Empty ⇒ we are solo (the UI hides the party panel). */
  members: NetPartyMember[];
  /** Our own session id, so the UI can flag "you" + gate leader-only controls. */
  selfId: string;
}

/** A pending party invite awaiting our accept/decline, or null once resolved/cleared. */
export interface InviteEvent {
  fromId: string;
  fromName: string;
}

/** Connection status surfaced to the UI (indicator, reconnect notice, latency). */
export interface NetStatus {
  phase: NetPhase;
  connected: boolean;
  /** Number of other players currently visible. */
  peers: number;
  /** Our own session id, once welcomed. */
  you: string | null;
  /** EWMA-smoothed round-trip latency in ms; null until the first pong / after a drop. */
  latencyMs: number | null;
}

export interface NetClientOptions {
  url: string;
  /** Guest identity; plus an optional account session token (accounts, Phase-6 Part 4). */
  identity: { name: string; cls: string; level: number; token?: string };
  /** How far in the past to render remotes (ms). ≥ ~1.5× the wire interval (ARCH §7). */
  renderDelayMs?: number;
  /** Notified whenever connection status changes. */
  onStatus?: (status: NetStatus) => void;
  /** Called when the server rejects our token (expired/invalid) — the UI should re-login. */
  onAuthError?: () => void;
  /** Called for every chat line the server broadcasts (our own included). */
  onChat?: (line: ChatEvent) => void;
  /** Called whenever our party roster changes (empty members ⇒ we went solo). */
  onParty?: (state: PartyEvent) => void;
  /** Called when a party invite arrives (payload) or is cleared on disconnect (null). */
  onInvite?: (invite: InviteEvent | null) => void;
  /** Called at broadcast cadence with our party's live vitals (empty when solo / on disconnect). */
  onPartyVitals?: (vitals: NetPartyVital[]) => void;
  /** Called with the online-player roster in reply to a `/who` (requestWho). */
  onWho?: (players: NetWhoEntry[]) => void;
}

interface Sample {
  /** Position on the SERVER timeline (ms) — jitter-free spacing between snapshots. */
  tMs: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  move: MoveState;
}

interface Track {
  name: string;
  cls: CharacterClass;
  level: number;
  samples: Sample[];
}

const DEFAULT_RENDER_DELAY_MS = 150;
const SAMPLE_HISTORY_MS = 1000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;
/** Cap on buffered unacked inputs (~12.8 s at 20 Hz) — a stalled ack means disconnect. */
const MAX_UNACKED_INPUTS = 256;
/** Smoothing for the local→server clock estimate (low ⇒ steadier, slower to adapt). */
const CLOCK_ALPHA = 0.1;
const PING_INTERVAL_MS = 1000;
const PING_TIMEOUT_MS = 5000;
const RTT_ALPHA = 0.2;
/** If no pong arrives within this window the link is presumed dead → force a reconnect. */
const LIVENESS_TIMEOUT_MS = 3 * PING_INTERVAL_MS;

function toClass(raw: string): CharacterClass {
  return (CHARACTER_CLASSES as readonly string[]).includes(raw)
    ? (raw as CharacterClass)
    : CharacterClass.Warrior;
}

export class NetClient {
  you: string | null = null;
  seed: number | null = null;
  connected = false;

  private ws: WebSocket | null = null;
  private readonly tracks = new Map<string, Track>();
  /** Latest server-authoritative state of each visible enemy (Stage 2b), keyed by id. */
  private readonly enemyMap = new Map<string, NetEntity>();
  /** Position samples per enemy on the SERVER timeline, so enemy MOVEMENT interpolates smoothly
   * ~renderDelay behind (like remote players) instead of snapping at the ~10 Hz delta rate. The
   * non-positional fields (hp / cast / state) still come from enemyMap (latest, not interpolated). */
  private readonly enemySamples = new Map<string, Sample[]>();
  /** Our own authoritative combat state (hp / resource / target / cast), or null pre-join. */
  private lastCombatSelf: NetCombatSelf | null = null;
  /** Kills credited to us since the game last drained them (server-rolled loot + quest id). */
  private readonly killQueue: ServerKill[] = [];
  /** Authoritative combat visuals (floaters / sparks / death poofs) awaiting render. */
  private readonly fxQueue: NetCombatEvent[] = [];
  private seq = 0;
  private localTick = 0;
  private readonly renderDelayMs: number;
  private closedByUser = false;
  private reconnectMs = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // --- reconciliation ---
  private readonly history: { seq: number; intent: MoveIntent }[] = [];
  private pendingSelf: ServerSelf | null = null;

  // --- remote interpolation clock (local→server offset estimate) ---
  private clockOffsetMs = 0;
  private clockInit = false;

  // --- connection UX ---
  private phase: NetPhase = 'connecting';
  private latencyMs: number | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingId = 0;
  private readonly inflightPings = new Map<number, number>();
  /** Local time of the last proof of server liveness (pong/welcome); null while down. */
  private lastPongMs: number | null = null;

  constructor(private readonly opts: NetClientOptions) {
    this.renderDelayMs = opts.renderDelayMs ?? DEFAULT_RENDER_DELAY_MS;
  }

  connect(): void {
    this.closedByUser = false;
    if (this.phase !== 'reconnecting') this.phase = 'connecting';
    this.emitStatus();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.reconnectMs = RECONNECT_BASE_MS;
      const id = this.opts.identity;
      this.send({
        t: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        name: id.name,
        cls: id.cls,
        level: id.level,
        ...(id.token !== undefined ? { token: id.token } : {}),
      });
      this.startPinging();
    });
    ws.addEventListener('message', (ev) => this.onMessage(String(ev.data)));
    ws.addEventListener('close', () => this.onClose());
    ws.addEventListener('error', () => ws.close());
  }

  private onMessage(raw: string): void {
    const msg = decodeServer(raw);
    if (msg === null) return;
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.seed = msg.seed;
        this.connected = true;
        this.phase = 'connected';
        this.lastPongMs = this.nowMs(); // the welcome itself proves the link is alive
        // Fresh session: the server's ack sequence starts over, so reset ours too.
        this.seq = 0;
        this.history.length = 0;
        this.pendingSelf = null;
        this.clockInit = false;
        this.updateClock(msg.tick);
        this.emitStatus();
        break;
      case 'snapshot': {
        this.tracks.clear();
        this.updateClock(msg.tick);
        for (const p of msg.players) this.ingest(p, msg.tick);
        this.enemyMap.clear();
        this.enemySamples.clear();
        for (const e of msg.entities) this.ingestEnemy(e, msg.tick);
        this.emitStatus();
        break;
      }
      case 'delta': {
        this.updateClock(msg.tick);
        for (const p of msg.players) this.ingest(p, msg.tick);
        for (const id of msg.gone) this.tracks.delete(id);
        for (const e of msg.entities) this.ingestEnemy(e, msg.tick);
        for (const id of msg.goneEntities) {
          this.enemyMap.delete(id);
          this.enemySamples.delete(id);
        }
        this.emitStatus();
        break;
      }
      case 'self':
        this.pendingSelf = msg; // last-wins — only the newest authoritative state matters
        break;
      case 'combatSelf':
        this.lastCombatSelf = msg.self; // last-wins own combat state (hp / resource / target / cast)
        break;
      case 'kill':
        this.killQueue.push(msg); // queued (not last-wins) — every kill credits loot + quest progress
        break;
      case 'fx':
        for (const ev of msg.events) this.fxQueue.push(ev); // authoritative floaters / VFX to render
        break;
      case 'pong': {
        this.lastPongMs = this.nowMs(); // any pong proves the server is alive
        const sent = this.inflightPings.get(msg.id);
        if (sent !== undefined) {
          this.inflightPings.delete(msg.id);
          const rtt = this.nowMs() - sent;
          this.latencyMs =
            this.latencyMs === null ? rtt : this.latencyMs * (1 - RTT_ALPHA) + rtt * RTT_ALPHA;
          this.emitStatus();
        }
        break;
      }
      case 'error':
        // The server rejected us and will close the socket. Neither a protocol mismatch
        // nor a rejected token resolves on retry, so stop the reconnect loop; an auth
        // failure additionally tells the UI to re-login.
        if (msg.code === 'protocol' || msg.code === 'auth') this.closedByUser = true;
        if (msg.code === 'auth') this.opts.onAuthError?.();
        break;
      case 'chat':
        this.opts.onChat?.({
          fromId: msg.fromId,
          from: msg.from,
          text: msg.text,
          self: msg.fromId === this.you,
          emote: msg.emote === true,
          whisper: msg.whisper === true,
        });
        break;
      case 'partyState':
        this.opts.onParty?.({
          leaderId: msg.leaderId,
          members: msg.members,
          selfId: this.you ?? '',
        });
        break;
      case 'partyInvite':
        this.opts.onInvite?.({ fromId: msg.fromId, fromName: msg.fromName });
        break;
      case 'partyVitals':
        this.opts.onPartyVitals?.(msg.vitals);
        break;
      case 'who':
        this.opts.onWho?.(msg.players);
        break;
      default:
        break;
    }
  }

  /** Nudge the local→server clock offset toward this frame's server time (EWMA). */
  private updateClock(serverTick: number): void {
    const off = this.nowMs() - serverTick * TICK_DURATION_MS;
    this.clockOffsetMs = this.clockInit
      ? this.clockOffsetMs * (1 - CLOCK_ALPHA) + off * CLOCK_ALPHA
      : off;
    this.clockInit = true;
  }

  /** Estimated current server time in ms (same clock the sample timeline uses). */
  private serverNowMs(): number {
    return this.nowMs() - this.clockOffsetMs;
  }

  private ingest(p: NetPlayer, serverTick: number): void {
    if (p.id === this.you) return; // our own player is drawn by local prediction
    let track = this.tracks.get(p.id);
    if (track === undefined) {
      track = { name: p.name, cls: toClass(p.cls), level: p.level, samples: [] };
      this.tracks.set(p.id, track);
    } else {
      track.name = p.name;
      track.cls = toClass(p.cls);
      track.level = p.level;
    }
    track.samples.push({
      tMs: serverTick * TICK_DURATION_MS,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      move: p.move,
    });
    // Prune history older than a second of server time, keeping at least two to bracket.
    const cutoff = this.serverNowMs() - SAMPLE_HISTORY_MS;
    while (track.samples.length > 2 && track.samples[0]!.tMs < cutoff) track.samples.shift();
  }

  /** Record an enemy's latest full state + append a position sample on the server timeline. */
  private ingestEnemy(e: NetEntity, serverTick: number): void {
    this.enemyMap.set(e.id, e);
    let samples = this.enemySamples.get(e.id);
    if (samples === undefined) {
      samples = [];
      this.enemySamples.set(e.id, samples);
    }
    // `move` is unused for enemies (their anim is driven by render-position delta); reuse the
    // Sample shape so the same `sampleAt` interpolator serves players and enemies.
    samples.push({
      tMs: serverTick * TICK_DURATION_MS,
      x: e.x,
      y: e.y,
      z: e.z,
      yaw: e.yaw,
      move: 'idle',
    });
    const cutoff = this.serverNowMs() - SAMPLE_HISTORY_MS;
    while (samples.length > 2 && samples[0]!.tMs < cutoff) samples.shift();
  }

  private onClose(): void {
    this.connected = false;
    this.ws = null;
    this.stopPinging();
    this.latencyMs = null;
    this.lastPongMs = null;
    // Drop the session identity so the sendIntent gate (`you === null`) closes until the
    // next welcome. Otherwise, during the reconnect window (new socket OPEN but no welcome
    // yet), the game loop would keep sending intents on the OLD seq counter to the server's
    // brand-new player, poisoning its sequence gate so every real input after the welcome
    // reset is dropped — a hard freeze after every reconnect. welcome reseeds all of these.
    this.you = null;
    this.seq = 0;
    this.history.length = 0;
    this.pendingSelf = null;
    this.clockInit = false;
    this.enemyMap.clear();
    this.enemySamples.clear();
    this.lastCombatSelf = null;
    this.killQueue.length = 0;
    this.fxQueue.length = 0;
    // Parties are session-scoped: a dropped session is out of its party (a reconnect is a
    // fresh session the server won't re-group), so clear the UI's roster + any pending invite.
    this.opts.onParty?.({ leaderId: '', members: [], selfId: '' });
    this.opts.onInvite?.(null);
    this.opts.onPartyVitals?.([]);
    if (!this.closedByUser) {
      this.phase = 'reconnecting';
      this.scheduleReconnect();
    }
    this.emitStatus();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectMs;
    this.reconnectMs = Math.min(RECONNECT_MAX_MS, this.reconnectMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) this.connect();
    }, delay);
  }

  // --- ping / RTT ---

  private startPinging(): void {
    this.stopPinging();
    // Start the liveness clock now, so a server that never answers a single ping from the
    // very start is still caught by the timeout (rather than leaving lastPongMs null).
    this.lastPongMs = this.nowMs();
    this.sendPing();
    this.pingTimer = setInterval(() => this.sendPing(), PING_INTERVAL_MS);
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.inflightPings.clear();
  }

  private sendPing(): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN) return;
    const now = this.nowMs();
    // Application-level liveness: on a silent server death / partition (no TCP RST) the
    // socket stays OPEN and 'close' never fires. If no pong has arrived in the liveness
    // window, close the socket ourselves so onClose() drives the reconnect/backoff path.
    if (this.lastPongMs !== null && now - this.lastPongMs > LIVENESS_TIMEOUT_MS) {
      this.ws.close();
      return;
    }
    // Prune probes whose pong never arrived so a flaky link can't leak memory.
    for (const [id, t] of this.inflightPings)
      if (now - t > PING_TIMEOUT_MS) this.inflightPings.delete(id);
    const id = ++this.pingId;
    this.inflightPings.set(id, now);
    this.send({ t: 'ping', id, clientTime: now });
  }

  // --- intents + reconciliation ---

  /** Send the local player's intent for this tick, recording Moves for reconciliation. */
  sendIntent(intent: Intent): void {
    this.localTick += 1;
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.seq += 1;
    if (intent.type === 'Move') {
      this.history.push({ seq: this.seq, intent });
      if (this.history.length > MAX_UNACKED_INPUTS) this.history.shift();
    }
    this.send({ t: 'intent', seq: this.seq, tick: this.localTick, intent });
  }

  /** Send a chat line (dropped silently if not connected). The server sanitises + gates it. */
  sendChat(text: string): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.send({ t: 'chat', text });
  }

  /** Send a directed whisper to a player's session id (the server routes it privately). */
  sendWhisper(toId: string, text: string): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.send({ t: 'chat', text, to: toId });
  }

  /** Ask the server for the current online-player roster (answered via onWho). */
  requestWho(): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.send({ t: 'who' });
  }

  // --- party (Phase 6 §Social) ---

  /** Send a party control action (dropped if not connected). invite/kick target a SESSION id. */
  private sendParty(
    action: 'invite' | 'accept' | 'decline' | 'leave' | 'kick',
    target?: string,
  ): void {
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.send({ t: 'party', action, ...(target !== undefined ? { target } : {}) });
  }
  /** Invite a player (by their session id, which we hold from the roster/snapshot) to the party. */
  partyInvite(id: string): void {
    this.sendParty('invite', id);
  }
  partyAccept(): void {
    this.sendParty('accept');
  }
  partyDecline(): void {
    this.sendParty('decline');
  }
  partyLeave(): void {
    this.sendParty('leave');
  }
  /** Kick a member (leader-only, enforced server-side) by their session id. */
  partyKick(id: string): void {
    this.sendParty('kick', id);
  }

  /** The newest authoritative self-state (consumed once), or null if none pending. */
  takeReconcile(): ServerSelf | null {
    const s = this.pendingSelf;
    this.pendingSelf = null;
    return s;
  }

  /** Prune acked inputs and return the remaining (unacked) intents in send order. */
  drainInputsAfter(ackedSeq: number): MoveIntent[] {
    let i = 0;
    while (i < this.history.length && this.history[i]!.seq <= ackedSeq) i++;
    if (i > 0) this.history.splice(0, i);
    return this.history.map((h) => h.intent);
  }

  // --- server-authoritative combat (Stage 2b) ---

  /**
   * Every visible enemy, with POSITION interpolated to (serverNow − renderDelay) on the server
   * timeline (smooth movement despite the ~10 Hz wire, like remote players) and every other field
   * — hp / cast / state / identity — taken from the latest snapshot (never interpolated). No
   * extrapolation past the last sample, so an idle enemy (no deltas) rests at its last position.
   */
  enemies(): NetEntity[] {
    const target = this.serverNowMs() - this.renderDelayMs;
    const out: NetEntity[] = [];
    for (const [id, ne] of this.enemyMap) {
      const samples = this.enemySamples.get(id);
      if (samples === undefined || samples.length === 0) {
        out.push(ne);
        continue;
      }
      const s = this.sampleAt(samples, target);
      out.push({ ...ne, x: s.x, y: s.y, z: s.z, yaw: s.yaw });
    }
    return out;
  }

  /** Our own authoritative combat state (hp / resource / target / cast), or null pre-join. */
  combatSelf(): NetCombatSelf | null {
    return this.lastCombatSelf;
  }

  /** Take and clear the kills credited to us since the last drain (server-rolled loot + the
   * enemy def id for quest objectives). The game applies each to its inventory (Stage 2c-2). */
  drainKills(): ServerKill[] {
    if (this.killQueue.length === 0) return [];
    return this.killQueue.splice(0, this.killQueue.length);
  }

  /** Take and clear the authoritative combat visuals to render this frame (Stage 2c-3). */
  drainFx(): NetCombatEvent[] {
    if (this.fxQueue.length === 0) return [];
    return this.fxQueue.splice(0, this.fxQueue.length);
  }

  // --- remote rendering ---

  /**
   * Remote players, positions interpolated to (serverNow − renderDelay) between the two
   * bracketing samples on the server timeline. No extrapolation past the last sample.
   */
  remotePlayers(): RemoteRenderState[] {
    const target = this.serverNowMs() - this.renderDelayMs;
    const out: RemoteRenderState[] = [];
    for (const [id, track] of this.tracks) {
      if (track.samples.length === 0) continue;
      const s = this.sampleAt(track.samples, target);
      out.push({
        id,
        name: track.name,
        cls: track.cls,
        level: track.level,
        x: s.x,
        y: s.y,
        z: s.z,
        yaw: s.yaw,
        move: s.move,
      });
    }
    return out;
  }

  private sampleAt(s: Sample[], target: number): Sample {
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if (target <= first.tMs) return first;
    if (target >= last.tMs) return last;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i]!;
      const b = s[i + 1]!;
      if (target >= a.tMs && target <= b.tMs) {
        const span = b.tMs - a.tMs;
        const alpha = span > 0 ? (target - a.tMs) / span : 0;
        return {
          tMs: target,
          x: lerp(a.x, b.x, alpha),
          y: lerp(a.y, b.y, alpha),
          z: lerp(a.z, b.z, alpha),
          yaw: lerpAngle(a.yaw, b.yaw, alpha),
          // The state they are moving THROUGH this segment (source), not the one they
          // arrive in — avoids showing 'idle' while a remote is still visibly sliding.
          move: a.move,
        };
      }
    }
    return last;
  }

  status(): NetStatus {
    return {
      phase: this.phase,
      connected: this.connected,
      peers: this.tracks.size,
      you: this.you,
      latencyMs: this.latencyMs,
    };
  }

  dispose(): void {
    this.closedByUser = true;
    this.stopPinging();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      this.ws.close();
      this.ws = null;
    }
    this.tracks.clear();
    this.history.length = 0;
    this.connected = false;
  }

  private send(msg: Parameters<typeof encodeClient>[0]): void {
    if (this.ws !== null && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeClient(msg));
    }
  }

  private emitStatus(): void {
    this.opts.onStatus?.(this.status());
  }

  private nowMs(): number {
    return performance.now();
  }
}
