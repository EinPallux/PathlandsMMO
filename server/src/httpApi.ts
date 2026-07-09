// The account REST surface: register / login (→ session token) and the character cloud
// save (GET/PUT, bearer-authenticated). Kept out of the gateway so the ws sim host and
// the auth API stay separable. Every request is size-capped and the auth endpoints are
// per-IP rate-limited (brute-force backstop). Wall-clock (`nowSec`) is injected.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CharacterSave } from '@pathlands/shared';
import { hashPassword, verifyPassword, type Auth } from './auth.js';
import { normalizeEmail, type Store } from './store.js';

export interface HttpApiConfig {
  authRatePerMin: number;
  maxAuthBodyBytes: number;
  maxCharacterBodyBytes: number;
}

/**
 * CORS headers so the account API is reachable from a client served on a DIFFERENT origin — the
 * documented "static client on Vercel / a dev `vite` server, game server on the VPS" split (the game
 * WebSocket isn't CORS-gated, but these `fetch`es are). Auth is by `Authorization: Bearer` token, not
 * cookies, so a wildcard origin carries no credential-theft risk (no `allow-credentials`).
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', ...CORS_HEADERS });
  res.end(s);
}

/** Read a request body up to `maxBytes`; null if it's too large or the stream errors. */
function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (v: Buffer | null): void => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => finish(Buffer.concat(chunks)));
    req.on('error', () => finish(null));
  });
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const buf = await readBody(req, maxBytes);
  if (buf === null) return undefined;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return undefined;
  }
}

interface Creds {
  email: string;
  password: string;
}

function isCreds(v: unknown): v is Creds {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.email === 'string' && typeof o.password === 'string';
}

function validEmail(email: string): boolean {
  return email.length >= 3 && email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural guard for an uploaded character blob (the trust boundary before storage). */
function isCharacterSave(v: unknown): v is CharacterSave {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.class === 'string' &&
    isNum(o.level) &&
    isNum(o.x) &&
    isNum(o.y) &&
    isNum(o.z) &&
    isNum(o.yaw)
  );
}

export class HttpApi {
  private readonly ipHits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly auth: Auth,
    private readonly store: Store,
    private readonly config: HttpApiConfig,
    private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  /** Handle an account route; returns true if the request was ours (else the gateway 404s). */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = req.url ?? '';
    // CORS preflight for the account routes (a cross-origin client's `fetch` sends OPTIONS first).
    if (req.method === 'OPTIONS' && (url.startsWith('/auth/') || url === '/character')) {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return true;
    }
    if (url === '/auth/register' && req.method === 'POST') {
      await this.register(req, res);
      return true;
    }
    if (url === '/auth/login' && req.method === 'POST') {
      await this.login(req, res);
      return true;
    }
    if (url === '/character' && req.method === 'GET') {
      await this.getCharacter(req, res);
      return true;
    }
    if (url === '/character' && req.method === 'PUT') {
      await this.putCharacter(req, res);
      return true;
    }
    return false;
  }

  private rateLimited(req: IncomingMessage): boolean {
    // Behind nginx every request shares the proxy's address, so this is effectively a
    // global auth cap — a safe conservative default. Per-user limiting comes with
    // trusted X-Forwarded-For handling later.
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = this.nowSec();
    const hit = this.ipHits.get(ip);
    if (hit === undefined || now - hit.windowStart >= 60) {
      this.ipHits.set(ip, { windowStart: now, count: 1 });
      return false;
    }
    hit.count += 1;
    return hit.count > this.config.authRatePerMin;
  }

  private accountIdFrom(req: IncomingMessage): string | null {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const claims = this.auth.verify(header.slice(7), this.nowSec());
    return claims?.sub ?? null;
  }

  private async register(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.rateLimited(req)) return json(res, 429, { error: 'rate_limited' });
    const body = await readJson(req, this.config.maxAuthBodyBytes);
    if (!isCreds(body)) return json(res, 400, { error: 'bad_request' });
    const email = normalizeEmail(body.email);
    if (!validEmail(email) || body.password.length < 8) {
      return json(res, 400, { error: 'invalid_credentials' });
    }
    const hash = await hashPassword(body.password);
    const account = await this.store.createAccount(email, hash);
    if (account === null) return json(res, 409, { error: 'email_taken' });
    json(res, 200, { token: this.auth.issue(account.id, this.nowSec()) });
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.rateLimited(req)) return json(res, 429, { error: 'rate_limited' });
    const body = await readJson(req, this.config.maxAuthBodyBytes);
    if (!isCreds(body)) return json(res, 400, { error: 'bad_request' });
    const account = await this.store.getByEmail(normalizeEmail(body.email));
    if (account === null || !(await verifyPassword(body.password, account.passwordHash))) {
      return json(res, 401, { error: 'invalid_credentials' });
    }
    json(res, 200, { token: this.auth.issue(account.id, this.nowSec()) });
  }

  private async getCharacter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const accountId = this.accountIdFrom(req);
    if (accountId === null) return json(res, 401, { error: 'unauthorized' });
    json(res, 200, { character: await this.store.getCharacter(accountId) });
  }

  private async putCharacter(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const accountId = this.accountIdFrom(req);
    if (accountId === null) return json(res, 401, { error: 'unauthorized' });
    const body = await readJson(req, this.config.maxCharacterBodyBytes);
    if (!isCharacterSave(body)) return json(res, 400, { error: 'bad_character' });
    await this.store.putCharacter(accountId, body);
    json(res, 200, { ok: true });
  }
}
