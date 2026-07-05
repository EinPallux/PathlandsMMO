import { describe, it, expect } from 'vitest';
import {
  buildCharacterModel,
  CHARACTER_CLASSES,
  CharacterClass,
  countVoxels,
  modelBounds,
  HUMANOID_CLIPS,
  type ClipName,
} from '../src/models/index.js';

const REQUIRED_PARTS = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
const REQUIRED_CLIPS: ClipName[] = [
  'idle',
  'walk',
  'run',
  'jump',
  'swim',
  'attack',
  'cast',
  'hit',
  'death',
];

describe('character models', () => {
  it('builds all four classes with the shared rig parts', () => {
    for (const cls of CHARACTER_CLASSES) {
      const { model } = buildCharacterModel(cls);
      const names = model.parts.map((p) => p.name);
      for (const required of REQUIRED_PARTS) {
        expect(names).toContain(required);
      }
    }
  });

  it('provides the full standard clip set', () => {
    for (const clip of REQUIRED_CLIPS) {
      expect(HUMANOID_CLIPS[clip]).toBeDefined();
      expect(HUMANOID_CLIPS[clip]!.name).toBe(clip);
    }
  });

  it('keeps voxel counts within the ART_GUIDE budget (≤ ~4k)', () => {
    for (const cls of CHARACTER_CLASSES) {
      const { model } = buildCharacterModel(cls);
      const n = countVoxels(model);
      expect(n).toBeGreaterThan(200); // not an empty shell
      expect(n).toBeLessThanOrEqual(4000);
    }
  });

  it('produces a roughly human-proportioned silhouette (~1.5–2.2 m tall)', () => {
    for (const cls of CHARACTER_CLASSES) {
      const { model } = buildCharacterModel(cls);
      const b = modelBounds(model);
      const heightVox = b.max[1] - b.min[1] + 1;
      const heightM = heightVox * model.scale;
      expect(heightM).toBeGreaterThan(1.4);
      expect(heightM).toBeLessThan(2.4);
    }
  });

  it('gives casters emissive gems and melee classes none', () => {
    expect(buildCharacterModel(CharacterClass.Mage).model.emissive?.length).toBeGreaterThan(0);
    expect(buildCharacterModel(CharacterClass.Priest).model.emissive?.length).toBeGreaterThan(0);
    expect(buildCharacterModel(CharacterClass.Warrior).model.emissive ?? []).toHaveLength(0);
  });

  it('is deterministic (same appearance → identical geometry)', () => {
    const a = buildCharacterModel(CharacterClass.Ranger);
    const b = buildCharacterModel(CharacterClass.Ranger);
    expect(countVoxels(a.model)).toEqual(countVoxels(b.model));
    expect(a.model.parts.map((p) => p.voxels.length)).toEqual(
      b.model.parts.map((p) => p.voxels.length),
    );
  });
});
