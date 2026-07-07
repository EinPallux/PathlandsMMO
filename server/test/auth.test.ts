// Auth primitives: password hashing must round-trip and reject wrong passwords in
// constant time; JWTs must verify only when untampered and unexpired.

import { describe, expect, it } from 'vitest';
import { Auth, hashPassword, verifyPassword } from '../src/auth.js';

describe('password hashing (scrypt)', () => {
  it('round-trips and rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a distinct salt per hash (no rainbow reuse)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b); // different salts ⇒ different stored strings
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$only-two')).toBe(false);
  });
});

describe('session tokens (HS256 JWT)', () => {
  const auth = new Auth('test-secret');

  it('issues a token that verifies to the account id', () => {
    const token = auth.issue('acct-1', 1000);
    const claims = auth.verify(token, 1000);
    expect(claims?.sub).toBe('acct-1');
  });

  it('rejects an expired token', () => {
    const short = new Auth('test-secret', 10); // 10s ttl
    const token = short.issue('acct-1', 1000);
    expect(short.verify(token, 1005)).not.toBeNull(); // still valid
    expect(short.verify(token, 1011)).toBeNull(); // past exp
  });

  it('rejects a tampered token or a wrong secret', () => {
    const token = auth.issue('acct-1', 1000);
    const parts = token.split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'admin', iat: 1000, exp: 9e9 })).toString('base64url')}.${parts[2]}`;
    expect(auth.verify(forged, 1000)).toBeNull(); // signature no longer matches
    expect(new Auth('other-secret').verify(token, 1000)).toBeNull(); // wrong key
    expect(auth.verify('garbage', 1000)).toBeNull();
  });
});
