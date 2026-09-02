import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
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

  try {
    await changeOwnPassword(session.id, oldPassword, newPassword);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'user.changePassword',
    target: session.u
  });
  // Password berubah → pwdVersion naik → sesi saat ini (dan sesi lain akun ini)
  // otomatis tidak valid. Arahkan klien untuk login ulang.
  return NextResponse.json({ ok: true, reauth: true });
}
