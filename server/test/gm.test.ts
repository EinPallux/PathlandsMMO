// GM tooling: an account flagged is_gm gets a `gm` welcome and can kick / mute / give-gold; a
// non-GM's gm frame is ignored (server re-checks privilege, never trusts the client).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

describe('GM tooling', () => {
  let sim: ServerSim;
  let store: MemoryStore;
  let auth: Auth;
  let server: GameServer;
  let url: string;
  let gmToken: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    store = new MemoryStore();
    auth = new Auth('test-secret');
    const gmAcct = (await store.createAccount('gm@test.com', 'h'))!;
    await store.setGm(gmAcct.id, true);
    gmToken = auth.issue(gmAcct.id, Math.floor(Date.now() / 1000));
    server = new GameServer(sim, gatewayOptions(), { auth, store });
    await server.listen();
    url = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  /** A GM client (authenticated) + a guest victim, both joined. */
  async function gmAndVictim(): Promise<[TestClient, TestClient]> {
    const gm = new TestClient(url);
    const victim = new TestClient(url);
    await Promise.all([gm.opened(), victim.opened()]);
    gm.hello('Overseer', 'mage', 10, gmToken);
    victim.hello('Victim', 'warrior', 5);
    await until(() => gm.you !== null && victim.you !== null, 3000, 'both welcomed');
    return [gm, victim];
  }

  it('flags a GM account in the welcome; a guest is not a GM', async () => {
    const [gm, victim] = await gmAndVictim();
    expect(gm.gm).toBe(true);
    expect(victim.gm).toBe(false);
    gm.close();
    victim.close();
  });

  it('a GM /kick terminates the target’s socket', async () => {
    const [gm, victim] = await gmAndVictim();
    gm.gmAction('kick', 'Victim');
    await until(() => victim.closed, 3000, 'victim kicked');
    gm.close();
  });

  it('a GM /mute drops the target’s subsequent chat', async () => {
    const [gm, victim] = await gmAndVictim();
    gm.gmAction('mute', 'Victim', { minutes: 5 });
    await sleep(150); // let the mute apply
    victim.chat('can anyone hear me');
    await sleep(300);
    // Neither the GM nor the victim's own echo carries the muted line.
    expect(gm.chats.some((c) => c.text === 'can anyone hear me')).toBe(false);
    gm.close();
    victim.close();
  });

  it('a GM /give grants gold to the target', async () => {
    const [gm, victim] = await gmAndVictim();
    gm.gmAction('give', 'Victim', { qty: 250 });
    await until(() => victim.lastKillGold !== null, 3000, 'grant arrives');
    expect(victim.lastKillGold).toBe(250);
    gm.close();
    victim.close();
  });

  it('ignores GM actions from a non-GM (privilege re-checked server-side)', async () => {
    // Two guests: one tries to kick the other. The server drops it (not a GM).
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Nobody', 'ranger', 5);
    b.hello('Target', 'priest', 5);
    await until(() => a.you !== null && b.you !== null, 3000, 'welcomed');
    a.gmAction('kick', 'Target');
    await sleep(300);
    expect(b.closed).toBe(false); // not kicked — the sender isn't a GM
    a.close();
    b.close();
  });
});
