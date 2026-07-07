// Audio (GDD §5 / ROADMAP Phase 5). Deliberately simple per the project's audio
// direction: two looping music tracks (a login/character-select bed and one in-game
// bed) loaded from user-supplied mp3s, plus a handful of SFX synthesized in code so
// there are no sound-effect files to ship. Everything runs through a master gain bus
// wired to the Settings master-volume slider.
//
// Browser autoplay policy blocks audio until a user gesture, so the context is created
// lazily and resumed on the first pointer/key press; a track requested before then is
// queued and starts on unlock. Missing/undecodable mp3s fail silently (the game just
// runs without that track) — the audio layer must never throw into the game loop.

import { AUDIO } from './assetManifest.js';

type MusicTrack = 'login' | 'game';

const TRACK_URL: Record<MusicTrack, string> = {
  login: `/${AUDIO.login}`,
  game: `/${AUDIO.bgm}`,
};

/** Short synthesized cues (no asset files). */
export type Sfx = 'cast' | 'death' | 'levelup' | 'quest' | 'loot';

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private masterVolume = 0.8;
  private readonly buffers = new Map<MusicTrack, AudioBuffer | null>(); // null = tried & failed
  private current: { track: MusicTrack; source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  private desired: MusicTrack | null = null;
  private unlocked = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = (): void => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Create the context + gain graph on demand (after a gesture). */
  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.masterVolume;
      master.connect(ctx.destination);
      const music = ctx.createGain();
      music.gain.value = 1;
      music.connect(master);
      const sfx = ctx.createGain();
      sfx.gain.value = 0.9;
      sfx.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.musicGain = music;
      this.sfxGain = sfx;
      return ctx;
    } catch {
      return null;
    }
  }

  /** Resume the context after a user gesture and start any queued track. */
  private unlock(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.unlocked = true;
    if (this.desired) void this.startMusic(this.desired);
  }

  /** Master volume 0..1 (from the Settings slider). Applied immediately. */
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  /** Request a looping music bed. Queues until unlocked; no-op if already playing it. */
  playMusic(track: MusicTrack): void {
    this.desired = track;
    if (this.unlocked) void this.startMusic(track);
  }

  stopMusic(): void {
    this.desired = null;
    this.fadeOutCurrent();
  }

  private async loadBuffer(track: MusicTrack): Promise<AudioBuffer | null> {
    if (this.buffers.has(track)) return this.buffers.get(track) ?? null;
    const ctx = this.ensure();
    if (!ctx) return null;
    try {
      const res = await fetch(TRACK_URL[track]);
      if (!res.ok) throw new Error(`audio ${track} ${res.status}`);
      const data = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(data);
      this.buffers.set(track, buf);
      return buf;
    } catch {
      // Missing/undecodable file — remember the failure and run silently.
      this.buffers.set(track, null);
      return null;
    }
  }

  private async startMusic(track: MusicTrack): Promise<void> {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    if (this.current?.track === track) return; // already playing this bed
    const buf = await this.loadBuffer(track);
    // `desired` may have changed while we awaited the fetch; honor the latest request.
    if (!buf || this.desired !== track) return;
    this.fadeOutCurrent();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.musicGain);
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    source.connect(gain);
    source.start();
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.4); // fade in
    this.current = { track, source, gain };
  }

  private fadeOutCurrent(): void {
    const cur = this.current;
    const ctx = this.ctx;
    if (!cur || !ctx) return;
    this.current = null;
    cur.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    try {
      cur.source.stop(ctx.currentTime + 1.2);
    } catch {
      /* already stopped */
    }
  }

  /** Play a short synthesized cue. Silent until the context is unlocked. */
  sfx(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    switch (name) {
      case 'cast':
        this.blip(t, [440, 660], 0.12, 'sine', 0.25);
        break;
      case 'death':
        this.blip(t, [220, 90], 0.22, 'sawtooth', 0.3);
        break;
      case 'levelup':
        this.blip(t, [523], 0.16, 'sine', 0.3);
        this.blip(t + 0.12, [659], 0.16, 'sine', 0.3);
        this.blip(t + 0.24, [784], 0.28, 'sine', 0.32);
        break;
      case 'quest':
        this.blip(t, [660], 0.14, 'triangle', 0.28);
        this.blip(t + 0.12, [990], 0.22, 'triangle', 0.28);
        break;
      case 'loot':
        // A soft two-note "pickup" chirp — brighter and shorter than the quest cue.
        this.blip(t, [740], 0.08, 'sine', 0.22);
        this.blip(t + 0.06, [880], 0.12, 'sine', 0.22);
        break;
    }
  }

  /** One enveloped tone (optionally sweeping between two frequencies). */
  private blip(
    start: number,
    freqs: number[],
    dur: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqs[0]!, start);
    if (freqs.length > 1) osc.frequency.exponentialRampToValueAtTime(freqs[1]!, start + dur);
    // Percussive envelope: fast attack, exponential decay.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

/** Process-wide audio singleton. */
export const audio = new AudioManager();
