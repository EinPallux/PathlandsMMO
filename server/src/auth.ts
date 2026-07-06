// Authentication primitives — deliberately dependency-free (Node's built-in crypto
// only), so there's no native module (argon2, bcrypt) to fail a Docker build on the VPS.
//
// Passwords: scrypt (a memory-hard KDF built into Node) with a per-password random salt
// and a constant-time comparison. Sessions: compact HS256 JWTs signed with a server
// secret. Both are standard and battle-tested; argon2id is a drop-in upgrade later if a
// dependency is warranted (ARCH §8 names argon2id as the eventual target).

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function eqConstTime(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hash a password → `scrypt$<saltB64url>$<hashB64url>` (self-describing, salt embedded). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${b64url(salt)}$${b64url(hash)}`;
}

/** Verify a password against a stored hash. Constant-time; false on any malformed hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1]!, 'base64url');
    expected = Buffer.from(parts[2]!, 'base64url');
  } catch {
    return false;
  }
  const actual = await scrypt(password, salt, SCRYPT_KEYLEN);
  return eqConstTime(actual, expected);
}

/** JWT claims we issue and verify. */
export interface TokenClaims {
  /** Subject — the account id. */
  sub: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
}

/**
 * Sign/verify compact HS256 JWTs. Wall-clock (`nowSec`) is injected so the pure token
 * logic stays testable and the wall-clock touch is at the integration edge, not buried.
 */
export class Auth {
  constructor(
    private readonly secret: string,
    /** Token lifetime in seconds (default 7 days). */
    private readonly ttlSec = 7 * 24 * 3600,
  ) {}

  private sign(data: string): Buffer {
    return createHmac('sha256', this.secret).update(data).digest();
  }

  /** Issue a token for an account, expiring `ttlSec` after `nowSec`. */
  issue(accountId: string, nowSec: number): string {
    const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const payload = b64url(
      Buffer.from(JSON.stringify({ sub: accountId, iat: nowSec, exp: nowSec + this.ttlSec })),
    );
    const body = `${header}.${payload}`;
    return `${body}.${b64url(this.sign(body))}`;
  }

  /** Verify a token at `nowSec`; returns the claims, or null if invalid/expired/tampered. */
  verify(token: string, nowSec: number): TokenClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts as [string, string, string];
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, 'base64url');
    } catch {
      return null;
    }
    if (!eqConstTime(sigBuf, this.sign(`${header}.${payload}`))) return null; // tampered
    let claims: unknown;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (typeof claims !== 'object' || claims === null) return null;
    const c = claims as Record<string, unknown>;
    if (typeof c.sub !== 'string' || typeof c.iat !== 'number' || typeof c.exp !== 'number') {
      return null;
    }
    if (nowSec >= c.exp) return null; // expired
    return { sub: c.sub, iat: c.iat, exp: c.exp };
  }
}
