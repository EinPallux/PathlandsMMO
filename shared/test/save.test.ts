import { describe, it, expect } from 'vitest';
import {
  createNewSave,
  migrate,
  normalizeSave,
  tryMigrate,
  validateSave,
  DEFAULT_SETTINGS,
  SAVE_VERSION,
  type SaveGame,
} from '../src/proto/save.js';
import { WORLD_SEED } from '../src/core/constants.js';
import { DEFAULT_KEYBINDS } from '../src/data/keybinds.js';

describe('save schema', () => {
  it('creates a valid empty save at the current version', () => {
    const save = createNewSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.worldSeed).toBe(WORLD_SEED);
    expect(save.characters).toEqual([]);
  });

  it('round-trips a populated save losslessly', () => {
    const save: SaveGame = {
      version: 13,
      worldSeed: WORLD_SEED,
      account: { pathPoints: 3, perks: { deepPockets: 2 } },
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
          quests: {
            active: [{ id: 'q_boar_trouble', counts: [3], pinned: true }],
            turnedIn: ['q_find_feet'],
          },
          professions: {
            mining: 12,
            herbalism: 8,
            fishing: 3,
            blacksmithing: 1,
            alchemy: 1,
          },
          materials: { copperOre: 14, meadowbloom: 5 },
          consumables: { lesserHealthPotion: 3 },
          deeds: { progress: { d_first_blood: 4 }, completed: ['d_wayfarer'] },
          mounts: ['wolf', 'frostWolf'],
          activeMount: 'frostWolf',
          bank: [{ item: { id: 'stored', name: 'Stored Blade' } as never, qty: 1 }],
          mail: [
            {
              id: 'mail_welcome',
              sender: 'Elder Rowan of Brookhollow',
              subject: 'The Road Awaits',
              body: 'Take this purse.',
              gold: 25,
              claimed: false,
            },
          ],
          bounties: {
            day: 20275,
            active: [{ id: 'bh_boars', count: 3 }],
            completed: ['bh_bloom'],
          },
          learnedRecipes: ['r_crystaliumBlade'],
        },
      ],
      settings: {
        viewDistance: 10,
        masterVolume: 0.5,
        keybinds: { ...DEFAULT_KEYBINDS, toggleMap: 'KeyN' },
        shadows: 'high',
        vfxDensity: 'low',
        resolutionScale: 0.75,
      },
      updatedAtTick: 999,
    };
    expect(normalizeSave(save)).toEqual(save);
  });

  it('migrates a pre-keybind save, defaulting the keybind map (merging any saved binds)', () => {
    const old = {
      version: 10,
      account: { pathPoints: 0, perks: {} },
      characters: [],
      settings: { viewDistance: 6, masterVolume: 0.4, keybinds: { toggleMap: 'KeyN' } },
    };
    const s = migrate(old).settings;
    expect(s.viewDistance).toBe(6);
    expect(s.keybinds.toggleMap).toBe('KeyN'); // saved override kept
    expect(s.keybinds.toggleBank).toBe(DEFAULT_KEYBINDS.toggleBank); // rest defaulted
  });

  it('migrates a pre-v12 save, defaulting an empty learned-recipes list (keeping any saved)', () => {
    const v11 = {
      version: 11,
      account: { pathPoints: 0, perks: {} },
      characters: [
        { name: 'Fresh', class: 'warrior' },
        { name: 'Learned', class: 'mage', learnedRecipes: ['r_elixirOfMastery'] },
      ],
    };
    const chars = migrate(v11).characters;
    expect(chars[0]!.learnedRecipes).toEqual([]); // defaulted
    expect(chars[1]!.learnedRecipes).toEqual(['r_elixirOfMastery']); // preserved
  });

  it('migrates a v8 (pre-bounty) save, defaulting an empty bounty log', () => {
    const v8 = {
      version: 8,
      account: { pathPoints: 0 },
      characters: [{ name: 'Idle', class: 'priest', bank: [], mail: [] }],
    };
    const c = migrate(v8).characters[0]!;
    expect(c.bounties).toEqual({ day: 0, active: [], completed: [] });
  });

  it('migrates a v7 (pre-bank/mail) save, defaulting a vault + starter inbox', () => {
    const v7 = {
      version: 7,
      account: { pathPoints: 0 },
      characters: [{ name: 'Vaultless', class: 'mage', mounts: ['wolf'], activeMount: 'wolf' }],
    };
    const c = migrate(v7).characters[0]!;
    expect(c.bank).toEqual([]);
    // Pre-mail saves receive the starter inbox on upgrade.
    expect(c.mail.length).toBeGreaterThan(0);
    expect(c.mail.every((m) => m.claimed === false)).toBe(true);
    expect(c.mail.some((m) => m.id === 'mail_welcome')).toBe(true);
  });

  it('migrates a v6 (pre-mount) save, defaulting no mounts', () => {
    const v6 = {
      version: 6,
      account: { pathPoints: 2 },
      characters: [
        {
          name: 'Footsore',
          class: 'warrior',
          deeds: { progress: {}, completed: [] },
          pathPoints: 0,
          perks: {},
        },
      ],
    };
    const c = migrate(v6).characters[0]!;
    expect(c.mounts).toEqual([]);
    expect(c.activeMount).toBeNull();
  });

  it('migrates a v5 (pre-deeds) save, defaulting deed state; keeps account Path Points', () => {
    const v5 = {
      version: 5,
      account: { pathPoints: 4 },
      characters: [{ name: 'Deedless', class: 'priest', consumables: { healthPotion: 1 } }],
    };
    const migrated = migrate(v5);
    expect(migrated.characters[0]!.deeds).toEqual({ progress: {}, completed: [] });
    // Path Points now live on the account (v10); the existing account pool survives.
    expect(migrated.account.pathPoints).toBe(4);
    expect(migrated.account.perks).toEqual({});
  });

  it('migrates a v9 save by folding per-character Path Points + perks into the account', () => {
    const v9 = {
      version: 9,
      account: { pathPoints: 0 },
      characters: [
        { name: 'A', class: 'warrior', pathPoints: 2, perks: { deepPockets: 3, waywise: 1 } },
        { name: 'B', class: 'mage', pathPoints: 5, perks: { deepPockets: 1, trailblazer: 1 } },
      ],
    };
    const migrated = migrate(v9);
    // Highest Path-Point pool + the union (max rank) of perks become account-wide.
    expect(migrated.account.pathPoints).toBe(5);
    expect(migrated.account.perks).toEqual({ deepPockets: 3, waywise: 1, trailblazer: 1 });
    // Characters no longer carry per-character meta.
    expect('pathPoints' in migrated.characters[0]!).toBe(false);
    expect('perks' in migrated.characters[1]!).toBe(false);
  });

  it('migrates a v4 (pre-crafting) save, defaulting an empty consumables stash', () => {
    const v4 = {
      version: 4,
      characters: [
        {
          name: 'Crafterless',
          class: 'mage',
          professions: { mining: 5 },
          materials: { copperOre: 2 },
        },
      ],
    };
    const c = migrate(v4).characters[0]!;
    expect(c.consumables).toEqual({});
    expect(c.materials).toEqual({ copperOre: 2 });
    expect(c.professions.mining).toBe(5);
  });

  it('migrates a v3 (pre-profession) save, defaulting skills + empty materials', () => {
    const v3 = {
      version: 3,
      characters: [{ name: 'Gatherless', class: 'ranger', quests: { active: [], turnedIn: [] } }],
    };
    const c = migrate(v3).characters[0]!;
    expect(c.professions).toEqual({
      mining: 1,
      herbalism: 1,
      fishing: 1,
      blacksmithing: 1,
      alchemy: 1,
    });
    expect(c.materials).toEqual({});
  });

  it('migrates a v2 (pre-quest) save, defaulting an empty quest log', () => {
    const v2 = {
      version: 2,
      worldSeed: WORLD_SEED,
      account: { pathPoints: 1 },
      characters: [
        {
          id: 'c1',
          name: 'Pre',
          class: 'warrior',
          appearance: { skin: 1, hair: 1 },
          level: 8,
          xp: 5000,
          gold: 50,
          x: 1,
          y: 2,
          z: 3,
          yaw: 0,
          inventory: [],
          equipment: {},
          discoveredWaystones: ['brookhollow'],
        },
      ],
      settings: { viewDistance: 8, masterVolume: 0.8 },
      updatedAtTick: 10,
    };
    const migrated = migrate(v2);
    expect(migrated.version).toBe(SAVE_VERSION);
    const c = migrated.characters[0]!;
    expect(c.quests).toEqual({ active: [], turnedIn: [] });
    expect(c.discoveredWaystones).toEqual(['brookhollow']);
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

describe('save graphics settings (v13)', () => {
  it('a fresh save carries the default graphics settings', () => {
    const s = createNewSave().settings;
    expect(s.shadows).toBe(DEFAULT_SETTINGS.shadows);
    expect(s.vfxDensity).toBe(DEFAULT_SETTINGS.vfxDensity);
    expect(s.resolutionScale).toBe(DEFAULT_SETTINGS.resolutionScale);
  });

  it('migrates a pre-graphics (v12) save, defaulting the graphics options', () => {
    const v12 = {
      version: 12,
      account: { pathPoints: 0, perks: {} },
      characters: [],
      settings: { viewDistance: 9, masterVolume: 0.6, keybinds: {} },
    };
    const s = migrate(v12).settings;
    expect(s.viewDistance).toBe(9); // existing setting preserved
    expect(s.shadows).toBe(DEFAULT_SETTINGS.shadows);
    expect(s.vfxDensity).toBe(DEFAULT_SETTINGS.vfxDensity);
    expect(s.resolutionScale).toBe(DEFAULT_SETTINGS.resolutionScale);
  });

  it('keeps valid graphics settings and rejects out-of-range / bogus values', () => {
    const good = migrate({
      version: 13,
      settings: { shadows: 'high', vfxDensity: 'off', resolutionScale: 0.75 },
    }).settings;
    expect(good.shadows).toBe('high');
    expect(good.vfxDensity).toBe('off');
    expect(good.resolutionScale).toBe(0.75);

    const bad = migrate({
      version: 13,
      settings: { shadows: 'ultra', vfxDensity: 7, resolutionScale: 4 },
    }).settings;
    expect(bad.shadows).toBe(DEFAULT_SETTINGS.shadows); // unknown enum → default
    expect(bad.vfxDensity).toBe(DEFAULT_SETTINGS.vfxDensity); // wrong type → default
    expect(bad.resolutionScale).toBe(1); // clamped to the [0.5, 1] range
  });

  it('clamps an absurd view distance into the supported range', () => {
    expect(migrate({ settings: { viewDistance: 999 } }).settings.viewDistance).toBe(16);
    expect(migrate({ settings: { viewDistance: 1 } }).settings.viewDistance).toBe(4);
  });
});

describe('save corruption recovery (validateSave / tryMigrate)', () => {
  it('validateSave accepts a freshly migrated save', () => {
    expect(validateSave(createNewSave())).toBe(true);
    expect(validateSave(migrate({ version: 1, characters: [] }))).toBe(true);
  });

  it('validateSave rejects wrong-version, missing-field, and non-save shapes', () => {
    const ok = createNewSave() as unknown as Record<string, unknown>;
    expect(validateSave({ ...ok, version: 12 })).toBe(false); // stale version
    expect(validateSave({ ...ok, worldSeed: 'nope' })).toBe(false);
    expect(validateSave({ ...ok, characters: 'not-array' })).toBe(false);
    expect(validateSave({ ...ok, settings: { viewDistance: 8 } })).toBe(false); // no keybinds
    expect(validateSave(null)).toBe(false);
    expect(validateSave('a string')).toBe(false);
    expect(validateSave(42)).toBe(false);
  });

  it('tryMigrate recovers an old save and returns a valid current one', () => {
    const recovered = tryMigrate({ version: 7, characters: [{ name: 'Old', class: 'ranger' }] });
    expect(recovered).not.toBeNull();
    expect(recovered!.version).toBe(SAVE_VERSION);
    expect(validateSave(recovered)).toBe(true);
    expect(recovered!.characters[0]!.name).toBe('Old');
  });

  it('tryMigrate returns null (never throws) on unrecoverable garbage', () => {
    expect(tryMigrate(null)).toBeNull();
    expect(tryMigrate('corrupt')).toBeNull();
    expect(tryMigrate(undefined)).toBeNull();
    expect(tryMigrate(12345)).toBeNull();
    // A truncated JSON object that isn't a save still yields a *valid* empty save
    // (migrate fills every default), so tryMigrate returns a usable save, not null.
    expect(tryMigrate({ foo: 'bar' })).not.toBeNull();
  });
});
