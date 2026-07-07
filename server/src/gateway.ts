// The WebSocket gateway: the boundary between untrusted clients and the authoritative
// sim. It owns the tick clock (wall-clock lives HERE, at the integration edge — never
// in the sim), decodes and routes client frames, and broadcasts authoritative state.
//
// Replication is per-subscriber (ARCH §7): each client receives a `self` frame for its
// own player (the reconciliation ack channel) plus an interest-filtered delta of the
// OTHER players within its 3×3 chunk region. Two players in one town share a cell, so
// they always see each other; distant players fall out of each other's interest.
//
// The boundary is also hardened against hostile/half-open clients: a max frame size, a
// hello timeout, a connection cap, and a WebSocket heartbeat that reaps dead sockets.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  decodeClient,
  encodeServer,
  findEmote,
  lootTurnRecipient,
  NET_PROTOCOL_VERSION,
  WORLD_SEED,
  type ClientParty,
  type NetCombatEvent,
  type NetEntity,
  type NetPartyMember,
  type NetPartyVital,
  type NetPlayer,
  type ServerChat,
  type ServerMessage,
} from '@pathlands/shared';
import type { ServerSim, ServerPlayer } from './sim.js';
import { ServerCombat } from './combat.js';
import { PartyManager } from './party.js';
import {
  buildCellIndex,
  buildEntityCellIndex,
  cellOf,
  INTEREST_RADIUS_CELLS,
  visibleEntities,
  visibleIds,
} from './interest.js';
import { Auth } from './auth.js';
import { MemoryStore, type Store } from './store.js';
import { HttpApi } from './httpApi.js';

interface Conn {
  readonly ws: WebSocket;
  /** Session id once the player has said hello; null while unauthenticated. */
  id: string | null;
  /** Player ids currently replicated to this connection (its interest membership). */
  readonly known: Set<string>;
  /** Enemy entity ids currently replicated to this connection (its entity interest). */
  readonly knownEntities: Set<string>;
  /** Cleared by the heartbeat each round; set true on a WebSocket-level pong. */
  isAlive: boolean;
  /** Fires if the socket never says hello — an anti-idle-DoS reaper. */
  helloTimer: ReturnType<typeof setTimeout> | null;
  /** Sliding 1s window for the inbound frame-rate limiter. */
  msgWindowStart: number;
  msgCount: number;
  /** Account id once the player authenticated with a token; null for guest sessions. */
  accountId: string | null;
  /** Wall-clock (ms) of this connection's last accepted chat line — its send-rate gate. */
  lastChatMs: number;
  /** Wall-clock (ms) of this connection's last accepted party action — an invite-spam gate. */
  lastPartyMs: number;
}

export interface GatewayOptions {
  port: number;
  host: string;
  tickDurationMs: number;
  broadcastEveryTicks: number;
  maxPayloadBytes: number;
  maxConnections: number;
  helloTimeoutMs: number;
  heartbeatMs: number;
  maxMsgsPerSec: number;
  authRatePerMin: number;
  maxAuthBodyBytes: number;
  maxCharacterBodyBytes: number;
  /** How often to flush authenticated players' authoritative positions to the store. */
  saveIntervalMs: number;
}

/** Dependencies the gateway needs for accounts; defaulted for tests. */
export interface GatewayDeps {
  auth?: Auth;
  store?: Store;
}

/** Frames past this multiple of the per-second cap in one window ⇒ terminate, not just drop. */
const FLOOD_TERMINATE_FACTOR = 8;

/** Minimum spacing between one connection's chat lines (ms) — an anti-spam gate. */
const CHAT_MIN_INTERVAL_MS = 700;

/** Minimum spacing between one connection's party actions (ms) — an invite-spam gate. */
const PARTY_MIN_INTERVAL_MS = 500;

/** Server-side visible cap on a rebroadcast chat line (below the wire MAX_CHAT_LEN). */
const CHAT_BROADCAST_MAX = 200;

/**
 * Clean an untrusted chat line for rebroadcast: strip control characters (incl. newlines,
 * which would let a line spoof extra rows in a client log), collapse runs of whitespace,
 * trim the ends, and cap the length. Returns null if nothing printable survives.
 */
