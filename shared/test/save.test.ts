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
      version: 2,
      worldSeed: WORLD_SEED,
      account: { pathPoints: 3 },
      characters: [
        {
          id: 'c1',
          name: 'Bramble',
          class: 'ranger',
          appearance: { skin: 2, hair: 5 },
          level: 14,
          xp: 12345,
          gold: 420,
          x: 1536.5,
          y: 60,
          z: 1536.5,
          yaw: 1.23,
          inventory: [],
          equipment: {},
          discoveredWaystones: ['brookhollow', 'waymeet'],
        },
      ],
      settings: { viewDistance: 10, masterVolume: 0.5 },
      updatedAtTick: 999,
    };
    expect(normalizeSave(save)).toEqual(save);
  });

  it('migrates a v1 (pre-combat) save, defaulting the new fields', () => {
    const v1 = {
      version: 1,
      characters: [{ name: 'Old', class: 'mage', x: 10, y: 20, z: 30 }],
    };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.worldSeed).toBe(WORLD_SEED);
    expect(migrated.account.pathPoints).toBe(0);
    const c = migrated.characters[0]!;
    expect(c.name).toBe('Old');
    expect(c.appearance).toEqual({ skin: 0, hair: 0 });
    expect(c.level).toBe(1);
    expect(c.xp).toBe(0);
    expect(c.gold).toBe(0);
    expect(c.inventory).toEqual([]);
    expect(c.equipment).toEqual({});
    expect(c.discoveredWaystones).toEqual([]);
    // Position is preserved through the migration.
    expect(c.x).toBe(10);
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
