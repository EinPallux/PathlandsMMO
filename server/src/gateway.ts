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

import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  decodeClient,
  encodeServer,
  NET_PROTOCOL_VERSION,
  WORLD_SEED,
  type NetPlayer,
  type ServerMessage,
} from '@pathlands/shared';
import type { ServerSim } from './sim.js';
import { buildCellIndex, visibleIds } from './interest.js';

interface Conn {
  readonly ws: WebSocket;
  /** Session id once the player has said hello; null while unauthenticated. */
  id: string | null;
  /** Player ids currently replicated to this connection (its interest membership). */
  readonly known: Set<string>;
  /** Cleared by the heartbeat each round; set true on a WebSocket-level pong. */
  isAlive: boolean;
  /** Fires if the socket never says hello — an anti-idle-DoS reaper. */
  helloTimer: ReturnType<typeof setTimeout> | null;
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
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly conns = new Map<WebSocket, Conn>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when a player joined or disconnected — forces a delta pass past the idle-skip. */
  private membershipChanged = false;

  constructor(
    private readonly sim: ServerSim,
    private readonly opts: GatewayOptions,
  ) {
    this.wss = new WebSocketServer({
      port: opts.port,
      host: opts.host,
      // Reject oversized frames before they reach JSON.parse (event-loop / OOM DoS).
      maxPayload: opts.maxPayloadBytes,
    });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  /** Resolve once the socket is accepting connections. */
  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.once('listening', () => {
        this.timer = setInterval(() => this.onTick(), this.opts.tickDurationMs);
        this.heartbeatTimer = setInterval(() => this.heartbeat(), this.opts.heartbeatMs);
        resolve();
      });
      this.wss.once('error', reject);
    });
  }

  /** The port actually bound (useful when constructed with port 0 in tests). */
  address(): number {
    const addr = this.wss.address();
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
    for (const conn of this.conns.values()) {
      if (conn.helloTimer !== null) clearTimeout(conn.helloTimer);
      conn.ws.terminate();
    }
    this.conns.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  // --- connection lifecycle ---

  private onConnection(ws: WebSocket): void {
    // Connection cap: refuse past the limit before allocating any per-conn state.
    if (this.conns.size >= this.opts.maxConnections) {
      ws.terminate();
      return;
    }
    const conn: Conn = { ws, id: null, known: new Set(), isAlive: true, helloTimer: null };
    conn.helloTimer = setTimeout(() => {
      if (conn.id === null) conn.ws.terminate(); // never authenticated — reap it
    }, this.opts.helloTimeoutMs);
    this.conns.set(ws, conn);
    ws.on('message', (data: RawData) => this.onMessage(conn, data.toString()));
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
      this.sim.remove(conn.id);
      // The player's departure surfaces to peers as a `gone` on the next delta.
      this.membershipChanged = true;
    }
  }

  private onMessage(conn: Conn, raw: string): void {
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
        const player = this.sim.join(msg.name, msg.cls, msg.level);
        conn.id = player.id;
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
        this.send(conn.ws, { t: 'snapshot', tick: this.sim.tick, players });
        this.membershipChanged = true;
        return;
      }
      case 'intent': {
        if (conn.id === null) return; // must hello first
        if (msg.intent.type === 'Move') this.sim.applyMove(conn.id, msg.intent, msg.seq);
        // Non-move intents are accepted at the wire but simulated in later parts.
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
    this.sim.step();
    if (this.sim.tick % this.opts.broadcastEveryTicks === 0) this.broadcast();
  }

  private broadcast(): void {
    const membershipChanged = this.membershipChanged;
    this.membershipChanged = false;
    // The delta pass is only needed when something could have changed; the `self` pass
    // always runs so reconciliation acks keep flowing (and the client prunes its input
    // history) even for a stationary player.
    const buildDeltas = this.sim.anyDirty() || membershipChanged;
    const index = buildDeltas ? buildCellIndex(this.sim.players.values()) : null;

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

      // 2) Interest-filtered delta of the OTHER players in the viewer's 3×3 region.
      if (index !== null) {
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
        if (players.length > 0 || gone.length > 0) {
          this.send(conn.ws, { t: 'delta', tick: this.sim.tick, players, gone });
        }
      }
    }
    this.sim.clearDirty(); // exactly once, after every subscriber has read p.dirty
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServer(msg));
  }
}
