import { describe, it, expect } from 'vitest';
import {
  createNewSave,
  migrate,
  normalizeSave,
  SAVE_VERSION,
  type SaveGame,
} from '../src/proto/save.js';
import { WORLD_SEED } from '../src/core/constants.js';

describe('save schema', () => {
  it('creates a valid empty save at the current version', () => {
    const save = createNewSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.worldSeed).toBe(WORLD_SEED);
    expect(save.characters).toEqual([]);
  });

  it('round-trips a populated save losslessly', () => {
    const save: SaveGame = {
      version: 1,
      worldSeed: WORLD_SEED,
      characters: [
        {
          id: 'c1',
          name: 'Bramble',
          class: 'ranger',
          appearance: { skin: 2, hair: 5 },
          x: 1536.5,
          y: 60,
          z: 1536.5,
          yaw: 1.23,
        },
      ],
      settings: { viewDistance: 10, masterVolume: 0.5 },
      updatedAtTick: 999,
    };
    expect(normalizeSave(save)).toEqual(save);
  });

  it('fills defaults for a partial/legacy save', () => {
    const legacy = { characters: [{ name: 'Old', class: 'mage' }] };
    const migrated = migrate(legacy);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.worldSeed).toBe(WORLD_SEED);
    expect(migrated.settings.viewDistance).toBeGreaterThan(0);
    expect(migrated.characters[0]!.name).toBe('Old');
    expect(migrated.characters[0]!.appearance).toEqual({ skin: 0, hair: 0 });
  });

  it('drops malformed character entries instead of crashing', () => {
    const junk = { characters: [null, 42, { name: 'Keeper', class: 'priest' }] };
    const migrated = migrate(junk);
    expect(migrated.characters).toHaveLength(1);
    expect(migrated.characters[0]!.name).toBe('Keeper');
  });

  it('throws only on completely unrecoverable input', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('not a save')).toThrow();
  });
});
