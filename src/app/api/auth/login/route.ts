import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { appendAudit } from '@/lib/audit';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; lockUntil: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function delayFailure(): Promise<void> {
  return new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);

  if (rec && rec.lockUntil > now) {
    const sisa = Math.ceil((rec.lockUntil - now) / 1000);
    return NextResponse.json(
      { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${sisa} detik.` },
      { status: 429 }
    );
  }

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const { username, password } = body;

  const uname = typeof username === 'string' ? username : '';
  const pass = typeof password === 'string' ? password : '';
  const ok = safeEqual(uname, adminUser) && safeEqual(pass, adminPass);

  if (!ok) {
    const count = (rec ? rec.count : 0) + 1;
    attempts.set(ip, { count, lockUntil: count >= MAX_ATTEMPTS ? now + LOCK_MS : 0 });
    if (attempts.size > 5000) attempts.clear();
    await delayFailure();
    await appendAudit({
      ts: new Date().toISOString(),
      user: uname || '-',
      action: 'login.gagal',
      target: `percobaan ke-${count}`,
      ip
    });
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
  }

  attempts.delete(ip);
  await appendAudit({ ts: new Date().toISOString(), user: uname, action: 'login.ok', target: ip, ip });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken(uname), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
  return res;
}
