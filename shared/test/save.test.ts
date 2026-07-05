import { describe, it, expect } from 'vitest';
import {
  createNewSave,
  migrate,
  normalizeSave,
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
      version: 11,
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
        },
      ],
      settings: {
        viewDistance: 10,
        masterVolume: 0.5,
        keybinds: { ...DEFAULT_KEYBINDS, toggleMap: 'KeyN' },
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
