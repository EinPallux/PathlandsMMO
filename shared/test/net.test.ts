// Wire-protocol tests: the codec is the trust boundary, so it must round-trip valid
// frames and reject malformed ones. Covers the Phase-6 Part-2 additions (the `self`
// reconciliation channel + physics projection helpers) alongside the existing messages.

import { describe, it, expect } from 'vitest';
import {
  applyNetSelf,
  decodeClient,
  decodeServer,
  encodeClient,
  encodeServer,
  makeMoveIntent,
  makePlayerPhysics,
  MAX_CHAT_LEN,
  NET_PROTOCOL_VERSION,
  physToNetSelf,
  type ClientMessage,
  type ServerMessage,
  type ServerSelf,
} from '../src/index.js';

describe('net protocol codec', () => {
  it('is at protocol version 16 (…/ whisper / who / gm / ground items)', () => {
    expect(NET_PROTOCOL_VERSION).toBe(16);
  });

  it('round-trips ground-item drop / pickup / replication / grant frames', () => {
    const item = { id: 'sword_of_x', name: 'Sword of X' } as unknown as never;
    // Client → server: drop (full item + qty) and pickup (id).
    const drop: ClientMessage = { t: 'dropItem', item, qty: 3 };
    expect(decodeClient(encodeClient(drop))).toEqual(drop);
    const pick: ClientMessage = { t: 'pickupItem', id: 'g7' };
    expect(decodeClient(encodeClient(pick))).toEqual(pick);
    // qty must be a positive integer; a zero / fractional / non-item sinks the frame.
    expect(decodeClient(JSON.stringify({ t: 'dropItem', item, qty: 0 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dropItem', item, qty: 1.5 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'dropItem', item: { id: 'x' }, qty: 1 }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'pickupItem', id: '' }))).toBeNull();
    // Server → client: the interest-filtered world-items frame.
    const wi: ServerMessage = {
      t: 'worldItems',
      tick: 42,
      items: [{ id: 'g7', item, qty: 3, x: 10, y: 5, z: -4 }],
      gone: ['g2'],
    };
    expect(decodeServer(encodeServer(wi))).toEqual(wi);
    // A world item missing a coordinate sinks the frame.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'worldItems',
          tick: 1,
          items: [{ id: 'g', item, qty: 1, x: 0, z: 0 }],
          gone: [],
        }),
      ),
    ).toBeNull();
    // Server → client: the pickup grant.
    const grant: ServerMessage = { t: 'grant', tick: 9, items: [{ item, qty: 3 }] };
    expect(decodeServer(encodeServer(grant))).toEqual(grant);
    expect(decodeServer(JSON.stringify({ t: 'grant', tick: 9, items: [{ qty: 1 }] }))).toBeNull();
  });

  it('round-trips + validates a GM action + the welcome gm flag', () => {
    const kick: ClientMessage = { t: 'gm', action: 'kick', target: 'Griefer' };
    expect(decodeClient(encodeClient(kick))).toEqual(kick);
    const mute: ClientMessage = { t: 'gm', action: 'mute', target: 'Loud', minutes: 15 };
    expect(decodeClient(encodeClient(mute))).toEqual(mute);
    const tp: ClientMessage = { t: 'gm', action: 'teleport', target: 'Lost', x: 10, z: -20 };
    expect(decodeClient(encodeClient(tp))).toEqual(tp);
    // Unknown action, or a non-string target, sinks the frame.
    expect(decodeClient(JSON.stringify({ t: 'gm', action: 'nuke', target: 'X' }))).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'gm', action: 'kick', target: 5 }))).toBeNull();
    // The welcome's optional gm flag round-trips; a non-boolean sinks it.
    const w: ServerMessage = {
      t: 'welcome',
      protocol: 15,
      you: 'p1',
      seed: 1,
      tick: 0,
      tickRate: 20,
      gm: true,
    };
    expect(decodeServer(encodeServer(w))).toEqual(w);
    expect(
      decodeServer(
        JSON.stringify({
          t: 'welcome',
          protocol: 15,
          you: 'p',
          seed: 1,
          tick: 0,
          tickRate: 20,
          gm: 1,
        }),
      ),
    ).toBeNull();
  });

  it('round-trips the /who roster query + reply', () => {
    expect(decodeClient(encodeClient({ t: 'who' }))).toEqual({ t: 'who' });
    const roster: ServerMessage = {
      t: 'who',
      players: [
        { name: 'Alia', level: 5, cls: 'ranger' },
        { name: 'Boro', level: 6, cls: 'warrior' },
      ],
    };
    expect(decodeServer(encodeServer(roster))).toEqual(roster);
    // Empty roster round-trips; a malformed entry (missing level) sinks it.
    expect(decodeServer(encodeServer({ t: 'who', players: [] }))).toEqual({
      t: 'who',
      players: [],
    });
    expect(
      decodeServer(JSON.stringify({ t: 'who', players: [{ name: 'X', cls: 'mage' }] })),
    ).toBeNull();
  });

  it('round-trips a whisper: ClientChat.to + ServerChat.whisper', () => {
    const w: ClientMessage = { t: 'chat', text: 'hey', to: 'sess-9' };
    expect(decodeClient(encodeClient(w))).toEqual(w);
    // A plain say line has no `to` (and the decoder doesn't add one).
    expect(decodeClient(encodeClient({ t: 'chat', text: 'hi' }))).toEqual({
      t: 'chat',
      text: 'hi',
    });
    // Server whisper frame round-trips with the flag.
    const s: ServerMessage = {
      t: 'chat',
      fromId: 'p1',
      from: 'Alia',
      text: 'hey',
      tick: 3,
      whisper: true,
    };
    expect(decodeServer(encodeServer(s))).toEqual(s);
    // A non-boolean whisper flag sinks the frame.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'chat',
          fromId: 'p1',
          from: 'Alia',
          text: 'x',
          tick: 1,
          whisper: 'yes',
        }),
      ),
    ).toBeNull();
  });

  it('round-trips + validates the party channel (client action + server roster/invite)', () => {
    // Client → server actions.
    for (const action of ['accept', 'decline', 'leave'] as const) {
      const msg: ClientMessage = { t: 'party', action };
      expect(decodeClient(encodeClient(msg))).toEqual(msg);
    }
    // invite/kick target the recipient's SESSION id (not a name).
    const invite: ClientMessage = { t: 'party', action: 'invite', target: 'sess-2' };
    expect(decodeClient(encodeClient(invite))).toEqual(invite);
    // An unknown action is rejected.
    expect(decodeClient(JSON.stringify({ t: 'party', action: 'nuke' }))).toBeNull();

    // Server → client roster.
    const state: ServerMessage = {
      t: 'partyState',
      leaderId: 'p1',
      members: [
        { id: 'p1', name: 'Alia', cls: 'ranger', level: 5 },
        { id: 'p2', name: 'Boro', cls: 'warrior', level: 6 },
      ],
    };
    expect(decodeServer(encodeServer(state))).toEqual(state);
    // A solo roster (empty members, no leader) round-trips.
    const solo: ServerMessage = { t: 'partyState', leaderId: '', members: [] };
    expect(decodeServer(encodeServer(solo))).toEqual(solo);
    // A malformed member (missing name) sinks the frame.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'partyState',
          leaderId: 'p1',
          members: [{ id: 'p1', cls: 'ranger', level: 5 }],
        }),
      ),
    ).toBeNull();

    // Server → client invite.
    const inv: ServerMessage = { t: 'partyInvite', fromId: 'p1', fromName: 'Alia' };
    expect(decodeServer(encodeServer(inv))).toEqual(inv);
  });

  it('round-trips + validates the party-vitals frame (live ally HP/resource)', () => {
    const vitals: ServerMessage = {
      t: 'partyVitals',
      tick: 42,
      vitals: [
        {
          id: 'p1',
          hp: 120,
          maxHP: 200,
          resource: 30,
          maxResource: 100,
          resourceKind: 'rage',
          dead: false,
        },
        {
          id: 'p2',
          hp: 0,
          maxHP: 260,
          resource: 0,
          maxResource: 0,
          resourceKind: 'rage',
          dead: true,
        },
      ],
    };
    expect(decodeServer(encodeServer(vitals))).toEqual(vitals);
    // An empty batch round-trips (a party with no live members projected this tick).
    expect(decodeServer(encodeServer({ t: 'partyVitals', tick: 1, vitals: [] }))).toEqual({
      t: 'partyVitals',
      tick: 1,
      vitals: [],
    });
    // Malformed: a non-finite hp, and a missing dead flag, each sink the frame.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'partyVitals',
          tick: 1,
          vitals: [
            {
              id: 'p1',
              hp: null,
              maxHP: 10,
              resource: 0,
              maxResource: 0,
              resourceKind: 'mana',
              dead: false,
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      decodeServer(
        JSON.stringify({
          t: 'partyVitals',
          tick: 1,
          vitals: [
            { id: 'p1', hp: 5, maxHP: 10, resource: 0, maxResource: 0, resourceKind: 'mana' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('round-trips + validates a ServerCombatEvents (fx) frame', () => {
    const msg: ServerMessage = {
      t: 'fx',
      tick: 20,
      events: [
        { kind: 'damage', x: 1, y: 64, z: 2, amount: 37, crit: true },
        { kind: 'heal', x: 3, y: 64, z: 4, amount: 12, crit: false },
        { kind: 'death', x: 5, y: 63, z: 6, amount: 0, crit: false },
        { kind: 'boss', x: 7, y: 65, z: 8, amount: 0, crit: false, text: 'The Warden roars.' },
      ],
    };
    expect(decodeServer(encodeServer(msg))).toEqual(msg);
    // An empty batch round-trips.
    expect(decodeServer(encodeServer({ t: 'fx', tick: 1, events: [] }))).toEqual({
      t: 'fx',
      tick: 1,
      events: [],
    });
    // Malformed: an unknown kind, and a non-finite coordinate, each sink the frame.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'fx',
          tick: 1,
          events: [{ kind: 'nope', x: 0, y: 0, z: 0, amount: 0, crit: false }],
        }),
      ),
    ).toBeNull();
    expect(
      decodeServer(
        JSON.stringify({
          t: 'fx',
          tick: 1,
          events: [{ kind: 'damage', x: 'x', y: 0, z: 0, amount: 0, crit: false }],
        }),
      ),
    ).toBeNull();
  });

  it('round-trips + validates a ServerKill (loot credit) frame', () => {
    // The item carries a full ItemDef (loot generates unique items); the codec passes it
    // through, validating only that it's an object with a string id + name.
    const item = {
      id: 'gen_1',
      name: 'Cracked Trinket',
      slot: 'trinket',
      rarity: 'common',
      ilvl: 6,
      reqLevel: 6,
      stats: {},
      value: 4,
    };
    const msg = {
      t: 'kill',
      tick: 55,
      enemyId: 'thornbackBoar',
      gold: 12,
      items: [{ item, qty: 1 }],
    } as unknown as ServerMessage;
    expect(decodeServer(encodeServer(msg))).toEqual(msg);
    // A kill that dropped nothing (empty items, zero gold) still round-trips.
    const dry = {
      t: 'kill',
      tick: 1,
      enemyId: 'wolf',
      gold: 0,
      items: [],
    } as unknown as ServerMessage;
    expect(decodeServer(encodeServer(dry))).toEqual(dry);
    // Malformed: non-finite gold sinks the frame.
    expect(
      decodeServer(JSON.stringify({ t: 'kill', tick: 1, enemyId: 'x', gold: 'lots', items: [] })),
    ).toBeNull();
    // Malformed: an item stack whose item has no name is rejected.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'kill',
          tick: 1,
          enemyId: 'x',
          gold: 0,
          items: [{ item: { id: 'a' }, qty: 1 }],
        }),
      ),
    ).toBeNull();
  });

  it('round-trips + validates a ServerCombatSelf frame', () => {
    const self = {
      hp: 120,
      maxHP: 200,
      resource: 30,
      maxResource: 100,
      resourceKind: 'rage',
      level: 6,
      totalXp: 12345,
      targetId: 'grove#0@10',
      castSkill: 'fireball',
      castFrac: 0.5,
      dead: false,
      inCombat: true,
    };
    const msg = { t: 'combatSelf', tick: 88, self } as const;
    expect(decodeServer(encodeServer(msg))).toEqual(msg);
    // Null target + not casting round-trip too.
    const idle = { ...self, targetId: null, castSkill: null, castFrac: 0, inCombat: false };
    expect(decodeServer(encodeServer({ t: 'combatSelf', tick: 1, self: idle }))).toEqual({
      t: 'combatSelf',
      tick: 1,
      self: idle,
    });
    // A malformed combat-self (non-finite hp) is rejected.
    expect(
      decodeServer(JSON.stringify({ t: 'combatSelf', tick: 1, self: { ...self, hp: 'x' } })),
    ).toBeNull();
  });

  it('round-trips a ServerSelf frame', () => {
    const phys = makePlayerPhysics(10, 64, -5);
    phys.vx = 1.5;
    phys.vy = -3.25;
    phys.onGround = true;
    phys.inWater = false;
    phys.moveState = 'run';
    const msg: ServerSelf = { t: 'self', tick: 42, ackedSeq: 17, phys: physToNetSelf(phys) };
    const decoded = decodeServer(encodeServer(msg));
    expect(decoded).toEqual(msg);
  });

  it('physToNetSelf → applyNetSelf is an identity on the kinematic fields', () => {
    const src = makePlayerPhysics(3, 50, 8);
    src.vx = 2;
    src.vy = 0.5;
    src.vz = -1;
    src.yaw = 1.23;
    src.onGround = false;
    src.inWater = true;
    src.moveState = 'swim';
    const dst = makePlayerPhysics(0, 0, 0);
    applyNetSelf(dst, physToNetSelf(src));
    expect(dst.x).toBe(src.x);
    expect(dst.vy).toBe(src.vy);
    expect(dst.yaw).toBe(src.yaw);
    expect(dst.onGround).toBe(src.onGround);
    expect(dst.inWater).toBe(src.inWater);
    expect(dst.moveState).toBe(src.moveState);
  });

  it('drops a malformed self frame (missing / non-finite fields)', () => {
    const good = {
      t: 'self',
      tick: 1,
      ackedSeq: 0,
      phys: physToNetSelf(makePlayerPhysics(0, 0, 0)),
    };
    // Missing a velocity component.
    const noVy = JSON.parse(JSON.stringify(good));
    delete noVy.phys.vy;
    expect(decodeServer(JSON.stringify(noVy))).toBeNull();
    // Non-finite position.
    const nanX = JSON.parse(JSON.stringify(good));
    nanX.phys.x = 'oops';
    expect(decodeServer(JSON.stringify(nanX))).toBeNull();
    // Missing ackedSeq.
    const noAck = JSON.parse(JSON.stringify(good));
    delete noAck.ackedSeq;
    expect(decodeServer(JSON.stringify(noAck))).toBeNull();
  });

  it('round-trips snapshot / delta / welcome and validates them', () => {
    const player = {
      id: 'p1',
      name: 'Alia',
      cls: 'ranger',
      level: 5,
      x: 1,
      y: 2,
      z: 3,
      yaw: 0.5,
      move: 'walk' as const,
    };
    expect(
      decodeServer(encodeServer({ t: 'snapshot', tick: 3, players: [player], entities: [] })),
    ).toEqual({ t: 'snapshot', tick: 3, players: [player], entities: [] });
    expect(
      decodeServer(
        encodeServer({
          t: 'delta',
          tick: 4,
          players: [player],
          gone: ['p9'],
          entities: [],
          goneEntities: [],
        }),
      ),
    ).toEqual({
      t: 'delta',
      tick: 4,
      players: [player],
      gone: ['p9'],
      entities: [],
      goneEntities: [],
    });
    // A player missing a coordinate is rejected wholesale.
    const badPlayer = { ...player, z: undefined };
    expect(
      decodeServer(JSON.stringify({ t: 'snapshot', tick: 3, players: [badPlayer] })),
    ).toBeNull();
  });

  it('round-trips + validates enemy entities in snapshot / delta', () => {
    const player = {
      id: 'p1',
      name: 'Alia',
      cls: 'ranger',
      level: 5,
      x: 1,
      y: 2,
      z: 3,
      yaw: 0.5,
      move: 'walk' as const,
    };
    const enemy = {
      id: 'grove#0@10',
      enemyId: 'wolf',
      name: 'Grove Wolf',
      level: 4,
      x: 120,
      y: 64,
      z: 210,
      yaw: 1.1,
      hp: 60,
      maxHP: 60,
      state: 'idle',
      castSkill: null,
      castFrac: 0,
    };
    // Snapshot carries entities.
    expect(
      decodeServer(encodeServer({ t: 'snapshot', tick: 3, players: [player], entities: [enemy] })),
    ).toEqual({ t: 'snapshot', tick: 3, players: [player], entities: [enemy] });
    // Delta carries entered/changed entities + gone entity ids.
    expect(
      decodeServer(
        encodeServer({
          t: 'delta',
          tick: 4,
          players: [],
          gone: [],
          entities: [enemy],
          goneEntities: ['grove#1@8'],
        }),
      ),
    ).toEqual({
      t: 'delta',
      tick: 4,
      players: [],
      gone: [],
      entities: [enemy],
      goneEntities: ['grove#1@8'],
    });
    // A malformed entity (non-finite hp) sinks the whole frame.
    const badEnemy = { ...enemy, hp: 'lots' };
    expect(
      decodeServer(JSON.stringify({ t: 'snapshot', tick: 3, players: [], entities: [badEnemy] })),
    ).toBeNull();
    // A pre-v5 frame with no entities field still decodes (entities default to []).
    expect(decodeServer(JSON.stringify({ t: 'snapshot', tick: 1, players: [] }))).toEqual({
      t: 'snapshot',
      tick: 1,
      players: [],
      entities: [],
    });
    // An enemy mid-cast round-trips its cast fields (drives the target-frame cast bar).
    const caster = { ...enemy, castSkill: 'gore', castFrac: 0.42 };
    expect(
      decodeServer(encodeServer({ t: 'snapshot', tick: 5, players: [], entities: [caster] })),
    ).toEqual({ t: 'snapshot', tick: 5, players: [], entities: [caster] });
    // A non-string castSkill (not null) is rejected.
    expect(
      decodeServer(
        JSON.stringify({
          t: 'snapshot',
          tick: 1,
          players: [],
          entities: [{ ...enemy, castSkill: 3 }],
        }),
      ),
    ).toBeNull();
  });

  it('round-trips + validates client frames (hello / intent / ping)', () => {
    const hello: ClientMessage = {
      t: 'hello',
      protocol: NET_PROTOCOL_VERSION,
      name: 'Boro',
      cls: 'warrior',
      level: 1,
    };
    expect(decodeClient(encodeClient(hello))).toEqual(hello);

    const intent: ClientMessage = {
      t: 'intent',
      seq: 7,
      tick: 7,
      intent: makeMoveIntent(1, 0, false, true, 0.2),
    };
    expect(decodeClient(encodeClient(intent))).toEqual(intent);

    // A Move intent with a non-finite wish is dropped at the boundary.
    expect(
      decodeClient(
        JSON.stringify({
          t: 'intent',
          seq: 1,
          tick: 1,
          intent: { type: 'Move', wishX: Infinity, wishZ: 0, jump: false, sprint: false, yaw: 0 },
        }),
      ),
    ).toBeNull();

    // seq/tick must be non-negative integers — a fractional/negative/huge value would
    // poison the server's monotonic sequence gate. All of these are rejected.
    const moveIntent = { type: 'Move', wishX: 0, wishZ: 0, jump: false, sprint: false, yaw: 0 };
    for (const bad of [1.5, -1, Number.MAX_VALUE]) {
      expect(
        decodeClient(JSON.stringify({ t: 'intent', seq: bad, tick: 0, intent: moveIntent })),
      ).toBeNull();
    }

    expect(decodeClient('not json')).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'unknown' }))).toBeNull();
  });

  it('round-trips + validates chat frames on both directions', () => {
    // Client → server: a non-empty, capped string.
    const clientChat: ClientMessage = { t: 'chat', text: 'hail!' };
    expect(decodeClient(encodeClient(clientChat))).toEqual(clientChat);
    // Empty text and an over-cap string are both rejected at the wire.
    expect(decodeClient(JSON.stringify({ t: 'chat', text: '' }))).toBeNull();
    expect(
      decodeClient(JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_CHAT_LEN + 1) })),
    ).toBeNull();
    expect(decodeClient(JSON.stringify({ t: 'chat', text: 42 }))).toBeNull();

    // Server → client: id + authoritative name + text + tick.
    const serverChat = { t: 'chat', fromId: 'p1', from: 'Alia', text: 'hail!', tick: 12 } as const;
    expect(decodeServer(encodeServer(serverChat))).toEqual(serverChat);
    // An emote line carries the optional `emote` flag through the codec.
    const emote = {
      t: 'chat',
      fromId: 'p1',
      from: 'Alia',
      text: 'waves.',
      tick: 3,
      emote: true,
    } as const;
    expect(decodeServer(encodeServer(emote))).toEqual(emote);
    // A non-boolean emote flag is rejected.
    expect(
      decodeServer(
        JSON.stringify({ t: 'chat', fromId: 'p1', from: 'A', text: 'x', tick: 1, emote: 1 }),
      ),
    ).toBeNull();
    // A missing display name is rejected.
    expect(
      decodeServer(JSON.stringify({ t: 'chat', fromId: 'p1', text: 'hi', tick: 1 })),
    ).toBeNull();
  });
});
