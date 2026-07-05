import { describe, it, expect } from 'vitest';
import { STARTER_MAIL, WAYMEET_WELCOME, mailById, starterInbox, BANK_SIZE } from '../src/index.js';

describe('Mail (GDD §Supporting systems)', () => {
  it('every authored letter has a sender, subject, and resolvable id', () => {
    for (const m of [...STARTER_MAIL, WAYMEET_WELCOME]) {
      expect(m.sender.length).toBeGreaterThan(0);
      expect(m.subject.length).toBeGreaterThan(0);
      expect(m.body.length).toBeGreaterThan(0);
      expect(mailById(m.id)).toBe(m);
      if (m.gold !== undefined) expect(m.gold).toBeGreaterThan(0);
    }
  });

  it('the starter inbox is unclaimed and includes the welcome letter', () => {
    const inbox = starterInbox();
    expect(inbox.length).toBe(STARTER_MAIL.length);
    expect(inbox.every((m) => m.claimed === false)).toBe(true);
    expect(inbox.some((m) => m.id === 'mail_welcome' && m.gold === 25)).toBe(true);
  });

  it('produces fresh inbox copies (no shared mutable letters)', () => {
    const a = starterInbox();
    a[0]!.claimed = true;
    expect(starterInbox()[0]!.claimed).toBe(false);
  });

  it('exposes a positive bank capacity', () => {
    expect(BANK_SIZE).toBeGreaterThan(0);
  });
});
