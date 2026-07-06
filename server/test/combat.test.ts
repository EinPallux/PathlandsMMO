// Server-authoritative player combat (Phase 6 Stage 2a). The server now hosts players as
// combat entities: their casts resolve server-side and enemies aggro + attack them. Proven
// at two levels — the ServerCombat sim directly (exact positions), and over the wire (a
// combat intent reaches the sim; the player's own combat state is replicated back).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, WORLD_SPAWNS } from '@pathlands/shared';
import { createServerWorld } from '../src/world.js';
import { ServerCombat } from '../src/combat.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { TestClient, gatewayOptions, until } from './support.js';

const VALE_BOARS = WORLD_SPAWNS.find((r) => r.id === 'valeBoars')!;

/** Step until a boar exists, then return one. */
function spawnBoar(combat: ServerCombat): { id: string; x: number; y: number; z: number } {
  for (let i = 0; i < 5; i++) combat.step();
  const boar = combat.netEntities().find((e) => e.id.startsWith('valeBoars#'))!;
  return { id: boar.id, x: boar.x, y: boar.y, z: boar.z };
}

describe('server-authoritative player combat — ServerCombat', () => {
  it('applies a player’s instant cast to the targeted enemy', () => {
    const combat = new ServerCombat(createServerWorld());
    const boar = spawnBoar(combat);
    // A mage standing on the boar casts Fire Blast (instant, 12 mana) at it.
    combat.addPlayer('P', 'Mage', 'mage', 6, boar.x, boar.y, boar.z);
    const maxHP = combat.state.entities.get(boar.id)!.maxHP;
    combat.applyPlayerIntent('P', { type: 'SetTarget', targetId: boar.id });
    combat.applyPlayerIntent('P', { type: 'CastSkill', skillId: 'fireBlast', targetId: boar.id });
    combat.step();

    const after = combat.state.entities.get(boar.id)!;
    expect(after.hp).toBeLessThan(maxHP); // server applied the damage
    // The player spent mana on the cast (server-validated resource cost).
    expect(combat.combatSelf('P')!.resource).toBeLessThan(combat.combatSelf('P')!.maxResource);
  });

  it('lets an enemy aggro and damage a player standing in its range', () => {
    const combat = new ServerCombat(createServerWorld());
    const boar = spawnBoar(combat);
    // A warrior stands right on the boar — inside its aggro + melee range.
    combat.addPlayer('P', 'Boro', 'warrior', 6, boar.x, boar.y, boar.z);
    const fullHP = combat.combatSelf('P')!.maxHP;
    // Keep the player pinned on the boar each tick (no movement sim here) and advance a few
    // seconds so the boar aggros and lands at least one ~2 s auto-attack swing.
    for (let i = 0; i < 80; i++) {
      combat.syncPlayer('P', boar.x, boar.y, boar.z, 0);
      combat.step();
    }
    const self = combat.combatSelf('P')!;
    expect(self.hp).toBeLessThan(fullHP); // the boar hit the player
    expect(self.inCombat).toBe(true);
  });

  it('revives a dead player who releases their spirit', () => {
    const combat = new ServerCombat(createServerWorld());
    const boar = spawnBoar(combat);
    combat.addPlayer('P', 'Boro', 'warrior', 6, boar.x, boar.y, boar.z);
    // Force death, then release.
    const p = combat.state.entities.get('P')!;
    p.hp = 0;
    p.dead = true;
    combat.applyPlayerIntent('P', { type: 'ReleaseSpirit' });
    combat.step();
    const self = combat.combatSelf('P')!;
    expect(self.dead).toBe(false);
    expect(self.hp).toBe(self.maxHP);
  });
});

describe('server-authoritative player combat — over the wire', () => {
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

  async function tokenAt(email: string, x: number, z: number): Promise<string> {
    const res = await fetch(base + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'longenough' }),
    });
    const token = ((await res.json()) as { token: string }).token;
    const acct = (await store.getByEmail(email))!;
    const y = createServerWorld().surfaceSpawnY(x, z);
    await store.putCharacter(
      acct.id,
      createCharacter('c1', 'Mage', 'mage', { skin: 0, hair: 0 }, x, y, z),
    );
    return token;
  }

  it('replicates the player’s own combat state and applies a targeting intent', async () => {
    const c = new TestClient(wsUrl);
    await c.opened();
    const token = await tokenAt('mage@example.com', VALE_BOARS.cx, VALE_BOARS.cz);
    c.hello('Mage', 'mage', 6, token);
    await until(() => c.you !== null, 3000, 'welcomed');

    // The combat-self channel delivers the player's authoritative combat state.
    await until(() => c.lastCombatSelf !== null, 3000, 'combat-self arrives');
    const cs = c.lastCombatSelf!;
    expect(cs.maxHP).toBeGreaterThan(0);
    // The server builds the combat entity from the PERSISTED character (level 1), never the
    // hello's claimed level 6 — authority over identity is the server's.
    expect(cs.level).toBe(1);
    expect(cs.resourceKind).toBe('mana');
    expect(cs.dead).toBe(false);

    // A SetTarget intent sent over the wire reaches the server combat sim and comes back.
    await until(
      () => [...c.enemies.values()].some((e) => e.enemyId === 'thornbackBoar'),
      3000,
      'sees boars',
    );
    const boar = [...c.enemies.values()].find((e) => e.enemyId === 'thornbackBoar')!;
    c.setTarget(boar.id);
    await until(() => c.lastCombatSelf?.targetId === boar.id, 3000, 'target replicated');
    expect(c.lastCombatSelf!.targetId).toBe(boar.id);

    c.close();
  });
});
