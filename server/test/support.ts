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
  type Intent,
  type MoveIntent,
  type ItemDef,
  type NetCombatSelf,
  type NetEntity,
  type NetItemStack,
  type NetPartyMember,
  type NetPartyVital,
  type NetPlayer,
  type NetSelf,
  type NetWorldItem,
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
    gmEmails: [],
  };
}

/** A minimal test client: connects, says hello, moves, and mirrors server state. */
export class TestClient {
  readonly ws: WebSocket;
  you: string | null = null;
  seed: number | null = null;
  readonly players = new Map<string, NetPlayer>();
  /** Server-authoritative enemy entities this client currently sees. */
  readonly enemies = new Map<string, NetEntity>();
  lastSelf: { ackedSeq: number; phys: NetSelf } | null = null;
  /** Latest own combat state (health / resource / target / cast), or null until first frame. */
  lastCombatSelf: NetCombatSelf | null = null;
  /** Every Move intent this client has sent, in send order — for reconcile replay. */
  readonly sent: { seq: number; intent: MoveIntent }[] = [];
  /** Every chat line this client has received, in arrival order. */
  readonly chats: {
    fromId: string;
    from: string;
    text: string;
    tick: number;
    emote: boolean;
    whisper: boolean;
  }[] = [];
  /** Latest party roster (members + leader); members empty when solo. */
  lastParty: { members: NetPartyMember[]; leaderId: string } = { members: [], leaderId: '' };
  /** Latest pending party invite received, or null. */
  lastInvite: { fromId: string; fromName: string } | null = null;
  /** Latest party-vitals frame (member id → live hp/resource), or null before the first. */
  lastVitals: NetPartyVital[] | null = null;
  /** Latest /who roster reply, or null before the first request. */
  lastWho: { name: string; level: number; cls: string }[] | null = null;
  /** GM privilege reported by the welcome. */
  gm = false;
  /** True once the socket has closed (e.g. after a GM kick). */
  closed = false;
  /** Gold from the most recent kill/grant frame, or null. */
  lastKillGold: number | null = null;
  /** Ground items this client currently sees (interest-filtered), keyed by id. */
  readonly worldItems = new Map<string, NetWorldItem>();
  /** Item stacks from the most recent pickup grant, appended in arrival order. */
  readonly grants: NetItemStack[] = [];
  deltaCount = 0;
  private seq = 0;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => this.onMessage(data.toString()));
    this.ws.on('close', () => {
      this.closed = true;
    });
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
        this.gm = msg.gm === true;
        break;
      case 'kill':
        this.lastKillGold = msg.gold;
        break;
      case 'snapshot':
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        this.enemies.clear();
        for (const e of msg.entities) this.enemies.set(e.id, e);
        break;
      case 'delta':
        this.deltaCount += 1;
        for (const p of msg.players) this.players.set(p.id, p);
        for (const id of msg.gone) this.players.delete(id);
        for (const e of msg.entities) this.enemies.set(e.id, e);
        for (const id of msg.goneEntities) this.enemies.delete(id);
        break;
      case 'self':
        this.lastSelf = { ackedSeq: msg.ackedSeq, phys: msg.phys };
        break;
      case 'combatSelf':
        this.lastCombatSelf = msg.self;
        break;
      case 'chat':
        this.chats.push({
          fromId: msg.fromId,
          from: msg.from,
          text: msg.text,
          tick: msg.tick,
          emote: msg.emote === true,
          whisper: msg.whisper === true,
        });
        break;
      case 'partyState':
        this.lastParty = { members: msg.members, leaderId: msg.leaderId };
        break;
      case 'partyInvite':
        this.lastInvite = { fromId: msg.fromId, fromName: msg.fromName };
        break;
      case 'partyVitals':
        this.lastVitals = msg.vitals;
        break;
      case 'who':
        this.lastWho = msg.players;
        break;
      case 'worldItems':
        for (const wi of msg.items) this.worldItems.set(wi.id, wi);
        for (const id of msg.gone) this.worldItems.delete(id);
        break;
      case 'grant':
        for (const s of msg.items) this.grants.push(s);
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
  /** Send a directed whisper to a session id. */
  whisper(toId: string, text: string): void {
    this.send({ t: 'chat', text, to: toId });
  }
  /** Request the online-player roster (/who). */
  who(): void {
    this.send({ t: 'who' });
  }
  /** Drop a bag stack onto the ground (spawned at the player's authoritative position). */
  dropItem(item: ItemDef, qty = 1): void {
    this.send({ t: 'dropItem', item, qty });
  }
  /** Ask to pick up a ground item by id. */
  pickupItem(id: string): void {
    this.send({ t: 'pickupItem', id });
  }
  /** Send a GM action (target by name). */
  gmAction(
    action: 'kick' | 'mute' | 'unmute' | 'ban' | 'unban' | 'teleport' | 'give',
    target: string,
    opts: { minutes?: number; x?: number; z?: number; qty?: number } = {},
  ): void {
    this.send({ t: 'gm', action, target, ...opts });
  }

  /** Send a combat intent (target / cast / auto-attack / release) with an increasing seq. */
  private combatIntent(intent: Intent): void {
    this.seq += 1;
    this.send({ t: 'intent', seq: this.seq, tick: 0, intent });
  }

  setTarget(targetId: string | null): void {
    this.combatIntent({ type: 'SetTarget', targetId });
  }

  cast(skillId: string, targetId?: string): void {
    this.combatIntent({
      type: 'CastSkill',
      skillId,
      ...(targetId !== undefined ? { targetId } : {}),
    });
  }

  toggleAuto(on: boolean): void {
    this.combatIntent({ type: 'ToggleAutoAttack', on });
  }

  release(): void {
    this.combatIntent({ type: 'ReleaseSpirit' });
  }

  // --- party (invite/kick target the recipient's SESSION id, from the roster/snapshot) ---
  partyInvite(id: string): void {
    this.send({ t: 'party', action: 'invite', target: id });
  }
  partyAccept(): void {
    this.send({ t: 'party', action: 'accept' });
  }
  partyDecline(): void {
    this.send({ t: 'party', action: 'decline' });
  }
  partyLeave(): void {
    this.send({ t: 'party', action: 'leave' });
  }
  partyKick(id: string): void {
    this.send({ t: 'party', action: 'kick', target: id });
  }

  close(): void {
    this.ws.close();
  }
}
