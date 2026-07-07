// Party (group) formation — unit tests of the PartyManager state machine, plus an end-to-end
// check that the roster forms + replicates over the wire and disbands on leave (Phase 6 §Social).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { Auth } from '../src/auth.js';
import { MemoryStore } from '../src/store.js';
import { PartyManager } from '../src/party.js';
import { TestClient, gatewayOptions, until } from './support.js';

describe('PartyManager', () => {
  it('forms a party when an invite is accepted (inviter becomes leader)', () => {
    const pm = new PartyManager();
    expect(pm.invite('A', 'B')).toBe('ok');
    const change = pm.accept('B')!;
    expect(change).not.toBeNull();
    const party = pm.partyOf('A')!;
    expect(party.members.sort()).toEqual(['A', 'B']);
    expect(party.leaderId).toBe('A');
    expect(pm.partyOf('B')).toBe(party); // same object, shared by reference
    expect(change.notify.sort()).toEqual(['A', 'B']);
  });

  it('rejects self-invite, a busy target, and a full party', () => {
    const pm = new PartyManager();
    expect(pm.invite('A', 'A')).toBe('self');
    // Fill a party to the cap of 4.
    pm.invite('A', 'B');
    pm.accept('B');
    pm.invite('A', 'C');
    pm.accept('C');
    pm.invite('A', 'D');
    pm.accept('D');
    expect(pm.partyOf('A')!.members).toHaveLength(4);
    expect(pm.invite('A', 'E')).toBe('full'); // party is full
    // An invite to someone already grouped is refused.
    expect(pm.invite('X', 'B')).toBe('targetBusy');
  });

  it('a stale invite (inviter already filled the party) fails to accept', () => {
    const pm = new PartyManager();
    // A fills a party with B, C, D (4/4), having also invited E earlier.
    pm.invite('A', 'E');
    pm.invite('A', 'B');
    pm.accept('B');
    pm.invite('A', 'C');
    pm.accept('C');
    pm.invite('A', 'D');
    pm.accept('D');
    expect(pm.accept('E')).toBeNull(); // no room left
    expect(pm.partyOf('E')).toBeNull();
  });

  it('leaving disbands a two-person party (both go solo)', () => {
    const pm = new PartyManager();
    pm.invite('A', 'B');
    pm.accept('B');
    const change = pm.leave('A');
    expect(change.disbanded).toBe(true);
    expect(change.notify.sort()).toEqual(['A', 'B']);
    expect(pm.partyOf('A')).toBeNull();
    expect(pm.partyOf('B')).toBeNull();
  });

  it('a departing leader hands off to the next member (party of 3+ survives)', () => {
    const pm = new PartyManager();
    pm.invite('A', 'B');
    pm.accept('B');
    pm.invite('A', 'C');
    pm.accept('C');
    const change = pm.leave('A'); // the leader leaves
    expect(change.disbanded).toBe(false);
    const party = pm.partyOf('B')!;
    expect(party.members.sort()).toEqual(['B', 'C']);
    expect(party.leaderId).toBe('B'); // promoted
    expect(pm.partyOf('A')).toBeNull();
  });

  it('only the leader may kick, and cannot kick themselves', () => {
    const pm = new PartyManager();
    pm.invite('A', 'B');
    pm.accept('B');
    pm.invite('A', 'C');
    pm.accept('C');
    expect(pm.kick('B', 'C')).toBeNull(); // B is not the leader
    expect(pm.kick('A', 'A')).toBeNull(); // can't kick self
    const change = pm.kick('A', 'C')!;
    expect(change).not.toBeNull();
    expect(pm.partyOf('C')).toBeNull();
    expect(pm.partyOf('A')!.members.sort()).toEqual(['A', 'B']);
  });

  it('remove() (disconnect) drops the member and clears its outgoing invites', () => {
    const pm = new PartyManager();
    pm.invite('A', 'B'); // A has a pending invite out to B
    pm.remove('A'); // A disconnects before B accepts
    expect(pm.accept('B')).toBeNull(); // the invite was cleared
    expect(pm.partyOf('B')).toBeNull();
  });
});

