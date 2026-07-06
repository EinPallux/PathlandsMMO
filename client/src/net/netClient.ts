// The browser side of the Phase-6 netcode. It is the mirror of the server gateway:
// it sends the local player's intents and renders the OTHER players the server reports,
// interpolated ~120 ms in the past so their motion is smooth despite 10 Hz deltas
// (ARCH §7). It is entirely OPT-IN — the game constructs a NetClient only when a server
// URL is configured, so the single-player build stays server-free (a hard rule until
// now: no server dependency in Phases 1–5).
//
// Own-player movement is still predicted locally by the existing PlayerController (it
// runs the same shared movement function the server does). Full server reconciliation
// of the local player — snapping prediction back on divergence — is the next part; here
// the local sim and the authoritative sim agree because they run identical code on the
// same intents.

import {
  decodeServer,
  encodeClient,
  lerp,
  lerpAngle,
  NET_PROTOCOL_VERSION,
  CharacterClass,
  CHARACTER_CLASSES,
  type Intent,
  type MoveState,
  type NetPlayer,
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

/** Connection status surfaced to the UI (indicators, reconnect notice). */
export interface NetStatus {
  connected: boolean;
  /** Number of other players currently visible. */
  peers: number;
  /** Our own session id, once welcomed. */
  you: string | null;
}

export interface NetClientOptions {
  url: string;
  identity: { name: string; cls: string; level: number };
  /** How far in the past to render remotes (ms). 100–150 ms per ARCH §7. */
  renderDelayMs?: number;
  /** Notified whenever connection status changes. */
  onStatus?: (status: NetStatus) => void;
}

interface Sample {
  t: number; // local receive time (performance.now)
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

const DEFAULT_RENDER_DELAY_MS = 120;
const SAMPLE_HISTORY_MS = 1000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;

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
  private seq = 0;
  private localTick = 0;
  private readonly renderDelayMs: number;
  private closedByUser = false;
  private reconnectMs = RECONNECT_BASE_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: NetClientOptions) {
    this.renderDelayMs = opts.renderDelayMs ?? DEFAULT_RENDER_DELAY_MS;
  }

  connect(): void {
    this.closedByUser = false;
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
      this.send({
        t: 'hello',
        protocol: NET_PROTOCOL_VERSION,
        name: this.opts.identity.name,
        cls: this.opts.identity.cls,
        level: this.opts.identity.level,
      });
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
        this.emitStatus();
        break;
      case 'snapshot': {
        this.tracks.clear();
        const now = this.nowMs();
        for (const p of msg.players) this.ingest(p, now);
        this.emitStatus();
        break;
      }
      case 'delta': {
        const now = this.nowMs();
        for (const p of msg.players) this.ingest(p, now);
        for (const id of msg.gone) this.tracks.delete(id);
        this.emitStatus();
        break;
      }
      default:
        break;
    }
  }

  private ingest(p: NetPlayer, now: number): void {
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
    track.samples.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw, move: p.move });
    // Keep a second of history — enough to interpolate a render-delayed target.
    const cutoff = now - SAMPLE_HISTORY_MS;
    while (track.samples.length > 2 && track.samples[0]!.t < cutoff) track.samples.shift();
  }

  private onClose(): void {
    this.connected = false;
    this.ws = null;
    this.emitStatus();
    if (!this.closedByUser) this.scheduleReconnect();
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

  /** Send the local player's intent for this tick (sequence-numbered for later acks). */
  sendIntent(intent: Intent): void {
    this.localTick += 1;
    if (this.ws === null || this.ws.readyState !== WebSocket.OPEN || this.you === null) return;
    this.seq += 1;
    this.send({ t: 'intent', seq: this.seq, tick: this.localTick, intent });
  }

  /**
   * Remote players, positions interpolated to (now − renderDelay) between the two
   * bracketing samples. Smooth motion despite the low wire rate; no extrapolation past
   * the last sample (a stopped player rests where the server last placed it).
   */
  remotePlayers(): RemoteRenderState[] {
    const target = this.nowMs() - this.renderDelayMs;
    const out: RemoteRenderState[] = [];
    for (const [id, track] of this.tracks) {
      const s = track.samples;
      if (s.length === 0) continue;
      const state = this.sampleAt(s, target);
      out.push({
        id,
        name: track.name,
        cls: track.cls,
        level: track.level,
        x: state.x,
        y: state.y,
        z: state.z,
        yaw: state.yaw,
        move: state.move,
      });
    }
    return out;
  }

  private sampleAt(s: Sample[], target: number): Sample {
    const first = s[0]!;
    const last = s[s.length - 1]!;
    if (target <= first.t) return first;
    if (target >= last.t) return last;
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i]!;
      const b = s[i + 1]!;
      if (target >= a.t && target <= b.t) {
        const span = b.t - a.t;
        const alpha = span > 0 ? (target - a.t) / span : 0;
        return {
          t: target,
          x: lerp(a.x, b.x, alpha),
          y: lerp(a.y, b.y, alpha),
          z: lerp(a.z, b.z, alpha),
          yaw: lerpAngle(a.yaw, b.yaw, alpha),
          // Use the destination sample's animation state (walk/run/idle) once en route.
          move: b.move,
        };
      }
    }
    return last;
  }

  status(): NetStatus {
    return { connected: this.connected, peers: this.tracks.size, you: this.you };
  }

  dispose(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws !== null) {
      this.ws.close();
      this.ws = null;
    }
    this.tracks.clear();
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