function sanitizeChat(text: string): string | null {
  const cleaned = text
    // eslint-disable-next-line no-control-regex -- deliberately stripping C0/C1 control chars
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_BROADCAST_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

export class GameServer {
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly conns = new Map<WebSocket, Conn>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when a player joined or disconnected — forces a delta pass past the idle-skip. */
  private membershipChanged = false;
  /** Server start time (ms, wall-clock at the edge) — for the /status uptime. */
  private startedAtMs = 0;
  private readonly auth: Auth;
  private readonly store: Store;
  private readonly api: HttpApi;
  /** The world's authoritative enemy sim (spawns + AI + replication). */
  private readonly combat: ServerCombat;
  /** Session-scoped party (group) state (Phase 6 §Social). */
  private readonly party = new PartyManager();

  constructor(
    private readonly sim: ServerSim,
    private readonly opts: GatewayOptions,
    deps: GatewayDeps = {},
  ) {
    this.combat = new ServerCombat(sim.world);
    // Let the combat sim share a kill's XP with the killer's nearby party (Part 21): it looks up
    // the party's member ids and range-gates them itself. Solo players resolve to an empty list.
    this.combat.setPartyProvider((id) => this.party.partyOf(id)?.members ?? []);
    // Round-robin a kill's LOOT among the eligible members (Part 22): pick from the party's members
    // in stable order (filtered to those eligible/in-range), advancing the party's rotation cursor.
    this.combat.setLootRecipientProvider((killerId, eligible) => {
      const party = this.party.partyOf(killerId);
      if (party === null) return killerId;
      const ordered = party.members.filter((m) => eligible.includes(m));
      const pick = lootTurnRecipient(ordered, party.lootTurn);
      if (pick === null) return killerId;
      party.lootTurn += 1;
      return pick;
    });
    this.auth = deps.auth ?? new Auth('dev-insecure-secret-change-me');
    this.store = deps.store ?? new MemoryStore();
    this.api = new HttpApi(this.auth, this.store, {
      authRatePerMin: opts.authRatePerMin,
      maxAuthBodyBytes: opts.maxAuthBodyBytes,
      maxCharacterBodyBytes: opts.maxCharacterBodyBytes,
    });
    // The ws server rides on our own HTTP server so `wss://` upgrades and the plain-HTTP
    // account/health routes share one port — the shape nginx reverse-proxies in production.
    this.http = createServer((req, res) => void this.handleHttp(req, res));
    this.wss = new WebSocketServer({
      server: this.http,
      // Reject oversized frames before they reach JSON.parse (event-loop / OOM DoS).
      maxPayload: opts.maxPayloadBytes,
    });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  /** Resolve once the socket is accepting connections. */
  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.opts.port, this.opts.host, () => {
        this.startedAtMs = Date.now();
        this.timer = setInterval(() => this.onTick(), this.opts.tickDurationMs);
        this.heartbeatTimer = setInterval(() => this.heartbeat(), this.opts.heartbeatMs);
        this.saveTimer = setInterval(() => this.persistAll(), this.opts.saveIntervalMs);
        resolve();
      });
    });
  }

  /** The port actually bound (useful when constructed with port 0 in tests). */
  address(): number {
    const addr = this.http.address();
    return typeof addr === 'object' && addr !== null ? addr.port : this.opts.port;
  }

  async close(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.saveTimer !== null) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    for (const conn of this.conns.values()) {
      if (conn.helloTimer !== null) clearTimeout(conn.helloTimer);
      conn.ws.terminate();
    }
    this.conns.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.http.close(() => resolve()));
  }

  // --- HTTP: account API + health + status (ARCH §8) ---

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (await this.api.handle(req, res)) return; // /auth/*, /character
      this.onHttpRequest(req, res); // /healthz, /status, 404
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('internal error');
      }
    }
  }

  private onHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (req.method === 'GET' && req.url === '/status') {
      const body = JSON.stringify({
        status: 'ok',
        protocol: NET_PROTOCOL_VERSION,
        seed: WORLD_SEED,
        tickRate: this.opts.tickDurationMs > 0 ? 1000 / this.opts.tickDurationMs : 0,
        serverTick: this.sim.tick,
        players: this.sim.players.size,
        connections: this.conns.size,
        uptimeMs: this.startedAtMs > 0 ? Date.now() - this.startedAtMs : 0,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }

  // --- connection lifecycle ---

  private onConnection(ws: WebSocket): void {
    // Connection cap: refuse past the limit before allocating any per-conn state.
    if (this.conns.size >= this.opts.maxConnections) {
      ws.terminate();
      return;
    }
    const conn: Conn = {
      ws,
      id: null,
      known: new Set(),
      knownEntities: new Set(),
      isAlive: true,
      helloTimer: null,
      msgWindowStart: 0,
      msgCount: 0,
      accountId: null,
      lastChatMs: 0,
      lastPartyMs: 0,
    };
    conn.helloTimer = setTimeout(() => {
      if (conn.id === null) conn.ws.terminate(); // never authenticated — reap it
    }, this.opts.helloTimeoutMs);
    this.conns.set(ws, conn);
    ws.on('message', (data: RawData) => void this.onMessage(conn, data.toString()));
    ws.on('pong', () => {
      conn.isAlive = true; // answered the heartbeat — still alive
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => this.onClose(conn));
  }

  private onClose(conn: Conn): void {
    if (conn.helloTimer !== null) {
      clearTimeout(conn.helloTimer);
      conn.helloTimer = null;
    }
    if (!this.conns.delete(conn.ws)) return;
    if (conn.id !== null) {
      const player = this.sim.players.get(conn.id);
      // Persist the departing authenticated player's authoritative position (fire-and-forget).
      if (conn.accountId !== null && player !== undefined) {
        void this.persistPosition(conn.accountId, player);
      }
      this.combat.removePlayer(conn.id); // drop its combat entity + any enemy threat on it
      // Drop from any party (+ clear pending invites) and re-roster the survivors.
      const partyChange = this.party.remove(conn.id);
      this.sim.remove(conn.id);
      for (const m of partyChange.notify) if (m !== conn.id) this.sendPartyState(m);
      // The player's departure surfaces to peers as a `gone` on the next delta.
      this.membershipChanged = true;
    }
  }

  // --- character persistence (authenticated sessions) ---

  /** Write a live player's authoritative position + progression back into its stored blob. */
  private async persistPosition(accountId: string, player: ServerPlayer): Promise<void> {
    const ch = await this.store.getCharacter(accountId);
    if (ch === null) return; // guest-with-account who never uploaded a character
    ch.x = player.phys.x;
    ch.y = player.phys.y;
    ch.z = player.phys.z;
    ch.yaw = player.phys.yaw;
    // Server-authoritative kill XP (Stage 2c-1), persisted as a MONOTONIC high-water mark.
    // The server only sees kill XP; the client is the aggregator that also holds quest /
    // Waystone XP and cloud-saves the complete total (putCharacter). Writing the server's
    // partial total unconditionally would clobber that complete total, so only advance the
    // stored XP when the server genuinely leads it — never regress it.
    const prog = this.combat.progressionOf(player.id);
    if (prog !== null && prog.totalXp > ch.xp) {
      ch.xp = prog.totalXp;
      ch.level = prog.level;
    }
    await this.store.putCharacter(accountId, ch);
  }

  /** Periodic sweep: flush every authenticated live player's position. */
  private persistAll(): void {
    for (const conn of this.conns.values()) {
      if (conn.id === null || conn.accountId === null) continue;
      const player = this.sim.players.get(conn.id);
      if (player !== undefined) void this.persistPosition(conn.accountId, player);
    }
  }

  private async onMessage(conn: Conn, raw: string): Promise<void> {
    // Frame-rate limit BEFORE decoding, so a flood can't burn JSON.parse/validate CPU.
    // Wall-clock is fine here at the gateway edge (never in the sim).
    const now = Date.now();
    if (now - conn.msgWindowStart >= 1000) {
      conn.msgWindowStart = now;
      conn.msgCount = 0;
    }
    conn.msgCount += 1;
    if (conn.msgCount > this.opts.maxMsgsPerSec) {
      // Sustained flooding: drop the frame; egregious abuse loses the connection.
      if (conn.msgCount > this.opts.maxMsgsPerSec * FLOOD_TERMINATE_FACTOR) conn.ws.terminate();
      return;
    }

    const msg = decodeClient(raw);
    if (msg === null) return; // malformed / hostile frame — drop at the boundary

    switch (msg.t) {
      case 'hello': {
        if (conn.id !== null) return; // already joined; ignore a second hello
        if (msg.protocol !== NET_PROTOCOL_VERSION) {
          this.send(conn.ws, {
            t: 'error',
            code: 'protocol',
            message: `server speaks protocol ${NET_PROTOCOL_VERSION}`,
          });
          conn.ws.close();
          return;
        }
        // Accounts: a valid token binds the session and loads the persisted character
        // (its identity + last position override the guest fields). A present-but-invalid
        // token is a hard error — the client should re-login rather than play as a guest.
        let name = msg.name;
        let cls = msg.cls;
        let level = msg.level;
        let totalXp = 0;
        let spawn: { x: number; y: number; z: number; yaw: number } | undefined;
        if (msg.token !== undefined) {
          const claims = this.auth.verify(msg.token, Math.floor(Date.now() / 1000));
          if (claims === null) {
            this.send(conn.ws, { t: 'error', code: 'auth', message: 'invalid or expired token' });
            conn.ws.close();
            return;
          }
          conn.accountId = claims.sub;
          const ch = await this.store.getCharacter(claims.sub);
          if (ch !== null) {
            name = ch.name;
            cls = ch.class;
            level = ch.level;
            totalXp = ch.xp;
            spawn = { x: ch.x, y: ch.y, z: ch.z, yaw: ch.yaw };
          }
        }
        // The socket may have closed while we awaited the store; bail if so.
        if (!this.conns.has(conn.ws)) return;
        const player = this.sim.join(name, cls, level, spawn);
        conn.id = player.id;
        // Mirror the player into the combat sim (a player CombatEntity enemies can target).
        this.combat.addPlayer(
          player.id,
          player.name,
          player.cls,
          player.level,
          player.phys.x,
          player.phys.y,
          player.phys.z,
          totalXp,
        );
        if (conn.helloTimer !== null) {
          clearTimeout(conn.helloTimer);
          conn.helloTimer = null;
        }
        this.send(conn.ws, {
          t: 'welcome',
          protocol: NET_PROTOCOL_VERSION,
          you: player.id,
          seed: WORLD_SEED,
          tick: this.sim.tick,
          tickRate: this.opts.tickDurationMs > 0 ? 1000 / this.opts.tickDurationMs : 0,
        });
        // Seed interest: the joiner gets an interest-filtered snapshot of the OTHER
        // players around it (own state arrives on the `self` channel). Existing clients
        // learn of the joiner via their next per-subscriber delta (join marks it dirty).
        const index = buildCellIndex(this.sim.players.values());
        const visible = visibleIds(player, index);
        const players: NetPlayer[] = [];
        for (const id of visible) {
          if (id === player.id) continue; // self travels on the self channel, not here
          const other = this.sim.players.get(id);
          if (other !== undefined) {
            players.push(this.sim.netOf(other));
            conn.known.add(id);
          }
        }
        // Seed entity interest too: the enemies in the joiner's 3×3 region, tracked so the
        // next deltas only send changes/leaves.
        const entityIndex = buildEntityCellIndex(this.combat.netEntities());
        const entities: NetEntity[] = [];
        for (const e of visibleEntities(player, entityIndex)) {
          entities.push(e);
          conn.knownEntities.add(e.id);
        }
        this.send(conn.ws, { t: 'snapshot', tick: this.sim.tick, players, entities });
        this.membershipChanged = true;
        return;
      }
      case 'intent': {
        if (conn.id === null) return; // must hello first
        if (msg.intent.type === 'Move') {
          this.sim.applyMove(conn.id, msg.intent, msg.seq);
        } else {
          // Combat intents (cast / target / auto-attack / release) resolve against the
          // authoritative combat sim, which validates class/level/GCD/cooldown/resource/range.
          this.combat.applyPlayerIntent(conn.id, msg.intent);
        }
        return;
      }
      case 'ping': {
        if (conn.id === null) return; // only joined players get pongs (anti-amplification)
        this.send(conn.ws, {
          t: 'pong',
          id: msg.id,
          clientTime: msg.clientTime,
          serverTick: this.sim.tick,
        });
        return;
      }
      case 'chat': {
        if (conn.id === null) return; // must be joined to speak
        // Per-connection send-rate gate (wall-clock is fine at the edge). Silently drop a
        // too-fast line rather than error — spamming is not a protocol violation.
        if (now - conn.lastChatMs < CHAT_MIN_INTERVAL_MS) return;
        const text = sanitizeChat(msg.text);
        if (text === null) return; // nothing printable survived sanitising
        conn.lastChatMs = now;
        const player = this.sim.players.get(conn.id);
        if (player === undefined) return;
        // A directed whisper (msg.to set) is a private line to one player — routed to them + an
        // echo to the sender, both under server-authoritative names. No emote resolution (plain
        // text), and it never reaches the global broadcast.
        if (msg.to !== undefined) {
          this.whisper(conn.id, player.name, msg.to, text);
          return;
        }
        // A leading `/` is an emote command: resolve it against the shared table and, if
        // known, broadcast the third-person action phrase under the player's authoritative
        // name (`Alia waves.`). An unknown command is dropped (the client validates first
        // for instant feedback). Everything else is an ordinary say line. Either way the
        // display name is re-derived server-side — the client's copy is never trusted.
        if (text.startsWith('/')) {
          const cmd = text.slice(1).split(/\s+/, 1)[0] ?? '';
          const emote = findEmote(cmd);
          if (emote !== null) this.broadcastChat(conn.id, player.name, emote.phrase, true);
          return;
        }
        this.broadcastChat(conn.id, player.name, text);
        return;
      }
      case 'party': {
        if (conn.id === null) return; // must be joined
        // Rate-gate INVITES only — that's the amplification vector (each invite pushes an
        // unsolicited frame to another player). accept/decline/leave/kick only touch the
        // sender's own bounded (≤4) party, so a human firing them back-to-back is fine.
        if (msg.action === 'invite') {
          if (now - conn.lastPartyMs < PARTY_MIN_INTERVAL_MS) return; // silently drop the flood
          conn.lastPartyMs = now;
        }
        this.handleParty(conn.id, msg);
        return;
      }
    }
  }

  // --- party (Phase 6 §Social) ---

  /** Route a validated party action, then re-broadcast the affected rosters. */
  private handleParty(meId: string, msg: ClientParty): void {
    switch (msg.action) {
      case 'invite': {
        // Targets are session ids (unambiguous where names are not — the client has the id
        // from the roster/snapshot). Validate it names a joined player, and not the sender.
        const target = msg.target;
        if (target === undefined || target === meId || !this.sim.players.has(target)) {
          // A self-invite is only reachable via a crafted client (you're not in your own roster);
          // give it an accurate message and reserve the offline notice for a genuinely-gone id.
          this.systemNotice(
            meId,
            target === meId ? 'You cannot invite yourself.' : 'That player is no longer online.',
          );
          return;
        }
        // `party.invite` can only return 'ok' / 'full' / 'targetBusy' here — the guard above
        // already excluded the self case, so 'self' is unreachable through the gateway.
        const res = this.party.invite(meId, target);
        if (res !== 'ok') {
          this.systemNotice(
            meId,
            res === 'full' ? 'Your party is full.' : 'That player is already in a party.',
          );
          return;
        }
        const meName = this.sim.players.get(meId)?.name ?? 'Someone';
        const targetConn = this.connById(target);
        if (targetConn !== null) {
          this.send(targetConn.ws, { t: 'partyInvite', fromId: meId, fromName: meName });
        }
        this.systemNotice(
          meId,
          `Invited ${this.sim.players.get(target)?.name ?? 'them'} to the party.`,
        );
        break;
      }
      case 'accept': {
        const res = this.party.accept(meId);
        if (res === null) {
          this.systemNotice(meId, 'That invite is no longer valid.');
          return;
        }
        for (const m of res.notify) this.sendPartyState(m);
        break;
      }
      case 'decline':
        this.party.decline(meId);
        break;
      case 'leave': {
        const res = this.party.leave(meId);
        for (const m of res.notify) this.sendPartyState(m);
        break;
      }
      case 'kick': {
        // `target` is the member's session id; party.kick validates leadership + membership.
        if (msg.target === undefined) return;
        const res = this.party.kick(meId, msg.target);
        if (res === null) return;
        for (const m of res.notify) this.sendPartyState(m);
        break;
      }
    }
  }

  /** Send a player their current party roster (empty ⇒ the client hides the party panel). */
  private sendPartyState(id: string): void {
    const conn = this.connById(id);
    if (conn === null) return;
    const party = this.party.partyOf(id);
    const members: NetPartyMember[] = [];
    let leaderId = '';
    if (party !== null) {
      leaderId = party.leaderId;
      for (const mId of party.members) {
        const p = this.sim.players.get(mId);
        if (p !== undefined) members.push({ id: mId, name: p.name, cls: p.cls, level: p.level });
      }
    }
    this.send(conn.ws, { t: 'partyState', leaderId, members });
  }

  /** A one-off system notice to a single player, on the chat channel (no real sender). */
  private systemNotice(id: string, text: string): void {
    const conn = this.connById(id);
    if (conn !== null) {
      this.send(conn.ws, { t: 'chat', fromId: '', from: 'System', text, tick: this.sim.tick });
    }
  }

  /**
   * Route a directed whisper (Part 23): send the line to the target under the sender's name (they
   * render `From <sender>:`) and echo it to the sender under the TARGET's name (they render
   * `To <target>:`). Both frames carry `fromId = sender` so the client's self-check (`fromId === you`)
   * picks the right prefix. The target id is validated as a joined, online player and not self.
   */
  private whisper(fromId: string, fromName: string, toId: string, text: string): void {
    if (toId === fromId) {
      this.systemNotice(fromId, 'You cannot whisper yourself.');
      return;
    }
    const target = this.sim.players.get(toId);
    const targetConn = this.connById(toId);
    if (target === undefined || targetConn === null) {
      this.systemNotice(fromId, 'That player is no longer online.');
      return;
    }
    const tick = this.sim.tick;
    // Recipient: `From <sender>` (fromId ≠ their own id).
    this.send(targetConn.ws, { t: 'chat', fromId, from: fromName, text, tick, whisper: true });
    // Sender echo: `To <target>` (fromId === their own id ⇒ self; `from` is the target's name).
    const fromConn = this.connById(fromId);
    if (fromConn !== null) {
      this.send(fromConn.ws, { t: 'chat', fromId, from: target.name, text, tick, whisper: true });
    }
  }

  /** The connection whose session id is `id`, or null (small N — parties are ≤ 4). */
  private connById(id: string): Conn | null {
    for (const c of this.conns.values()) if (c.id === id) return c;
    return null;
  }

  /** Fan a sanitised chat/emote line out to every joined session (global chat for the playtest). */
  private broadcastChat(fromId: string, from: string, text: string, emote = false): void {
    const frame: ServerChat = { t: 'chat', fromId, from, text, tick: this.sim.tick };
    if (emote) frame.emote = true;
    for (const conn of this.conns.values()) {
      if (conn.id === null) continue; // pre-hello sockets don't receive chat
      this.send(conn.ws, frame);
    }
  }

  // --- heartbeat: reap half-open sockets (sleep / dropped wifi with no TCP FIN) ---

  private heartbeat(): void {
    // Snapshot first: terminate() → 'close' → onClose mutates this.conns mid-iteration.
    for (const conn of [...this.conns.values()]) {
      if (!conn.isAlive) {
        conn.ws.terminate(); // missed the previous round — presumed dead
        continue;
      }
      conn.isAlive = false;
      conn.ws.ping();
    }
  }

  // --- tick + broadcast ---

  private onTick(): void {
    // Suspend the movement of players the combat sim has killed (until they respawn), so a
    // corpse can't walk to a better Waystone. Death state is from the previous combat tick — a
    // one-tick lag is immaterial.
    for (const p of this.sim.players.values()) p.frozen = this.combat.isDead(p.id);
    this.sim.step();
    // Feed each player's authoritative movement position into the combat sim so enemies
    // target real positions and casts resolve against them, then advance combat one tick.
    for (const p of this.sim.players.values()) {
      this.combat.syncPlayer(p.id, p.phys.x, p.phys.y, p.phys.z, p.phys.yaw);
    }
    this.combat.step(); // enemies + players: spawn, AI, aggro, cast resolution
    // Server-authoritative respawn (Stage 2c-4): the combat sim relocated a revived spirit to a
    // Waystone — move the movement authority (physics) to match, so the position sticks.
    for (const r of this.combat.drainRespawns()) this.sim.teleport(r.id, r.x, r.z);
    if (this.sim.tick % this.opts.broadcastEveryTicks === 0) this.broadcast();
  }

  private broadcast(): void {
    // Recompute the enemy replication diff ONCE here, at broadcast cadence — the combat sim
    // advances every tick but we only broadcast every Nth, so the diff must be taken against
    // the last BROADCAST, not the last tick (else sub-cadence changes are silently dropped).
    this.combat.refreshDiff();
    // Authoritative combat visuals accumulated since the last broadcast — drained ONCE, then
    // filtered per connection below (interest + omit the viewer's own predicted hits).
    const fx = this.combat.drainFx();
    const membershipChanged = this.membershipChanged;
    this.membershipChanged = false;
    // The delta pass is only needed when something could have changed; the `self` pass
    // always runs so reconciliation acks keep flowing (and the client prunes its input
    // history) even for a stationary player.
    // A delta pass is worthwhile when a player moved/joined/left OR an enemy changed (a
    // viewer's own movement also shifts which enemies are in its interest). The `self` pass
    // below always runs so reconciliation acks keep flowing for a stationary player.
    const buildDeltas = this.sim.anyDirty() || membershipChanged || this.combat.hasChanges();
    const index = buildDeltas ? buildCellIndex(this.sim.players.values()) : null;
    const entityIndex = buildDeltas ? buildEntityCellIndex(this.combat.netEntities()) : null;

    for (const conn of this.conns.values()) {
      if (conn.id === null) continue;
      const viewer = this.sim.players.get(conn.id);
      if (viewer === undefined) continue;

      // 1) Own authoritative state + ack — always, regardless of interest.
      const self = this.sim.selfOf(viewer);
      this.send(conn.ws, {
        t: 'self',
        tick: this.sim.tick,
        ackedSeq: self.ackedSeq,
        phys: self.phys,
      });

      // 1b) Own combat state (health / resource / target / cast) — also interest-independent.
      const combatSelf = this.combat.combatSelf(conn.id);
      if (combatSelf !== null) {
        this.send(conn.ws, { t: 'combatSelf', tick: this.sim.tick, self: combatSelf });
      }

      // 1b-ii) Party vitals for the ally frames (Part 20): every party member's live hp/resource,
      //        including the viewer's own. NOT interest-filtered — you see your party's health
      //        across the whole world (apart or together). Solo players get no frame.
      const party = this.party.partyOf(conn.id);
      if (party !== null) {
        const vitals: NetPartyVital[] = [];
        for (const mId of party.members) {
          const v = this.combat.vitalsOf(mId);
          if (v !== null) vitals.push(v);
        }
        this.send(conn.ws, { t: 'partyVitals', tick: this.sim.tick, vitals });
      }

      // 1c) Kills credited to this player since the last broadcast — server-authoritative loot
      //     (gold + items) + the enemy def id for its client-side quest objectives (Stage 2c-2).
      for (const kill of this.combat.drainKills(conn.id)) {
        this.send(conn.ws, {
          t: 'kill',
          tick: this.sim.tick,
          enemyId: kill.enemyId,
          gold: kill.gold,
          items: kill.items,
        });
      }

      // 1d) Authoritative combat visuals near this viewer (Stage 2c-3): incoming hits, other
      //     players' fights, monster deaths, boss lines. Gated by the SAME 3×3-chunk interest as
      //     entity replication (so a floater never plays for an enemy the viewer wasn't sent, and
      //     no visible enemy's floater is dropped). The viewer's OWN outgoing damage/heal is
      //     omitted — the client predicts those. NOTE: this omission assumes the client predicts
      //     every own hit, which holds while targeting is enemy/self-only (both are in the local
      //     sim). Revisit when friendly targeting lands (an own heal on ANOTHER player isn't
      //     predicted locally, so it must NOT be omitted then).
      if (fx.length > 0) {
        const vcx = cellOf(viewer.phys.x);
        const vcz = cellOf(viewer.phys.z);
        const events: NetCombatEvent[] = [];
        for (const rec of fx) {
          if ((rec.kind === 'damage' || rec.kind === 'heal') && rec.sourceId === conn.id) continue;
          if (
            Math.abs(cellOf(rec.x) - vcx) > INTEREST_RADIUS_CELLS ||
            Math.abs(cellOf(rec.z) - vcz) > INTEREST_RADIUS_CELLS
          ) {
            continue;
          }
          const ev: NetCombatEvent = {
            kind: rec.kind,
            x: rec.x,
            y: rec.y,
            z: rec.z,
            amount: rec.amount,
            crit: rec.crit,
          };
          if (rec.text !== undefined) ev.text = rec.text;
          events.push(ev);
        }
        if (events.length > 0) this.send(conn.ws, { t: 'fx', tick: this.sim.tick, events });
      }

      // 2) Interest-filtered delta of the OTHER players + enemy entities in the viewer's
      //    3×3 region. Players and entities share one delta frame.
      if (index !== null && entityIndex !== null) {
        const visible = visibleIds(viewer, index);
        const players: NetPlayer[] = [];
        const gone: string[] = [];
        for (const id of visible) {
          if (id === conn.id) continue; // own player is on the self channel
          const p = this.sim.players.get(id);
          if (p === undefined) continue;
          if (!conn.known.has(id)) {
            conn.known.add(id); // ENTER — full state (no prior baseline for a delta)
            players.push(this.sim.netOf(p));
          } else if (p.dirty) {
            players.push(this.sim.netOf(p)); // UPDATE — only if it changed
          }
        }
        // LEAVE (walked out of interest) or DISCONNECT (removed from sim ⇒ not visible).
        for (const id of conn.known) if (!visible.has(id)) gone.push(id);
        for (const id of gone) conn.known.delete(id);

        // Enemy entities: same ENTER / UPDATE / LEAVE diff against a per-conn known set.
        const visibleEnts = visibleEntities(viewer, entityIndex);
        const seenEnts = new Set<string>();
        const entities: NetEntity[] = [];
        const goneEntities: string[] = [];
        for (const e of visibleEnts) {
          seenEnts.add(e.id);
          if (!conn.knownEntities.has(e.id)) {
            conn.knownEntities.add(e.id); // ENTER
            entities.push(e);
          } else if (this.combat.isDirty(e.id)) {
            entities.push(e); // UPDATE
          }
        }
        for (const id of conn.knownEntities) if (!seenEnts.has(id)) goneEntities.push(id);
        for (const id of goneEntities) conn.knownEntities.delete(id);

        if (
          players.length > 0 ||
          gone.length > 0 ||
          entities.length > 0 ||
          goneEntities.length > 0
        ) {
          this.send(conn.ws, {
            t: 'delta',
            tick: this.sim.tick,
            players,
            gone,
            entities,
            goneEntities,
          });
        }
      }
    }
    this.sim.clearDirty(); // exactly once, after every subscriber has read p.dirty
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServer(msg));
  }
}
