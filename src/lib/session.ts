import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getSessionSecret } from './secrets';
import { findUser, type UserRole } from './users';

export const SESSION_COOKIE = 'pc_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  u: string; // username
  role: UserRole;
}

export interface SessionPayload extends SessionUser {
  pwdVersion: number;
  exp: number;
}

export function createSessionToken(user: SessionUser): string {
  const stored = findUser(user.u);
  const payload: SessionPayload = {
    ...user,
    pwdVersion: stored ? stored.pwdVersion : 1,
    exp: Date.now() + SESSION_MAX_AGE * 1000
  };
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

// Ambil sesi dari cookie + pastikan user masih ada, aktif, dan versi password
// masih cocok (invalidasi sesi lama saat password diganti/direset).
export function getSessionFromCookies(): SessionPayload | null {
  const jar = cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const payload = verifySessionToken(raw);
  if (!payload) return null;
  const stored = findUser(payload.u);
  if (!stored || !stored.enabled) return null;
  if (stored.pwdVersion !== payload.pwdVersion) return null;
  // role selalu mengikuti kondisi terkini di store (bukan klaim token lama)
  return { ...payload, role: stored.role, id: stored.id };
}

export function requireSuperAdmin(session: SessionPayload | null): boolean {
  return session !== null && session.role === 'superadmin';
}

// "operator" = superadmin ATAU admin: boleh akses manajemen user & mengubah state
// cluster/VM dll. Auditor (role terbawah) = read-only di mana-mana.
export function canOperate(session: SessionPayload | null): boolean {
  return session !== null && (session.role === 'superadmin' || session.role === 'admin');
}

// "write" = semua aksi yang mengubah state (auditor tidak boleh).
export function canWrite(session: SessionPayload | null): boolean {
  return canOperate(session);
}
