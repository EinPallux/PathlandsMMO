import { describe, it, expect } from 'vitest';
import {
  MOUNTS,
  BASE_MOUNT,
  MOUNT_MIN_LEVEL,
  mountById,
  mountForDeed,
  buildMountModel,
  hasMountModel,
  MOUNT_MODEL_IDS,
  countVoxels,
  modelBounds,
  deedById,
} from '../src/index.js';

describe('Mount data (GDD §7)', () => {
  it('the base mount is the level-gated, gold-purchasable Wolf', () => {
    expect(BASE_MOUNT.id).toBe('wolf');
    expect(BASE_MOUNT.source.kind).toBe('purchase');
    if (BASE_MOUNT.source.kind === 'purchase') {
      expect(BASE_MOUNT.source.reqLevel).toBe(MOUNT_MIN_LEVEL);
      expect(BASE_MOUNT.source.cost).toBeGreaterThan(0);
    }
  });

  it('every mount has a positive speed bonus and a resolvable model', () => {
    for (const m of MOUNTS) {
      expect(m.speedBonus).toBeGreaterThan(0);
      expect(mountById(m.id)).toBe(m);
      expect(hasMountModel(m.modelId)).toBe(true);
    }
  });

  it('skins are unlocked by real Deeds', () => {
    const skins = MOUNTS.filter((m) => m.source.kind === 'deed');
    expect(skins.length).toBeGreaterThan(0);
    for (const s of skins) {
      if (s.source.kind !== 'deed') continue;
      expect(deedById(s.source.deedId), s.id).toBeDefined();
      expect(mountForDeed(s.source.deedId)).toBe(s);
    }
  });

  it('has no skin mapped to an unrelated Deed', () => {
    expect(mountForDeed('d_first_blood')).toBeUndefined();
  });
});

describe('Mount voxel models (ART_GUIDE §2)', () => {
  it('every mount modelId builds a non-empty, in-budget model with gait clips', () => {
    for (const id of MOUNT_MODEL_IDS) {
      const built = buildMountModel(id);
      expect(built, id).not.toBeNull();
      const { model, clips } = built!;
      const n = countVoxels(model);
      expect(n, `${id} voxels`).toBeGreaterThan(40);
      expect(n, `${id} budget`).toBeLessThan(4000);
      expect(clips.idle, `${id} idle`).toBeDefined();
      expect(clips.walk, `${id} walk`).toBeDefined();
      expect(clips.run, `${id} run`).toBeDefined();
      const b = modelBounds(model);
      expect(b.max[1]).toBeGreaterThan(0);
    }
  });

  it('returns null for an unknown model id', () => {
    expect(buildMountModel('mount.nope')).toBeNull();
  });
});