describe('party — over the wire', () => {
  let sim: ServerSim;
  let store: MemoryStore;
  let server: GameServer;
  let wsUrl: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    store = new MemoryStore();
    server = new GameServer(sim, gatewayOptions(), { auth: new Auth('test-secret'), store });
    await server.listen();
    wsUrl = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('two players form a party by invite→accept, then it disbands on leave', async () => {
    const a = new TestClient(wsUrl);
    const b = new TestClient(wsUrl);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 6);
    await until(() => a.you !== null && b.you !== null, 3000, 'both welcomed');

    // Alia invites Boro by session id; Boro gets the invite frame naming the inviter.
    a.partyInvite(b.you!);
    await until(() => b.lastInvite?.fromId === a.you, 3000, 'invite arrives');
    expect(b.lastInvite!.fromName).toBe('Alia');

    // Boro accepts → both see the two-person roster, with Alia as leader.
    b.partyAccept();
    await until(
      () => a.lastParty.members.length === 2 && b.lastParty.members.length === 2,
      3000,
      'party formed',
    );
    expect(a.lastParty.leaderId).toBe(a.you);
    expect(new Set(a.lastParty.members.map((m) => m.name))).toEqual(new Set(['Alia', 'Boro']));
    const boro = a.lastParty.members.find((m) => m.name === 'Boro')!;
    expect(boro.cls).toBe('warrior');
    expect(boro.level).toBe(6);

    // Boro leaves → both rosters empty (a two-person party disbands).
    b.partyLeave();
    await until(
      () => a.lastParty.members.length === 0 && b.lastParty.members.length === 0,
      3000,
      'disbanded',
    );

    a.close();
    b.close();
  });

  it('a party member disconnecting disbands the two-person party for the other', async () => {
    const a = new TestClient(wsUrl);
    const b = new TestClient(wsUrl);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 6);
    await until(() => a.you !== null && b.you !== null, 3000, 'welcomed');
    a.partyInvite(b.you!);
    await until(() => b.lastInvite !== null, 3000, 'invite');
    b.partyAccept();
    await until(() => a.lastParty.members.length === 2, 3000, 'formed');

    b.close(); // Boro drops
    await until(() => a.lastParty.members.length === 0, 3000, 'Alia sees the party disband');

    a.close();
  });

  it('invite is by session id, so it reaches the right player even with duplicate names', async () => {
    // Two players share the display name "Twin"; a third invites ONE of them by session id.
    // Name-based targeting would resolve to the global-first match (ambiguous); id targeting
    // is exact.
    const a = new TestClient(wsUrl);
    const twin1 = new TestClient(wsUrl);
    const twin2 = new TestClient(wsUrl);
    await Promise.all([a.opened(), twin1.opened(), twin2.opened()]);
    a.hello('Alia', 'ranger', 5);
    twin1.hello('Twin', 'warrior', 6);
    twin2.hello('Twin', 'priest', 7);
    await until(
      () => a.you !== null && twin1.you !== null && twin2.you !== null,
      3000,
      'all welcomed',
    );

    // Invite the SECOND Twin specifically.
    a.partyInvite(twin2.you!);
    await until(() => twin2.lastInvite?.fromId === a.you, 3000, 'twin2 invited');
    // The other same-named player received nothing.
    expect(twin1.lastInvite).toBeNull();

    twin2.partyAccept();
    await until(() => a.lastParty.members.length === 2, 3000, 'party formed with twin2');
    expect(a.lastParty.members.map((m) => m.id).sort()).toEqual([a.you, twin2.you].sort());
    expect(a.lastParty.members.some((m) => m.id === twin1.you)).toBe(false);

    a.close();
    twin1.close();
    twin2.close();
  });

  it('a party receives live vitals for every member (world-wide, not interest-filtered)', async () => {
    const a = new TestClient(wsUrl);
    const b = new TestClient(wsUrl);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 6);
    await until(() => a.you !== null && b.you !== null, 3000, 'welcomed');
    a.partyInvite(b.you!);
    await until(() => b.lastInvite !== null, 3000, 'invite');
    b.partyAccept();
    await until(() => a.lastParty.members.length === 2, 3000, 'formed');

    // Both members get a vitals frame covering the whole party (including themselves), with
    // positive hp/maxHP — proving the server projects each member's combat state.
    await until(
      () => a.lastVitals !== null && a.lastVitals.length === 2,
      3000,
      'Alia sees party vitals',
    );
    await until(() => b.lastVitals !== null && b.lastVitals.length === 2, 3000, 'Boro too');
    const ids = new Set(a.lastVitals!.map((v) => v.id));
    expect(ids).toEqual(new Set([a.you, b.you]));
    for (const v of a.lastVitals!) {
      expect(v.maxHP).toBeGreaterThan(0);
      expect(v.hp).toBeGreaterThan(0);
      expect(v.dead).toBe(false);
    }

    a.close();
    b.close();
  });

  it('an invite to an offline / unknown session id is rejected, forming no party', async () => {
    const a = new TestClient(wsUrl);
    await a.opened();
    a.hello('Alia', 'ranger', 5);
    await until(() => a.you !== null, 3000, 'welcomed');

    a.partyInvite('no-such-session');
    await until(() => a.chats.some((c) => c.fromId === ''), 3000, 'a rejection notice arrives');
    expect(a.chats.some((c) => c.fromId === '' && /no longer online/i.test(c.text))).toBe(true);
    expect(a.lastParty.members).toHaveLength(0);

    a.close();
  });
});
