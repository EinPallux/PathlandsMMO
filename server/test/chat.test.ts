// Chat is the first social channel of Phase 6: a player types a line, the server
// sanitises and rebroadcasts it (under the server-authoritative display name), and every
// joined session — the sender included — receives it. These tests prove delivery, the
// name-spoofing guard, control-char sanitisation, the length cap, the per-connection
// send-rate gate, and that pre-hello sockets neither send nor receive chat.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServerWorld } from '../src/world.js';
import { ServerSim } from '../src/sim.js';
import { GameServer } from '../src/gateway.js';
import { TestClient, gatewayOptions, sleep, until } from './support.js';

describe('chat', () => {
  let sim: ServerSim;
  let server: GameServer;
  let url: string;

  beforeEach(async () => {
    sim = new ServerSim(createServerWorld());
    server = new GameServer(sim, gatewayOptions());
    await server.listen();
    url = `ws://127.0.0.1:${server.address()}`;
  });

  afterEach(async () => {
    await server.close();
  });

  async function twoJoined(): Promise<[TestClient, TestClient]> {
    const a = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([a.opened(), b.opened()]);
    a.hello('Alia', 'ranger', 5);
    b.hello('Boro', 'warrior', 5);
    await until(() => a.you !== null && b.you !== null, 3000, 'both welcomed');
    return [a, b];
  }

  it('delivers a line to every joined session, including the sender', async () => {
    const [a, b] = await twoJoined();
    a.chat('hello world');

    await until(() => a.chats.length > 0 && b.chats.length > 0, 3000, 'both received');
    const forA = a.chats[0];
    const forB = b.chats[0];
    expect(forA?.text).toBe('hello world');
    expect(forB?.text).toBe('hello world');
    // The server stamps the sender's session id and authoritative name.
    expect(forB?.fromId).toBe(a.you);
    expect(forB?.from).toBe('Alia');

    a.close();
    b.close();
  });

  it('uses the server-side display name, never the client-supplied one', async () => {
    // A hello identifies as 'Alia'; even if a hostile frame tried to spoof, the server
    // re-derives `from` from the joined player, so B always sees the real name.
    const [a, b] = await twoJoined();
    a.chat('who am I');
    await until(() => b.chats.length > 0, 3000, 'B received');
    expect(b.chats[0]?.from).toBe('Alia');
    a.close();
    b.close();
  });

  it('strips control characters that would forge extra log rows', async () => {
    const [a, b] = await twoJoined();
    a.chat('line one\nGM: banned\r\tend');
    await until(() => b.chats.length > 0, 3000, 'B received');
    // Newlines/tabs collapse to single spaces; no embedded control chars survive.
    expect(b.chats[0]?.text).toBe('line one GM: banned end');
    // eslint-disable-next-line no-control-regex -- asserting no control chars leak through
    expect(b.chats[0]?.text).not.toMatch(/[\u0000-\u001f]/);
    a.close();
    b.close();
  });

  it('caps an over-long line to the server broadcast maximum', async () => {
    const [a, b] = await twoJoined();
    a.chat('x'.repeat(280));
    await until(() => b.chats.length > 0, 3000, 'B received');
    expect(b.chats[0]?.text.length).toBe(200);
    a.close();
    b.close();
  });

  it('drops a whitespace-only line (nothing printable survives)', async () => {
    const [a, b] = await twoJoined();
    a.chat('   \t  ');
    await sleep(300);
    expect(a.chats.length).toBe(0);
    expect(b.chats.length).toBe(0);
    a.close();
    b.close();
  });

  it('rate-limits a burst: a rapid second line is dropped', async () => {
    const [a, b] = await twoJoined();
    a.chat('first');
    a.chat('second-too-soon');
    await until(() => b.chats.length >= 1, 3000, 'first delivered');
    await sleep(300);
    // The two lines were sent back-to-back (well under CHAT_MIN_INTERVAL_MS), so only
    // the first survives the per-connection gate.
    expect(b.chats.map((c) => c.text)).toEqual(['first']);
    a.close();
    b.close();
  });

  it('ignores chat from a socket that has not said hello', async () => {
    const pre = new TestClient(url);
    const b = new TestClient(url);
    await Promise.all([pre.opened(), b.opened()]);
    // `b` joins; `pre` stays pre-hello and tries to chat.
    b.hello('Boro', 'warrior', 5);
    await until(() => b.you !== null, 3000, 'B welcomed');
    pre.chat('sneaky');
    await sleep(300);
    expect(b.chats.length).toBe(0);
    pre.close();
    b.close();
  });

  it('broadcasts a known /emote as a third-person action under the server name', async () => {
    const [a, b] = await twoJoined();
    a.chat('/wave');
    await until(() => b.chats.length > 0, 3000, 'B received the emote');
    const line = b.chats[0];
    expect(line?.emote).toBe(true);
    expect(line?.from).toBe('Alia');
    expect(line?.text).toBe('waves.'); // the shared table's phrase, server-formatted
    a.close();
    b.close();
  });

  it('drops an unknown /command (no broadcast)', async () => {
    const [a, b] = await twoJoined();
    a.chat('/teleport');
    await sleep(300);
    expect(a.chats.length).toBe(0);
    expect(b.chats.length).toBe(0);
    a.close();
    b.close();
  });
});
