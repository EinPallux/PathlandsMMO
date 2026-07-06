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
  type ServerSelf,
} from '../src/index.js';

describe('net protocol codec', () => {
  it('is at protocol version 7 (self / token / chat / entities / combat-self / xp)', () => {
    expect(NET_PROTOCOL_VERSION).toBe(7);
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
