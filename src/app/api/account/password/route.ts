import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionFromCookies,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE
} from '@/lib/session';
import { appendAudit } from '@/lib/audit';
import { changeOwnPassword } from '@/lib/users';

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const oldPassword = String(b.oldPassword ?? '');
  const newPassword = String(b.newPassword ?? '');
  // Putuskan sesi aktif lain? (default true)
  const invalidateSessions = b.invalidateSessions !== false;

  try {
    await changeOwnPassword(session.id, oldPassword, newPassword, invalidateSessions);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'user.changePassword',
    target: session.u
  });

  // Terbitkan ulang token sesi perangkat ini (pwdVersion terkini) supaya pengguna
  // tetap login; perangkat lain terpengaruh sesuai opsi invalidateSessions.
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || '';
  const secure = proto === 'https' || req.nextUrl.protocol === 'https:';
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    createSessionToken({ id: session.id, u: session.u, role: session.role }),
    { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_MAX_AGE }
  );
  return res;
}
