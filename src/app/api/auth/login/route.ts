import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';
import { appendAudit } from '@/lib/audit';
import { findUser, seedAdminUser, verifyPassword } from '@/lib/users';

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
  seedAdminUser();
  const { username, password } = body;
  const uname = typeof username === 'string' ? username.trim() : '';
  const pass = typeof password === 'string' ? password : '';

  // Verifikasi terhadap store user (hash scrypt). Fallback env hanya bila
  // store sama sekali tidak terbaca / user belum tersimpan (keadaan darurat).
  const user = uname ? findUser(uname) : undefined;
  const ok = user ? verifyPassword(user, pass) : false;
  const envOk =
    !user &&
    safeEqual(uname, (process.env.ADMIN_USER || 'admin').trim()) &&
    safeEqual(pass, process.env.ADMIN_PASSWORD || 'admin123');

  const lockedDisabled = user && !user.enabled;

  if (!ok && !envOk) {
    const count = (rec ? rec.count : 0) + 1;
    attempts.set(ip, { count, lockUntil: count >= MAX_ATTEMPTS ? now + LOCK_MS : 0 });
    if (attempts.size > 5000) attempts.clear();
    await delayFailure();
    await appendAudit({
      ts: new Date().toISOString(),
      user: uname || '-',
      action: 'login.gagal',
      target: lockedDisabled ? 'akun dinonaktifkan' : `percobaan ke-${count}`,
      ip
    });
    return NextResponse.json({ error: 'Username atau password salah.' }, { status: 401 });
  }

  attempts.delete(ip);
  const uName = user ? user.username : (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
  const role = user ? user.role : 'superadmin';
  await appendAudit({ ts: new Date().toISOString(), user: uName, action: 'login.ok', target: ip, ip });
  // Secure cookie hanya saat koneksi benar-benar HTTPS (langsung atau lewat
  // proxy yang meneruskan x-forwarded-proto). Ini membuat sesi tetap bekerja
  // saat diakses via http://localhost dalam mode production (next start).
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || '';
  const secure = proto === 'https' || req.nextUrl.protocol === 'https:';
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionToken({ id: user?.id ?? '', u: uName, role }), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE
  });
  return res;
}
