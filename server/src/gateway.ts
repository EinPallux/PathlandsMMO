// The WebSocket gateway: the boundary between untrusted clients and the authoritative
// sim. It owns the tick clock (wall-clock lives HERE, at the integration edge — never
// in the sim), decodes and routes client frames, and broadcasts authoritative state.
//
// Replication in this slice is broadcast-to-all: every joined client hears every
// player. Interest management (3×3-chunk subscription around each player, ARCH §7) is
// the next step and slots in exactly where marked below — the delta would be filtered
// per subscriber instead of shared. Two players in one town is well within one cell,
// so the slice is correct as-is.

import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  decodeClient,
  encodeServer,
  NET_PROTOCOL_VERSION,
  WORLD_SEED,
  type ServerMessage,
} from '@pathlands/shared';
import type { ServerSim } from './sim.js';

interface Conn {
  readonly ws: WebSocket;
  /** Session id once the player has said hello; null while unauthenticated. */
  id: string | null;
}

export interface GatewayOptions {
  port: number;
  host: string;
  tickDurationMs: number;
  broadcastEveryTicks: number;
}

export class GameServer {
  private readonly wss: WebSocketServer;
  private readonly conns = new Map<WebSocket, Conn>();
  /** Ids that left since the last broadcast — folded into the next delta's `gone`. */
  private goneSinceBroadcast: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sim: ServerSim,
    private readonly opts: GatewayOptions,
  ) {
    this.wss = new WebSocketServer({ port: opts.port, host: opts.host });
    this.wss.on('connection', (ws) => this.onConnection(ws));
  }

  /** Resolve once the socket is accepting connections. */
  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.once('listening', () => {
        this.timer = setInterval(() => this.onTick(), this.opts.tickDurationMs);
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
    for (const { ws } of this.conns.values()) ws.terminate();
    this.conns.clear();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  // --- connection lifecycle ---

  private onConnection(ws: WebSocket): void {
    const conn: Conn = { ws, id: null };
    this.conns.set(ws, conn);
    ws.on('message', (data: RawData) => this.onMessage(conn, data.toString()));
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => this.onClose(conn));
  }

  private onClose(conn: Conn): void {
    if (!this.conns.delete(conn.ws)) return;
    if (conn.id !== null) {
      this.sim.remove(conn.id);
      this.goneSinceBroadcast.push(conn.id);
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
        this.send(conn.ws, {
          t: 'welcome',
          protocol: NET_PROTOCOL_VERSION,
          you: player.id,
          seed: WORLD_SEED,
          tick: this.sim.tick,
          tickRate: this.opts.tickDurationMs > 0 ? 1000 / this.opts.tickDurationMs : 0,
        });
        // The new arrival gets everyone at once; existing clients learn of it via the
        // next delta (join marks the player dirty in the sim).
        this.send(conn.ws, { t: 'snapshot', tick: this.sim.tick, players: this.sim.allNet() });
        return;
      }
      case 'intent': {
        if (conn.id === null) return; // must hello first
        if (msg.intent.type === 'Move') this.sim.applyMove(conn.id, msg.intent, msg.seq);
        // Non-move intents are accepted at the wire but simulated in later parts.
        return;
      }
      case 'ping': {
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

  // --- tick + broadcast ---

  private onTick(): void {
    this.sim.step();
    if (this.sim.tick % this.opts.broadcastEveryTicks === 0) this.broadcast();
  }

  private broadcast(): void {
    const players = this.sim.dirtyNet();
    const gone = this.goneSinceBroadcast;
    if (players.length === 0 && gone.length === 0) {
      this.sim.clearDirty();
      return; // nothing changed — spare the wire
    }
    // Interest-management seam: for the slice every joined client receives the same
    // delta. Per-subscriber filtering (by chunk distance) replaces this loop next part.
    for (const conn of this.conns.values()) {
      if (conn.id === null) continue;
      this.send(conn.ws, { t: 'delta', tick: this.sim.tick, players, gone });
    }
    this.sim.clearDirty();
    this.goneSinceBroadcast = [];
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(encodeServer(msg));
  }
}
