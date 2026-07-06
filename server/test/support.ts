// Shared helpers for the server integration tests: a poll-until helper, a full set of
// gateway options with test-friendly limits, and a minimal WebSocket TestClient that
// mirrors what the browser NetClient does (applies snapshot/delta, tracks self-state,
// records sent intents for reconciliation assertions).

import { WebSocket } from 'ws';
import {
  decodeServer,
  encodeClient,
  makeMoveIntent,
  NET_PROTOCOL_VERSION,
  type ClientMessage,
  type MoveIntent,
  type NetPlayer,
  type NetSelf,
} from '@pathlands/shared';
import { TICK_DURATION_MS } from '@pathlands/shared';
import type { GatewayOptions } from '../src/gateway.js';

/** Poll `cond` until true or `ms` elapses; rejects with `label` on timeout. */
export function until(cond: () => boolean, ms: number, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(`timeout waiting for ${label}`));
      setTimeout(tick, 15);
    };
    tick();
  });
}

/** Sleep `ms` (test-only wall-clock). */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Full gateway options for tests: port 0 (OS-assigned) and generous safety limits. */
export function gatewayOptions(port = 0): GatewayOptions {
  return {
    port,
    host: '127.0.0.1',
    tickDurationMs: TICK_DURATION_MS,
    broadcastEveryTicks: 2,
    maxPayloadBytes: 16 * 1024,
    maxConnections: 512,
    // Large so the reaper never fires mid-test; the tests close their own sockets.
    helloTimeoutMs: 60_000,
    heartbeatMs: 60_000,
    // High so the move-every-tick tests are never throttled; a focused test overrides it.
    maxMsgsPerSec: 1000,
    authRatePerMin: 1000,
    maxAuthBodyBytes: 4 * 1024,
    maxCharacterBodyBytes: 512 * 1024,
    // Long so the periodic position flush never races the tests; they persist explicitly.
    saveIntervalMs: 3_600_000,
  };
}

/** A minimal test client: connects, says hello, moves, and mirrors server state. */
export class TestClient {
  readonly ws: WebSocket;
  you: string | null = null;
  seed: number | null = null;
  readonly players = new Map<string, NetPlayer>();
  lastSelf: { ackedSeq: number; phys: NetSelf } | null = null;
  /** Every Move intent this client has sent, in send order — for reconcile replay. */
  readonly sent: { seq: number; intent: MoveIntent }[] = [];
  /** Every chat line this client has received, in arrival order. */
  readonly chats: {
    fromId: string;
    from: string;
    text: string;
    tick: number;
    emote: boolean;
  }[] = [];
  deltaCount = 0;
  private seq = 0;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => this.onMessage(data.toString()));
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  private onMessage(raw: string): void {
    const msg = decodeServer(raw);
    if (msg === null) return;
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.seed = msg.seed;
        break;
      case 'snapshot':
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        break;
      case 'delta':
        this.deltaCount += 1;
        for (const p of msg.players) this.players.set(p.id, p);
        for (const id of msg.gone) this.players.delete(id);
        break;
      case 'self':
        this.lastSelf = { ackedSeq: msg.ackedSeq, phys: msg.phys };
        break;
      case 'chat':
        this.chats.push({
          fromId: msg.fromId,
          from: msg.from,
          text: msg.text,
          tick: msg.tick,
          emote: msg.emote === true,
        });
        break;
      default:
        break;
    }
  }

  private send(msg: ClientMessage): void {
    this.ws.send(encodeClient(msg));
  }

  hello(name: string, cls: string, level: number, token?: string): void {
    const msg: ClientMessage = { t: 'hello', protocol: NET_PROTOCOL_VERSION, name, cls, level };
    if (token !== undefined) msg.token = token;
    this.send(msg);
  }

  /** Send one move intent (increasing seq so the server never drops it); record it. */
  move(wishX: number, wishZ: number): void {
    this.seq += 1;
    const intent = makeMoveIntent(wishX, wishZ, false, false, 0);
    this.sent.push({ seq: this.seq, intent });
    this.send({ t: 'intent', seq: this.seq, tick: 0, intent });
  }

  /** Send a chat line. */
  chat(text: string): void {
    this.send({ t: 'chat', text });
  }

  close(): void {
    this.ws.close();
  }
}
