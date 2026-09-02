import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, requireAdmin } from '@/lib/session';
import { appendAudit } from '@/lib/audit';
import { createUser, listUsers, type UserRole } from '@/lib/users';

function denied() {
  return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
}

export async function GET() {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!requireAdmin(session)) return denied();
  return NextResponse.json({ data: listUsers() });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!requireAdmin(session)) return denied();

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const username = String(b.username ?? '');
  const password = String(b.password ?? '');
  const role: UserRole = b.role === 'viewer' ? 'viewer' : 'admin';
  const enabled = b.enabled !== false;

  try {
    const created = await createUser({ username, password, role, enabled });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'user.create',
      target: created.username,
      detail: `role ${created.role}`
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
