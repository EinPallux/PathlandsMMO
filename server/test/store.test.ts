// Persistence: the in-memory store enforces account uniqueness and round-trips
// characters; the file store additionally survives a reopen (durability).

import { afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { createCharacter, type CharacterSave } from '@pathlands/shared';
import { FileStore, MemoryStore } from '../src/store.js';

function sampleCharacter(name = 'Alia'): CharacterSave {
  return createCharacter('c1', name, 'ranger', { skin: 0, hair: 0 }, 100, 64, 200);
}

describe('MemoryStore', () => {
  it('creates accounts, rejects duplicate emails (case/space-insensitive)', async () => {
    const store = new MemoryStore();
    const a = await store.createAccount('  Alia@Example.com ', 'hash');
    expect(a).not.toBeNull();
    expect(a!.email).toBe('alia@example.com'); // normalised
    expect(await store.createAccount('alia@example.com', 'hash2')).toBeNull(); // taken
    expect((await store.getByEmail('ALIA@EXAMPLE.COM'))?.id).toBe(a!.id);
    expect((await store.getById(a!.id))?.email).toBe('alia@example.com');
  });

  it('round-trips a character blob', async () => {
    const store = new MemoryStore();
    const acct = (await store.createAccount('e@e.com', 'h'))!;
    expect(await store.getCharacter(acct.id)).toBeNull();
    await store.putCharacter(acct.id, sampleCharacter('Boro'));
    expect((await store.getCharacter(acct.id))?.name).toBe('Boro');
  });
});

describe('FileStore', () => {
  const path = `${import.meta.dirname}/.tmp-store-${process.pid}.json`;
  afterEach(async () => {
    await rm(path, { force: true });
    await rm(`${path}.tmp`, { force: true });
  });

  it('persists accounts + characters across a reopen', async () => {
    const store = await FileStore.open(path);
    const acct = (await store.createAccount('save@me.com', 'hashed'))!;
    await store.putCharacter(acct.id, sampleCharacter('Persisted'));
    await store.close(); // flushes

    const reopened = await FileStore.open(path);
    const found = await reopened.getByEmail('save@me.com');
    expect(found?.id).toBe(acct.id);
    expect(found?.passwordHash).toBe('hashed');
    expect((await reopened.getCharacter(acct.id))?.name).toBe('Persisted');
    await reopened.close();
  });

  it('starts empty on a missing or corrupt file instead of throwing', async () => {
    const store = await FileStore.open(path); // missing file
    expect(await store.getByEmail('nobody@x.com')).toBeNull();
    await store.close();
  });
});
