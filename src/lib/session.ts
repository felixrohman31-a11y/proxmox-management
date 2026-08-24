import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getSessionSecret } from './secrets';

export const SESSION_COOKIE = 'pc_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionPayload {
  u: string;
  exp: number;
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = { u: username, exp: Date.now() + SESSION_MAX_AGE * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionFromCookies(): SessionPayload | null {
  const jar = cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}
