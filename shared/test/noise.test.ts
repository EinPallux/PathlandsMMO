import { describe, it, expect } from 'vitest';
import { Noise } from '../src/core/noise.js';
import { WORLD_SEED } from '../src/core/constants.js';

describe('Noise determinism', () => {
  it('perlin2 is identical for the same seed and coordinates', () => {
    const a = new Noise(WORLD_SEED);
    const b = new Noise(WORLD_SEED);
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37;
      const y = i * 0.91;
      expect(a.perlin2(x, y)).toEqual(b.perlin2(x, y));
    }
  });

  it('perlin3 is identical for the same seed and coordinates', () => {
    const a = new Noise(42);
    const b = new Noise(42);
    expect(a.perlin3(1.5, 2.5, 3.5)).toEqual(b.perlin3(1.5, 2.5, 3.5));
  });

  it('different seeds produce different fields', () => {
    const a = new Noise(1);
    const b = new Noise(2);
    let differing = 0;
    for (let i = 0; i < 50; i++) {
      if (a.perlin2(i * 0.3, i * 0.7) !== b.perlin2(i * 0.3, i * 0.7)) differing++;
    }
    expect(differing).toBeGreaterThan(40);
  });

  it('perlin2 stays within a sane bound', () => {
    const n = new Noise(WORLD_SEED);
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        const v = n.perlin2(x * 0.13, y * 0.13);
        expect(v).toBeGreaterThanOrEqual(-1.001);
        expect(v).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('fbm2 stays normalised within [-1, 1]', () => {
    const n = new Noise(WORLD_SEED);
    for (let i = 0; i < 500; i++) {
      const v = n.fbm2(i * 0.05, i * 0.09, 5, 0.01);
      expect(v).toBeGreaterThanOrEqual(-1.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it('ridged2 stays within [0, 1]', () => {
    const n = new Noise(WORLD_SEED);
    for (let i = 0; i < 500; i++) {
      const v = n.ridged2(i * 0.05, i * 0.02, 4, 0.01);
      expect(v).toBeGreaterThanOrEqual(-0.001);
      expect(v).toBeLessThanOrEqual(1.001);
    }
  });

  it('integer lattice points are near zero (Perlin property)', () => {
    const n = new Noise(WORLD_SEED);
    expect(Math.abs(n.perlin2(5, 9))).toBeLessThan(1e-9);
    expect(Math.abs(n.perlin3(3, 4, 5))).toBeLessThan(1e-9);
  });
});
