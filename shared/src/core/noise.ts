// Seeded gradient (Perlin) noise, 2D and 3D, with fractal Brownian motion (fBm)
// helpers. Deterministic from a seed: the permutation table is shuffled with the
// seeded Rng, so the same seed always yields the same field on any machine.

import { Rng } from './rng.js';

const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** A seeded Perlin noise field. Construct once per seed and reuse. */
export class Noise {
  private readonly perm: Uint8Array;
  private readonly permMod12: Uint8Array;

  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher–Yates shuffle with the seeded stream.
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      const v = p[i & 255]!;
      this.perm[i] = v;
      this.permMod12[i] = v % 12;
    }
  }

  /** 2D Perlin noise in roughly [-1, 1]. */
  perlin2(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = this.grad2(this.perm[X + this.perm[Y]!]!, xf, yf);
    const ba = this.grad2(this.perm[X + 1 + this.perm[Y]!]!, xf - 1, yf);
    const ab = this.grad2(this.perm[X + this.perm[Y + 1]!]!, xf, yf - 1);
    const bb = this.grad2(this.perm[X + 1 + this.perm[Y + 1]!]!, xf - 1, yf - 1);

    const x1 = lerp(aa, ba, u);
    const x2 = lerp(ab, bb, u);
    return lerp(x1, x2, v);
  }

  /** 3D Perlin noise in roughly [-1, 1]. */
  perlin3(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const p = this.perm;
    const A = p[X]! + Y;
    const AA = p[A]! + Z;
    const AB = p[A + 1]! + Z;
    const B = p[X + 1]! + Y;
    const BA = p[B]! + Z;
    const BB = p[B + 1]! + Z;

    const x1 = lerp(this.grad3(p[AA]!, xf, yf, zf), this.grad3(p[BA]!, xf - 1, yf, zf), u);
    const x2 = lerp(this.grad3(p[AB]!, xf, yf - 1, zf), this.grad3(p[BB]!, xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);

    const x3 = lerp(
      this.grad3(p[AA + 1]!, xf, yf, zf - 1),
      this.grad3(p[BA + 1]!, xf - 1, yf, zf - 1),
      u,
    );
    const x4 = lerp(
      this.grad3(p[AB + 1]!, xf, yf - 1, zf - 1),
      this.grad3(p[BB + 1]!, xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w);
  }

  private grad2(hash: number, x: number, y: number): number {
    const g = GRAD3[this.permMod12[hash & 511]!]!;
    return g[0] * x + g[1] * y;
  }

  private grad3(hash: number, x: number, y: number, z: number): number {
    const g = GRAD3[this.permMod12[hash & 511]!]!;
    return g[0] * x + g[1] * y + g[2] * z;
  }

  /**
   * Fractal Brownian motion in 2D. Returns approximately [-1, 1] (normalised by
   * total amplitude). `frequency` is the base sampling scale.
   */
  fbm2(
    x: number,
    y: number,
    octaves: number,
    frequency: number,
    lacunarity = 2,
    gain = 0.5,
  ): number {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm === 0 ? 0 : sum / norm;
  }

  /** Fractal Brownian motion in 3D, normalised to roughly [-1, 1]. */
  fbm3(
    x: number,
    y: number,
    z: number,
    octaves: number,
    frequency: number,
    lacunarity = 2,
    gain = 0.5,
  ): number {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.perlin3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm === 0 ? 0 : sum / norm;
  }

  /** Ridged 2D noise (1 − |fbm|), good for mountain ridges. Range ~[0, 1]. */
  ridged2(x: number, y: number, octaves: number, frequency: number): number {
    let amp = 1;
    let freq = frequency;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.perlin2(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm === 0 ? 0 : sum / norm;
  }
}
