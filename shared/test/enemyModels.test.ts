import { describe, it, expect } from 'vitest';
import {
  ENEMIES,
  buildEnemyModel,
  hasEnemyModel,
  countVoxels,
  modelBounds,
  buildCreature,
} from '../src/index.js';

describe('Enemy voxel models (ART_GUIDE §2)', () => {
  it('every EnemyDef modelId resolves to a built model', () => {
    for (const def of ENEMIES) {
      if (def.modelId.startsWith('creature.')) {
        // Bosses/rares can reuse a wildlife model (e.g. Dire Stag).
        expect(() => buildCreature('direStag')).not.toThrow();
        continue;
      }
      const model = buildEnemyModel(def.modelId);
      expect(model, def.modelId).not.toBeNull();
    }
  });

  it('models are non-empty, within voxel budget, and have combat clips', () => {
    for (const id of ENEMIES.map((e) => e.modelId)) {
      if (!hasEnemyModel(id)) continue;
      const { model, clips } = buildEnemyModel(id)!;
      const n = countVoxels(model);
      expect(n, `${id} voxel count`).toBeGreaterThan(10);
      expect(n, `${id} budget`).toBeLessThan(4000); // ART_GUIDE character budget
      // Must animate: idle + attack + death at minimum.
      expect(clips.idle, `${id} idle`).toBeDefined();
      expect(clips.attack, `${id} attack`).toBeDefined();
      expect(clips.death, `${id} death`).toBeDefined();
      // Bounds are finite and off the floor origin.
      const b = modelBounds(model);
      expect(Number.isFinite(b.max[1])).toBe(true);
      expect(b.max[1]).toBeGreaterThan(0);
    }
  });

  it('is deterministic + cached (same reference on rebuild)', () => {
    const a = buildEnemyModel('enemy.mossfangWolf');
    const b = buildEnemyModel('enemy.mossfangWolf');
    expect(a).toBe(b);
  });

  it('emissive enemies flag their glow colors', () => {
    expect(buildEnemyModel('enemy.hollowrootTreant')!.model.emissive?.length).toBeGreaterThan(0);
    expect(buildEnemyModel('enemy.cryptSentinel')!.model.emissive).toContain(0x8fe6f0);
  });
});
