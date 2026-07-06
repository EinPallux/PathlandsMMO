// The browser side of the account REST API (Phase-6 accounts). Talks to the same host
// the ws server runs on: the `wss://host` game URL maps to `https://host` for HTTP. Opt-in
// like the rest of the netcode — only used when a server is configured.

import type { CharacterSave } from '@pathlands/shared';

/** `wss://host[/..]` → `https://host` (and `ws://` → `http://`) for the REST endpoints. */
export function httpBase(serverUrl: string): string {
  try {
    const url = new URL(serverUrl);
    url.protocol =
      url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
    return url.origin;
  } catch {
    return serverUrl;
  }
}

export type AuthResult = { ok: true; token: string } | { ok: false; error: string };

async function auth(
  serverUrl: string,
  path: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${httpBase(serverUrl)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    if (body && typeof body.token === 'string') return { ok: true, token: body.token };
    return { ok: false, error: 'Unexpected server response.' };
  }
  // Map the server's error codes to friendly copy.
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  const code = body?.error ?? `http_${res.status}`;
  const messages: Record<string, string> = {
    email_taken: 'That email is already registered.',
    invalid_credentials: 'Incorrect email or password.',
    bad_request: 'Please enter an email and password.',
    rate_limited: 'Too many attempts — please wait a minute.',
  };
  return { ok: false, error: messages[code] ?? 'Sign-in failed. Please try again.' };
}

export function register(serverUrl: string, email: string, password: string): Promise<AuthResult> {
  return auth(serverUrl, '/auth/register', email, password);
}

export function login(serverUrl: string, email: string, password: string): Promise<AuthResult> {
  return auth(serverUrl, '/auth/login', email, password);
}

/** Fetch the account's stored character, or null (none saved / unauthorised / offline). */
export async function fetchCharacter(
  serverUrl: string,
  token: string,
): Promise<CharacterSave | null> {
  try {
    const res = await fetch(`${httpBase(serverUrl)}/character`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { character: CharacterSave | null };
    return body.character;
  } catch {
    return null;
  }
}

/** Upload the local character to the account (best-effort cloud save migration). */
export async function putCharacter(
  serverUrl: string,
  token: string,
  character: CharacterSave,
): Promise<boolean> {
  try {
    const res = await fetch(`${httpBase(serverUrl)}/character`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(character),
    });
    return res.ok;
  } catch {
    return false;
  }
}
