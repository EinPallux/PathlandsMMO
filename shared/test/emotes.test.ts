// Emote table sanity: lookups are case-insensitive and slash-free, every phrase is a
// non-empty third-person fragment, and commands are unique — the server trusts this table
// to format broadcasts, so a malformed entry would ship a broken emote to every player.

import { describe, it, expect } from 'vitest';
import { EMOTES, emoteCommands, findEmote } from '../src/index.js';

describe('emotes', () => {
  it('has unique, lowercase, slash-free commands', () => {
    const cmds = emoteCommands();
    expect(new Set(cmds).size).toBe(cmds.length);
    for (const c of cmds) {
      expect(c).toBe(c.toLowerCase());
      expect(c).not.toContain('/');
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it('every phrase is a non-empty action fragment', () => {
    for (const e of EMOTES) {
      expect(e.phrase.trim().length).toBeGreaterThan(0);
    }
  });

  it('findEmote is case-insensitive and returns null for unknowns', () => {
    expect(findEmote('wave')?.phrase).toBe('waves.');
    expect(findEmote('WAVE')?.phrase).toBe('waves.');
    expect(findEmote('Dance')).not.toBeNull();
    expect(findEmote('teleport')).toBeNull();
    expect(findEmote('')).toBeNull();
  });
});
