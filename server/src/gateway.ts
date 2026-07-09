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
  CharacterClass,
  decodeClient,
  encodeServer,
  findEmote,
  generateItem,
  lootTurnRecipient,
  makeRng,
  NET_PROTOCOL_VERSION,
  scaledQuestXp,
  vendorStock,
  WORLD_SEED,
  type ClientGm,
  type ClientInvAction,
  type ClientParty,
  type ClientQuestAction,
  type GeneratedItemSpec,
  type ItemDef,
  type ItemStackSave,
  type NetCombatEvent,
  type NetEntity,
  type NetItemStack,
  type NetPartyMember,
  type NetPartyVital,
  type NetPlayer,
  type NetWhoEntry,
  type NetWorldItem,
  type QuestLogState,
  type QuestReward,
  type ServerChat,
  type ServerMessage,
} from '@pathlands/shared';
import type { ServerSim, ServerPlayer } from './sim.js';
import { ServerCombat } from './combat.js';
import { PartyManager } from './party.js';
import { GroundItems } from './groundItems.js';
import { Inventories } from './inventory.js';
import { Quests } from './quests.js';
import {
  buildCellIndex,
  buildEntityCellIndex,
  buildItemCellIndex,
  cellOf,
  INTEREST_RADIUS_CELLS,
  visibleEntities,
  visibleIds,
  visibleItems,
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
  /** Ground-item ids currently replicated to this connection (its item interest). */
  readonly knownItems: Set<string>;
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
  /** Wall-clock (ms) of this connection's last /who — gates the (potentially large) roster reply. */
  lastWhoMs: number;
  /** GM privilege for this session (from the account's is_gm / GM_EMAILS) — gates GM actions. */
  isGm: boolean;
  /** Wall-clock (ms) until which this player is muted by a GM (0 = not muted). */
  mutedUntilMs: number;
  /** Wall-clock (ms) of this connection's last accepted item drop — an anti-spam-drop gate. */
  lastDropMs: number;
  /** Token bucket bounding ground-item SPILLS (a full-bag `giveOrDrop` from kill loot / reward
   *  claims). A burst covers a reconnect-flush of buffered rewards; the sustained refill caps how
   *  fast a client can flood the world with interest-replicated motes. Refilled lazily on use. */
  spillTokens: number;
  /** Wall-clock (ms) of the last spill-token refill (0 = never; the first use tops the bucket up). */
  spillRefillMs: number;
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
  /** Emails auto-granted GM on login (GM tooling bootstrap). */
  gmEmails: readonly string[];
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

/** Minimum spacing between one connection's /who queries (ms) — bounds the roster-reply cost. */
const WHO_MIN_INTERVAL_MS = 2000;

/** Minimum spacing between one connection's item drops (ms) — bounds spawned-entity spam. */
const DROP_MIN_INTERVAL_MS = 250;

/** Ground-item SPILL throttle (a full-bag `giveOrDrop` from kill loot / reward claims). A token
 *  bucket: a burst of `SPILL_BUCKET_CAP` covers a reconnect-flush of buffered rewards + multi-item
 *  turn-ins landing on a full bag, then it refills at `SPILL_REFILL_PER_SEC` so a hostile client
 *  can't turn `claimReward` (a trusted bridge) into an unbounded flood of interest-replicated motes.
 *  Past the budget the overflow stack is dropped, not spawned (the pre-`giveOrDrop` behaviour — the
 *  bag was full anyway), so a legitimate player never loses loot at any realistic rate. */
const SPILL_BUCKET_CAP = 32;
const SPILL_REFILL_PER_SEC = 2;

/** How close (world units) a player must be to a ground item to pick it up. */
const PICKUP_RADIUS = 3;

/** Ground-item lifetime before it despawns (10 minutes; converted to sim ticks at construction). */
const GROUND_ITEM_TTL_MS = 10 * 60 * 1000;

/** Upper bound on a single dropped stack's quantity (defends the wire / bag against absurd sizes). */
const MAX_DROP_QTY = 999;

/** Cap on players listed in a /who reply, so the frame stays bounded in a crowded world. */
const WHO_MAX_ENTRIES = 100;

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
  /** The world's authoritative dropped items (the player-to-player trade surface). */
  private readonly groundItems = new GroundItems();
  /** Server-authoritative player inventories (bag / gold / equipment) — the economy migration. */
  private readonly inventories = new Inventories();
  /** Server-authoritative player quest logs — the quest migration (#138). */
  private readonly quests = new Quests();
  /** Ground-item lifetime in SIM TICKS (from GROUND_ITEM_TTL_MS ÷ tick duration). */
  private readonly groundItemTtlTicks: number;
  /** Set when a ground item was dropped / picked up / despawned — forces a replication pass. */
  private groundChanged = false;

  constructor(
    private readonly sim: ServerSim,
    private readonly opts: GatewayOptions,
    deps: GatewayDeps = {},
  ) {
    this.combat = new ServerCombat(sim.world);
    // Convert the 10-minute ground-item lifetime to sim ticks (the sim has no wall-clock).
    this.groundItemTtlTicks = Math.max(
      1,
      Math.round(GROUND_ITEM_TTL_MS / Math.max(1, opts.tickDurationMs)),
    );
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
      knownItems: new Set(),
      isAlive: true,
      helloTimer: null,
      msgWindowStart: 0,
      msgCount: 0,
      accountId: null,
      lastChatMs: 0,
      lastPartyMs: 0,
      lastWhoMs: 0,
      isGm: false,
      mutedUntilMs: 0,
      lastDropMs: 0,
      spillTokens: SPILL_BUCKET_CAP,
      spillRefillMs: 0,
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
      this.inventories.remove(conn.id); // drop its authoritative inventory
      this.quests.remove(conn.id); // drop its authoritative quest log
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
    // Capture the authoritative state SYNCHRONOUSLY, before the first `await` — `onClose` fires this
    // fire-and-forget and then removes the player from the combat + inventory maps on the same tick,
    // so reading them AFTER the await would see the deletions (null) and silently skip the XP +
    // inventory writes. Snapshotting up front wins that race; the store I/O then uses the snapshot.
    const px = player.phys.x;
    const py = player.phys.y;
    const pz = player.phys.z;
    const pyaw = player.phys.yaw;
    const prog = this.combat.progressionOf(player.id);
    const invSnap = this.inventories.get(player.id);
    const bag = invSnap !== null ? invSnap.bag.map((s) => ({ item: s.item, qty: s.qty })) : null;
    const gold = invSnap !== null ? invSnap.gold : null;
    const equipment = invSnap !== null ? { ...invSnap.equipment } : null;
    // Server-authoritative quest log (migration #138) — deep-copied up front for the same race.
    const questSnap = this.quests.get(player.id);
    const quests =
      questSnap !== null
        ? {
            active: questSnap.active.map((p) => ({
              id: p.id,
              counts: [...p.counts],
              pinned: p.pinned,
            })),
            turnedIn: [...questSnap.turnedIn],
          }
        : null;

    const ch = await this.store.getCharacter(accountId);
    if (ch === null) return; // guest-with-account who never uploaded a character
    ch.x = px;
    ch.y = py;
    ch.z = pz;
    ch.yaw = pyaw;
    // Server-authoritative kill XP (Stage 2c-1), persisted as a MONOTONIC high-water mark.
    // The server only sees kill XP; the client is the aggregator that also holds quest /
    // Waystone XP and cloud-saves the complete total (putCharacter). Writing the server's
    // partial total unconditionally would clobber that complete total, so only advance the
    // stored XP when the server genuinely leads it — never regress it.
    if (prog !== null && prog.totalXp > ch.xp) {
      ch.xp = prog.totalXp;
      ch.level = prog.level;
    }
    // Server-authoritative inventory (economy migration): the bag / gold / equipment are the
    // server's truth now, so write them back. Read-modify-write preserves the still-client-owned
    // fields (professions / deeds) already on the loaded blob.
    if (bag !== null && gold !== null && equipment !== null) {
      ch.inventory = bag;
      ch.gold = gold;
      ch.equipment = equipment;
    }
    // Server-authoritative quest log (migration #138): the log is the server's truth now, written
    // back over the client-owned blob it used to be.
    if (quests !== null) ch.quests = quests;
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
        // Economy state to seed the authoritative inventory from (empty for a guest).
        let seedInventory: ItemStackSave[] = [];
        let seedGold = 0;
        let seedEquipment: Record<string, ItemDef> = {};
        let seedQuests: QuestLogState | undefined; // the persisted quest log (empty for a guest)
        if (msg.token !== undefined) {
          const claims = this.auth.verify(msg.token, Math.floor(Date.now() / 1000));
          if (claims === null) {
            this.send(conn.ws, { t: 'error', code: 'auth', message: 'invalid or expired token' });
            conn.ws.close();
            return;
          }
          conn.accountId = claims.sub;
          // Load the account for its GM / banned flags. A banned account is refused here.
          const account = await this.store.getById(claims.sub);
          if (account !== null) {
            if (account.isBanned) {
              this.send(conn.ws, { t: 'error', code: 'auth', message: 'This account is banned.' });
              conn.ws.close();
              return;
            }
            // Bootstrap GMs: an email in GM_EMAILS is granted (and persisted) GM on login.
            conn.isGm = account.isGm || this.opts.gmEmails.includes(account.email.toLowerCase());
            if (conn.isGm && !account.isGm) await this.store.setGm(account.id, true);
          }
          const ch = await this.store.getCharacter(claims.sub);
          if (ch !== null) {
            name = ch.name;
            cls = ch.class;
            level = ch.level;
            totalXp = ch.xp;
            spawn = { x: ch.x, y: ch.y, z: ch.z, yaw: ch.yaw };
            seedInventory = ch.inventory;
            seedGold = ch.gold;
            seedEquipment = ch.equipment;
            seedQuests = ch.quests;
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
        // Seed the authoritative inventory from the persisted character (empty for a guest). The
        // client still drives its own bag this stage; the server model runs in parallel + replicates.
        this.inventories.seed(player.id, {
          cls: player.cls,
          level: player.level,
          inventory: seedInventory,
          gold: seedGold,
          equipment: seedEquipment,
          bagBonus: msg.bagBonus, // client-supplied Deep-Pockets bonus (self-scoped; see ClientHello)
        });
        // Seed the authoritative quest log from the persisted character (empty for a guest). Like the
        // inventory this stage, the server runs the engine + replicates while the client still owns
        // its own log; the client flip (#138 Stage 2) makes this the source of truth.
        this.quests.seed(player.id, seedQuests);
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
          ...(conn.isGm ? { gm: true } : {}),
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
        // Seed ground-item interest: the dropped stacks in the joiner's 3×3 region, tracked so
        // the next passes only send new drops / removals.
        const itemIndex = buildItemCellIndex(this.groundItems.netItems());
        const items: NetWorldItem[] = [];
        for (const wi of visibleItems(player, itemIndex)) {
          items.push(wi);
          conn.knownItems.add(wi.id);
        }
        if (items.length > 0) {
          this.send(conn.ws, { t: 'worldItems', tick: this.sim.tick, items, gone: [] });
        }
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
        // GM-muted: silently drop the line (say + whisper) until the mute expires.
        if (conn.mutedUntilMs > now) return;
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
      case 'who': {
        if (conn.id === null) return; // must be joined
        if (now - conn.lastWhoMs < WHO_MIN_INTERVAL_MS) return; // gate the roster reply
        conn.lastWhoMs = now;
        const players: NetWhoEntry[] = [];
        for (const p of this.sim.players.values()) {
          players.push({ name: p.name, level: p.level, cls: p.cls });
          if (players.length >= WHO_MAX_ENTRIES) break;
        }
        this.send(conn.ws, { t: 'who', players });
        return;
      }
      case 'gm': {
        if (conn.id === null) return; // must be joined
        if (!conn.isGm) return; // silently ignore GM actions from a non-GM (never trusted)
        void this.handleGm(conn.id, msg);
        return;
      }
      case 'dropItem': {
        if (conn.id === null) return; // must be joined
        if (this.combat.isDead(conn.id)) return; // a corpse can't drop loot (matches the move freeze)
        if (now - conn.lastDropMs < DROP_MIN_INTERVAL_MS) return; // anti-spam-drop gate
        const player = this.sim.players.get(conn.id);
        if (player === undefined) return;
        conn.lastDropMs = now;
        // Drop at the player's AUTHORITATIVE position (never a client-supplied one), qty clamped.
        const qty = Math.max(1, Math.min(MAX_DROP_QTY, Math.floor(msg.qty)));
        this.groundItems.drop(
          msg.item,
          qty,
          player.phys.x,
          player.phys.y,
          player.phys.z,
          this.sim.tick,
        );
        // Mirror the removal in the authoritative inventory (matched by content this stage; the
        // index-validated drop lands when the client cedes bag authority in the next slice).
        this.inventories.removeMatchingStack(conn.id, msg.item.id, qty);
        this.groundChanged = true; // force a replication pass so nearby players see it
        return;
      }
      case 'pickupItem': {
        if (conn.id === null) return; // must be joined
        if (this.combat.isDead(conn.id)) return; // a corpse can't loot (matches the move freeze)
        const player = this.sim.players.get(conn.id);
        if (player === undefined) return;
        // Atomic authoritative removal (first-come-wins) if in range — the anti-dup guarantee.
        const picked = this.groundItems.tryPickup(
          msg.id,
          player.phys.x,
          player.phys.z,
          PICKUP_RADIUS,
        );
        if (picked === null) return; // gone, already taken, or out of range — no grant
        // Add to the authoritative bag. If it fits, cue the pickup floater; if the bag was full
        // (a stale client gate raced the server), put it straight back on the ground rather than
        // let it vanish — tryPickup already removed it from the world.
        if (this.inventories.addStack(conn.id, picked.item, picked.qty)) {
          this.send(conn.ws, {
            t: 'grant',
            tick: this.sim.tick,
            items: [{ item: picked.item, qty: picked.qty }],
          });
        } else {
          this.groundItems.drop(
            picked.item,
            picked.qty,
            player.phys.x,
            player.phys.y,
            player.phys.z,
            this.sim.tick,
          );
        }
        this.groundChanged = true; // the stack left the world (or moved) — replicate the change
        return;
      }
      case 'inv': {
        if (conn.id === null) return; // must be joined
        this.handleInvAction(conn.id, msg);
        return;
      }
      case 'claimReward': {
        if (conn.id === null) return; // must be joined
        // Trusted bridge (quest turn-in reward) — the client validated the quest; grant into the
        // authoritative inventory. Server-side quest validation replaces the trust when quests migrate.
        this.inventories.addGold(conn.id, msg.gold);
        // Over-cap reward items spill to the ground (giveOrDrop) rather than vanish — a full bag at
        // turn-in must never eat the reward.
        for (const s of msg.items) this.giveOrDrop(conn, s.item, s.qty);
        return;
      }
      case 'spendGold': {
        if (conn.id === null) return; // must be joined
        // Trusted bridge (travel fee / mount) — debits only if affordable, so it can't go negative.
        this.inventories.spendGold(conn.id, Math.max(0, Math.floor(msg.amount)));
        return;
      }
      case 'quest': {
        if (conn.id === null) return; // must be joined
        this.handleQuestAction(conn, msg);
        return;
      }
      case 'questEvent': {
        if (conn.id === null) return; // must be joined
        // A client-reported objective source (explore / talk / deliver / use / gather) — applied to
        // the authoritative log. Interim-trusted this stage; proximity re-validation lands with the
        // client flip. kill/boss/collect are server-driven (drainKills), never accepted here.
        this.quests.applyEvent(conn.id, msg.ev);
        return;
      }
    }
  }

  /**
   * Apply a server-validated quest action against the player's OWN authoritative log (migration
   * #138). The pure `shared/quests` engine re-checks availability / prereqs / completion, so a client
   * can't accept a locked quest or turn in an unfinished one; the turn-in reward is computed
   * server-side (`grantQuestReward`), retiring the trusted `claimReward` bridge for quests. A
   * successful mutation marks the log dirty, so it replicates on the next broadcast.
   */
  private handleQuestAction(conn: Conn, msg: ClientQuestAction): void {
    if (conn.id === null) return;
    switch (msg.action) {
      case 'accept': {
        // Availability/minLevel are checked against the player's AUTHORITATIVE level (from combat).
        const level = this.combat.progressionOf(conn.id)?.level ?? 1;
        this.quests.accept(conn.id, msg.id, level);
        break;
      }
      case 'turnIn': {
        const reward = this.quests.turnIn(conn.id, msg.id);
        if (reward !== null) this.grantQuestReward(conn, msg.id, reward, msg.choiceIndex);
        break;
      }
      case 'abandon':
        this.quests.abandon(conn.id, msg.id);
        break;
      case 'pin':
        this.quests.setPinned(conn.id, msg.id, true);
        break;
      case 'unpin':
        this.quests.setPinned(conn.id, msg.id, false);
        break;
    }
  }

  /**
   * Grant a completed quest's reward server-side (migration #138): gold + XP into the authoritative
   * wallet / progression, and reward items rolled on a DETERMINISTIC per-(account, quest) RNG stream
   * (never a client seed), class-flavoured, and credited overflow-safe via `giveOrDrop`. This is what
   * the trusted `claimReward` bridge did on the client; the server owns it now. `waystoneUnlock` is
   * applied client-side and lands with the flip (nothing to grant here this stage).
   */
  private grantQuestReward(
    conn: Conn,
    questId: string,
    reward: QuestReward,
    choiceIndex?: number,
  ): void {
    if (conn.id === null) return;
    this.inventories.addGold(conn.id, reward.gold ?? 0);
    if (reward.xp > 0) this.combat.grantXp(conn.id, scaledQuestXp(reward.xp));
    const cls = this.inventories.get(conn.id)?.cls ?? CharacterClass.Warrior;
    const specs: GeneratedItemSpec[] = [...(reward.items ?? [])];
    if (reward.choices !== undefined && reward.choices.length > 0) {
      // Always grant exactly one choice. A missing / out-of-range index defaults to 0 rather than
      // silently dropping the reward item (which would consume the quest for gold + XP only) — the
      // decoder already rejects a negative / fractional index.
      const idx =
        choiceIndex !== undefined && choiceIndex < reward.choices.length ? choiceIndex : 0;
      const chosen = reward.choices[idx];
      if (chosen !== undefined) specs.push(chosen);
    }
    const key = conn.accountId ?? conn.id;
    specs.forEach((spec, i) => {
      const rng = makeRng(WORLD_SEED, 'questReward', key, questId, String(i));
      this.giveOrDrop(conn, generateItem(rng, { ...spec, forClass: cls }), 1);
    });
  }

  /**
   * Apply a server-validated inventory action against the player's OWN authoritative inventory
   * (economy migration, Stage 1b). Every path re-validates server-side (capacity, gold, equippability,
   * index/slot); an invalid action is silently a no-op. A successful mutation marks the inventory
   * dirty, so the updated bag/gold/equipment replicates on the next broadcast.
   */
  private handleInvAction(id: string, msg: ClientInvAction): void {
    switch (msg.action) {
      case 'equip':
        if (msg.index !== undefined) this.inventories.equip(id, msg.index);
        break;
      case 'unequip':
        if (msg.slot !== undefined) this.inventories.unequip(id, msg.slot);
        break;
      case 'sell':
        if (msg.index !== undefined) this.inventories.sell(id, msg.index);
        break;
      case 'buyback':
        if (msg.index !== undefined) this.inventories.buyback(id, msg.index);
        break;
      case 'buy': {
        if (msg.seed === undefined || msg.tier === undefined || msg.index === undefined) break;
        // Recompute the deterministic vendor stock server-side, so the client can't set its own
        // price — it only picks (seed, tier, index); the server owns what that resolves to.
        const tier = Math.max(1, Math.min(40, Math.floor(msg.tier)));
        const entry = vendorStock(msg.seed, tier)[msg.index];
        if (entry !== undefined) this.inventories.buy(id, entry.item, entry.price);
        break;
      }
    }
  }

  /**
   * Credit an item stack to a player's authoritative bag, or — if the bag is full — drop it on the
   * ground at their feet so it is never silently lost. This is the overflow-safe grant path for
   * kill loot and quest-reward turn-ins (a full bag at the moment of the grant must not eat the
   * item). The SPILL is throttled per connection (`takeSpillToken`) so a hostile client can't spam
   * `claimReward` into an unbounded flood of ground motes; past the budget the overflow is dropped
   * rather than spawned. Marks the ground dirty when it spills so nearby players see the new stack.
   */
  private giveOrDrop(conn: Conn, item: ItemDef, qty: number): void {
    if (conn.id === null) return;
    if (this.inventories.addStack(conn.id, item, qty)) return; // fit in the bag — no spill
    if (!this.takeSpillToken(conn)) return; // over the spill budget — eat the overflow, don't flood
    const player = this.sim.players.get(conn.id);
    if (player === undefined) return; // no body to drop at (player gone) — nothing more to do
    const dropQty = Math.max(1, Math.min(MAX_DROP_QTY, Math.floor(qty)));
    this.groundItems.drop(
      item,
      dropQty,
      player.phys.x,
      player.phys.y,
      player.phys.z,
      this.sim.tick,
    );
    this.groundChanged = true;
  }

  /**
   * Lazily refill and consume one ground-spill token for this connection (the `giveOrDrop` throttle).
   * Wall-clock is fine here — this is the gateway edge, never the sim. Returns whether a token was
   * available (i.e. whether the spill is allowed this call).
   */
  private takeSpillToken(conn: Conn): boolean {
    const now = Date.now();
    const elapsed = now - conn.spillRefillMs;
    if (elapsed > 0) {
      conn.spillTokens = Math.min(
        SPILL_BUCKET_CAP,
        conn.spillTokens + (elapsed / 1000) * SPILL_REFILL_PER_SEC,
      );
      conn.spillRefillMs = now;
    }
    if (conn.spillTokens < 1) return false;
    conn.spillTokens -= 1;
    return true;
  }

  // --- GM tooling (server-authoritative; gated on conn.isGm) ---

  /** Apply a validated GM action. Targets a player by name (resolved globally — a GM is trusted);
   *  every path reports its result to the acting GM on the system channel. */
  private async handleGm(gmId: string, msg: ClientGm): Promise<void> {
    const target = this.resolvePlayerByName(msg.target);
    if (target === null) {
      this.systemNotice(gmId, `No player named “${msg.target.slice(0, 24)}” is online.`);
      return;
    }
    const targetConn = this.connById(target.id);
    const name = target.name;
    switch (msg.action) {
      case 'kick': {
        targetConn?.ws.terminate();
        this.systemNotice(gmId, `Kicked ${name}.`);
        break;
      }
      case 'mute': {
        const mins = Math.max(1, Math.min(1440, Math.floor(msg.minutes ?? 10)));
        if (targetConn !== null) targetConn.mutedUntilMs = Date.now() + mins * 60_000;
        this.systemNotice(gmId, `Muted ${name} for ${mins} min.`);
        this.systemNotice(target.id, `You have been muted by a GM for ${mins} min.`);
        break;
      }
      case 'unmute': {
        if (targetConn !== null) targetConn.mutedUntilMs = 0;
        this.systemNotice(gmId, `Unmuted ${name}.`);
        break;
      }
      case 'ban': {
        if (targetConn !== null && targetConn.accountId !== null) {
          await this.store.setBanned(targetConn.accountId, true);
        }
        targetConn?.ws.terminate();
        this.systemNotice(gmId, `Banned ${name}.`);
        break;
      }
      case 'unban': {
        // The target is offline once banned; unban resolves the name only if they're online, so
        // this handles the (rare) re-connect race. Persistent unban by email is a SQL/editor op.
        if (targetConn !== null && targetConn.accountId !== null) {
          await this.store.setBanned(targetConn.accountId, false);
        }
        this.systemNotice(gmId, `Unbanned ${name}.`);
        break;
      }
      case 'teleport': {
        const x = msg.x ?? 0;
        const z = msg.z ?? 0;
        this.sim.teleport(target.id, x, z);
        this.systemNotice(gmId, `Teleported ${name} to (${Math.round(x)}, ${Math.round(z)}).`);
        break;
      }
      case 'give': {
        // Item-granting by registry id lands with the content catalog; for now `give` grants gold.
        const gold = Math.max(0, Math.floor(msg.qty ?? 0));
        if (targetConn !== null && gold > 0) {
          this.send(targetConn.ws, {
            t: 'kill',
            tick: this.sim.tick,
            enemyId: '', // no quest credit — a GM grant, not a kill
            gold,
            items: [],
          });
        }
        this.systemNotice(gmId, `Gave ${name} ${gold} gold.`);
        break;
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

  /** Resolve a player NAME (case-insensitive) to their session id + authoritative name, or null.
   *  Used only by GM tooling — a GM is trusted, so first-match on a duplicate name is acceptable. */
  private resolvePlayerByName(name: string): { id: string; name: string } | null {
    const lower = name.trim().toLowerCase();
    if (lower.length === 0) return null;
    for (const p of this.sim.players.values()) {
      if (p.name.toLowerCase() === lower) return { id: p.id, name: p.name };
    }
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
    // Despawn ground items past their 10-minute lifetime; a removal forces a replication pass so
    // clients drop the mesh (the ids ride the per-conn `gone` list in broadcast()).
    if (this.groundItems.expire(this.sim.tick, this.groundItemTtlTicks).length > 0) {
      this.groundChanged = true;
    }
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
    const groundChanged = this.groundChanged;
    this.groundChanged = false;
    // A ground-item drop / pickup / despawn shifts item interest even if no player moved, so it
    // joins the delta-pass trigger alongside player movement + enemy changes.
    const buildDeltas =
      this.sim.anyDirty() || membershipChanged || this.combat.hasChanges() || groundChanged;
    const index = buildDeltas ? buildCellIndex(this.sim.players.values()) : null;
    const entityIndex = buildDeltas ? buildEntityCellIndex(this.combat.netEntities()) : null;
    const itemIndex = buildDeltas ? buildItemCellIndex(this.groundItems.netItems()) : null;

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

      // 1b-i) Own authoritative inventory (bag / gold / equipment) — owner-only, sent when it
      //        changed since the last broadcast (economy migration). Also interest-independent.
      if (this.inventories.isDirty(conn.id)) {
        const inv = this.inventories.get(conn.id);
        if (inv !== null) {
          const bag: NetItemStack[] = inv.bag.map((s) => ({ item: s.item, qty: s.qty }));
          const buyback: NetItemStack[] = inv.buyback.map((b) => ({ item: b.item, qty: b.qty }));
          this.send(conn.ws, {
            t: 'inventory',
            tick: this.sim.tick,
            bag,
            gold: inv.gold,
            equipment: { ...inv.equipment },
            buyback,
          });
          this.inventories.markClean(conn.id);
        }
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
        // Credit the same loot to the authoritative inventory. A full bag spills the item to the
        // ground (giveOrDrop) instead of eating it, so hard-won kill loot is never silently lost.
        this.inventories.addGold(conn.id, kill.gold);
        for (const stack of kill.items) this.giveOrDrop(conn, stack.item, stack.qty);
        // Drive the authoritative quest log from the same kill (migration #138): kill + boss + the
        // enemy's collect drop-tag. `drainKills` already fanned this credit to every eligible party
        // member, so party questing advances for each of them — kill counts can't be forged.
        this.quests.applyKill(conn.id, kill.enemyId);
      }

      // 1c-ii) Own authoritative quest log (migration #138) — owner-only, sent when it changed since
      //        the last broadcast (accepts / turn-ins / progress incl. the kills just credited).
      if (this.quests.isDirty(conn.id)) {
        const log = this.quests.get(conn.id);
        if (log !== null) {
          this.send(conn.ws, {
            t: 'questLog',
            tick: this.sim.tick,
            active: log.active,
            turnedIn: log.turnedIn,
          });
          this.quests.markClean(conn.id);
        }
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

        // Ground items: ENTER (newly dropped / walked into range) + LEAVE (picked up, despawned,
        // or walked out of range). A ground item is immutable, so there is no UPDATE case — an id
        // enters `known` once and only leaves on removal. Sent on its own frame from ServerWorldItems.
        if (itemIndex !== null) {
          const visibleWi = visibleItems(viewer, itemIndex);
          const seenWi = new Set<string>();
          const newItems: NetWorldItem[] = [];
          const goneItems: string[] = [];
          for (const wi of visibleWi) {
            seenWi.add(wi.id);
            if (!conn.knownItems.has(wi.id)) {
              conn.knownItems.add(wi.id); // ENTER
              newItems.push(wi);
            }
          }
          for (const id of conn.knownItems) if (!seenWi.has(id)) goneItems.push(id);
          for (const id of goneItems) conn.knownItems.delete(id);
          if (newItems.length > 0 || goneItems.length > 0) {
            this.send(conn.ws, {
              t: 'worldItems',
              tick: this.sim.tick,
              items: newItems,
              gone: goneItems,
            });
          }
        }
      }
    }
    this.sim.clearDirty(); // exactly once, after every subscriber has read p.dirty
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServer(msg));
  }
}
