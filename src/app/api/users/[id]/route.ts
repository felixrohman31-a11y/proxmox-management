import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, canOperate } from '@/lib/session';
import { appendAudit } from '@/lib/audit';
import {
  assignableRoles,
  canManageUser,
  deleteUser,
  getUserById,
  resetPassword,
  updateUser,
  type UserRole
} from '@/lib/users';

type Ctx = { params: { id: string } };

function denied(msg = 'Akses ditolak.') {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canOperate(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  if (!canManageUser(session.role, target.role)) {
    return denied('Anda tidak memiliki hak atas user dengan peran ini.');
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }

  const patch: { role?: UserRole; enabled?: boolean; username?: string } = {};
  if (b.role === 'superadmin' || b.role === 'admin' || b.role === 'auditor') {
    // Super admin tidak boleh menurunkan perannya sendiri (self-demote diblokir).
    if (target.id === session.id) {
      return NextResponse.json(
        { error: 'Tidak dapat mengubah peran akun sendiri.' },
        { status: 400 }
      );
    }
    if (!assignableRoles(session.role).includes(b.role)) {
      return denied('Anda tidak memiliki hak untuk memberikan peran ini.');
    }
    patch.role = b.role;
  }
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (typeof b.username === 'string' && b.username.trim()) patch.username = b.username;

  try {
    // Self-edit diperbolehkan bila actor berhak atas peran target; guard "super
    // admin terakhir" di store mencegah actor mengunci dirinya dari sistem.
    const updated = await updateUser(ctx.params.id, patch);
    if (!updated) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'user.update',
      target: updated.username,
      detail: JSON.stringify(patch)
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canOperate(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  if (target.id === session.id) {
    return NextResponse.json({ error: 'Tidak dapat menghapus akun sendiri.' }, { status: 400 });
  }
  if (!canManageUser(session.role, target.role)) {
    return denied('Anda tidak memiliki hak atas user dengan peran ini.');
  }

  try {
    const ok = await deleteUser(ctx.params.id);
    if (!ok) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'user.delete',
      target: target.username
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

// POST /api/users/[id]/reset — reset password oleh operator (tanpa password lama).
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canOperate(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  if (target.id === session.id) {
    return NextResponse.json(
      { error: 'Ganti password sendiri melalui menu Akun.' },
      { status: 400 }
    );
  }
  if (!canManageUser(session.role, target.role)) {
    return denied('Anda tidak memiliki hak atas user dengan peran ini.');
  }

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const newPassword = String(b.password ?? '');
  try {
    const ok = await resetPassword(target.id, newPassword);
    if (!ok) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'user.resetPassword',
      target: target.username
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
