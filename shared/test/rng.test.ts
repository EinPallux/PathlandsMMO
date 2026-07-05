import { describe, it, expect } from 'vitest';
import { Rng, makeRng, deriveSeed, hash2, hash3, hashFloat2, mix32 } from '../src/core/rng.js';
import { WORLD_SEED } from '../src/core/constants.js';

describe('Rng determinism', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toEqual(b.next());
  });

  it('emits floats within [0, 1)', () => {
    const r = new Rng(WORLD_SEED);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays within inclusive bounds', () => {
    const r = new Rng(7);
    for (let i = 0; i < 5000; i++) {
      const v = r.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('is a golden sequence (guards against accidental algorithm changes)', () => {
    const r = new Rng(WORLD_SEED);
    const first = [r.next(), r.next(), r.next()].map((v) => Math.floor(v * 1e6));
    // Regenerate this array intentionally if the RNG algorithm is deliberately changed.
    expect(first).toEqual([7430, 256333, 130324]);
  });

  it('save/restore of state resumes the identical stream', () => {
    const r = new Rng(999);
    for (let i = 0; i < 10; i++) r.next();
    const snap = r.getState();
    const expected = [r.next(), r.next(), r.next()];

    const restored = new Rng(0);
    restored.setState(snap);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });

  it('fork() yields independent, deterministic sub-streams', () => {
    const parent = new Rng(WORLD_SEED);
    const loot1 = parent.fork('loot').next();
    const loot2 = new Rng(WORLD_SEED).fork('loot').next();
    const ai = new Rng(WORLD_SEED).fork('ai').next();
    expect(loot1).toEqual(loot2);
    expect(loot1).not.toEqual(ai);
  });

  it('weightedIndex respects zero weights and bounds', () => {
    const r = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const idx = r.weightedIndex([0, 5, 0, 2]);
      expect([1, 3]).toContain(idx);
    }
  });
});

describe('spatial hashing', () => {
  it('hash2/hash3 are stable and order-sensitive', () => {
    expect(hash2(10, 20, WORLD_SEED)).toEqual(hash2(10, 20, WORLD_SEED));
    expect(hash2(10, 20, WORLD_SEED)).not.toEqual(hash2(20, 10, WORLD_SEED));
    expect(hash3(1, 2, 3, 5)).toEqual(hash3(1, 2, 3, 5));
    expect(hash3(1, 2, 3, 5)).not.toEqual(hash3(1, 2, 4, 5));
  });

  it('hashFloat2 lands within [0, 1)', () => {
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        const v = hashFloat2(x, y, WORLD_SEED);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('deriveSeed is deterministic and key-sensitive', () => {
    expect(deriveSeed(WORLD_SEED, 'biome')).toEqual(deriveSeed(WORLD_SEED, 'biome'));
    expect(deriveSeed(WORLD_SEED, 'biome')).not.toEqual(deriveSeed(WORLD_SEED, 'caves'));
  });

  it('mix32 returns an unsigned 32-bit integer', () => {
    const v = mix32(-1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
  });

  it('makeRng composes stream keys deterministically', () => {
    expect(makeRng(WORLD_SEED, 'a', 'b').next()).toEqual(makeRng(WORLD_SEED, 'a', 'b').next());
    expect(makeRng(WORLD_SEED, 'a', 'b').next()).not.toEqual(makeRng(WORLD_SEED, 'b', 'a').next());
  });
});
