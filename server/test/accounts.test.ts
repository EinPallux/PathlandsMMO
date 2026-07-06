// Accounts end to end: the REST auth surface, the character cloud save, and the ws
// session binding — a token loads the persisted character (identity + position) and the
// authoritative position is written back so it resumes on the next login.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCharacter,
  SPAWN_X,
  SPAWN_Z,
  TICK_DURATION_MS,
  totalXpToReachLevel,
  type CharacterSave,
} from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

describe('accounts + persistence', () => {
  let sim: ServerSim;
  let store: MemoryStore;
  let server: GameServer;
  let base: string;
  let wsUrl: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    store = new MemoryStore();
    server = new GameServer(sim, gatewayOptions(), { auth: new Auth('test-secret'), store });
    await server.listen();
    base = `http://127.0.0.1:${server.address()}`;
    wsUrl = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  const post = (path: string, body: unknown): Promise<Response> =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function register(email: string, password: string): Promise<string> {
    const res = await post('/auth/register', { email, password });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  it('register / login enforce uniqueness and credentials', async () => {
    const token = await register('alia@example.com', 'hunter2pass');
    expect(typeof token).toBe('string');

    // Duplicate email.
    expect(
      (await post('/auth/register', { email: 'alia@example.com', password: 'other123' })).status,
    ).toBe(409);
    // Weak password.
    expect((await post('/auth/register', { email: 'x@y.com', password: 'short' })).status).toBe(
      400,
    );
    // Wrong password.
    expect(
      (await post('/auth/login', { email: 'alia@example.com', password: 'nope' })).status,
    ).toBe(401);
    // Correct login.
    const login = await post('/auth/login', { email: 'alia@example.com', password: 'hunter2pass' });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { token: string }).token.length).toBeGreaterThan(0);
  });

  it('character cloud save requires a bearer token', async () => {
    const token = await register('boro@example.com', 'password123');
    const ch = createCharacter('c1', 'Boro', 'warrior', { skin: 0, hair: 0 }, 150, 64, 250);

    // Unauthorised reads/writes are refused.
    expect((await fetch(base + '/character')).status).toBe(401);

    const put = await fetch(base + '/character', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(ch),
    });
    expect(put.status).toBe(200);

    const got = await fetch(base + '/character', { headers: { authorization: `Bearer ${token}` } });
    expect(got.status).toBe(200);
    expect(((await got.json()) as { character: CharacterSave }).character.name).toBe('Boro');
  });

  it('a token binds the session, loads the character, and persists position across logins', async () => {
    const email = 'saver@example.com';
    const token = await register(email, 'longenough');
    const acct = (await store.getByEmail(email))!;
    // Upload a character at a known-walkable spot near the plaza (distinct from the
    // default spawn), on the resolved ground height so it isn't stuck in terrain.
    const baseX = SPAWN_X + 6;
    const baseZ = SPAWN_Z;
    const groundY = createServerWorld().surfaceSpawnY(baseX, baseZ);
    await store.putCharacter(
      acct.id,
      createCharacter('c1', 'Saved', 'mage', { skin: 0, hair: 0 }, baseX, groundY, baseZ),
    );

    // Log in over ws with the token — the guest fields are overridden by the character.
    const c1 = new TestClient(wsUrl);
    await c1.opened();
    c1.hello('GuestName', 'warrior', 1, token);
    await until(() => c1.you !== null, 3000, 'welcomed');
    const p1 = sim.players.get(c1.you as string)!;
    expect(p1.name).toBe('Saved');
    expect(p1.cls).toBe('mage');
    expect(Math.abs(p1.phys.x - baseX)).toBeLessThan(1); // loaded the saved position
    expect(Math.abs(p1.phys.z - baseZ)).toBeLessThan(1);

    // Move east, then disconnect — the server persists the authoritative position.
    for (let i = 0; i < 20; i++) {
      c1.move(1, 0);
      await sleep(TICK_DURATION_MS);
    }
    expect(sim.players.get(c1.you as string)!.phys.x).toBeGreaterThan(baseX + 0.5);
    c1.close();

    // Wait for the fire-and-forget persist to land in the store.
    let persistedX = baseX;
    for (let i = 0; i < 100; i++) {
      const ch = await store.getCharacter(acct.id);
      if (ch !== null && ch.x > baseX + 0.5) {
        persistedX = ch.x;
        break;
      }
      await sleep(20);
    }
    expect(persistedX).toBeGreaterThan(baseX + 0.5);

    // Log back in — resume at the moved position, not the original.
    const c2 = new TestClient(wsUrl);
    await c2.opened();
    c2.hello('GuestName', 'warrior', 1, token);
    await until(() => c2.you !== null, 3000, 're-welcomed');
    expect(sim.players.get(c2.you as string)!.phys.x).toBeGreaterThan(baseX + 0.5);
    c2.close();
  });

  it('never regresses stored XP: the server persists kill XP only as a monotonic high-water mark', async () => {
    // Regression guard (Stage 2c-1 review): the server only sees KILL XP, but the client
    // aggregates the complete total (kills + quest + Waystone XP) and cloud-saves it. The
    // cloud-save can land AFTER the ws hello has already seeded the server's combat entity
    // from the older stored XP — so on disconnect the server must NOT write its partial total
    // back over the client's richer one. It persists XP only when it genuinely leads.
    const email = 'xpsaver@example.com';
    const token = await register(email, 'longenough');
    const acct = (await store.getByEmail(email))!;
    const baseX = SPAWN_X + 6;
    const baseZ = SPAWN_Z;
    const groundY = createServerWorld().surfaceSpawnY(baseX, baseZ);

    // Stored character at a modest level — what the hello reads to seed the combat entity.
    const seededXp = totalXpToReachLevel(2);
    const ch0 = createCharacter('c1', 'Rich', 'mage', { skin: 0, hair: 0 }, baseX, groundY, baseZ);
    ch0.xp = seededXp;
    ch0.level = 2;
    await store.putCharacter(acct.id, ch0);

    const c1 = new TestClient(wsUrl);
    await c1.opened();
    c1.hello('GuestName', 'mage', 1, token);
    await until(() => c1.you !== null, 3000, 'welcomed'); // server seeds prog from seededXp

    // The client's cloud-save of its COMPLETE total lands now (after the hello race) — a much
    // richer XP total than the server's kill-only view.
    const richXp = totalXpToReachLevel(10);
    const chRich = await store.getCharacter(acct.id);
    chRich!.xp = richXp;
    chRich!.level = 10;
    await store.putCharacter(acct.id, chRich!);

    // Move so we can detect that the disconnect persist has landed (position always writes).
    for (let i = 0; i < 20; i++) {
      c1.move(1, 0);
      await sleep(TICK_DURATION_MS);
    }
    c1.close();

    let persisted: CharacterSave | null = null;
    for (let i = 0; i < 100; i++) {
      const ch = await store.getCharacter(acct.id);
      if (ch !== null && ch.x > baseX + 0.5) {
        persisted = ch;
        break;
      }
      await sleep(20);
    }
    expect(persisted).not.toBeNull(); // the persist landed
    expect(persisted!.xp).toBe(richXp); // …but XP was NOT regressed to the kill-only total
    expect(persisted!.level).toBe(10);
  });

  it('an invalid token is rejected (no guest fallback)', async () => {
    const c = new TestClient(wsUrl);
    await c.opened();
    c.hello('Sneaky', 'warrior', 1, 'not.a.valid.token');
    await sleep(300);
    expect(c.you).toBeNull(); // never welcomed
    expect(sim.players.size).toBe(0); // and never joined the sim
  });
});
