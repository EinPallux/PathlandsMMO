// Deterministic, seeded random number generation. This is the ONLY source of
// randomness allowed in simulation code (Math.random is banned by lint in shared/).
//
// Two primitives:
//   - Rng: a sequential stream (mulberry32) for "roll a d20" style draws.
//   - hash*: stateless spatial hashing for "what's at (x,y,z)" style queries
//     (worldgen scatter, noise permutations) — order-independent and repeatable.

/** Mix a 32-bit integer thoroughly (finalizer from MurmurHash3). */
export function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stateless 2D integer hash → uint32. */
export function hash2(x: number, y: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  return mix32(h);
}

/** Stateless 3D integer hash → uint32. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2f);
  h = Math.imul(h ^ (y | 0), 0x165667b1);
  h = Math.imul(h ^ (z | 0), 0x9e3779b1);
  return mix32(h);
}

/** Stateless spatial hash → float in [0, 1). */
export function hashFloat2(x: number, y: number, seed: number): number {
  return hash2(x, y, seed) / 4294967296;
}

/** Stateless spatial hash → float in [0, 1). */
export function hashFloat3(x: number, y: number, z: number, seed: number): number {
  return hash3(x, y, z, seed) / 4294967296;
}

/** Derive a stable child seed from a parent seed and a string key. */
export function deriveSeed(seed: number, key: string): number {
  let h = seed | 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  }
  return mix32(h);
}

/**
 * A deterministic sequential RNG stream (mulberry32). Small, fast, good enough
 * for gameplay draws. NOT cryptographic. Same seed ⇒ same sequence, always.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid a zero state producing a degenerate stream.
    this.state = (seed | 0) === 0 ? 0x9e3779b9 : seed >>> 0;
  }

  /** Fork a labelled sub-stream (e.g. rng.fork('loot')) with an independent sequence. */
  fork(key: string): Rng {
    return new Rng(deriveSeed(this.state, key));
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Next float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a uniformly random element, or undefined for an empty array. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted pick; weights need not be normalised. Returns index. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return 0;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i] ?? 0);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Snapshot the internal state (for save/replay). */
  getState(): number {
    return this.state >>> 0;
  }

  /** Restore a previously snapshotted state. */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/** Construct an Rng from the world seed plus optional stream keys. */
export function makeRng(seed: number, ...keys: string[]): Rng {
  let s = seed | 0;
  for (const k of keys) s = deriveSeed(s, k);
  return new Rng(s);
}
