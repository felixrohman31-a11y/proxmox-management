import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, requireAdmin } from '@/lib/session';
import { appendAudit } from '@/lib/audit';
import { deleteUser, getUserById, resetPassword, updateUser, type UserRole } from '@/lib/users';

type Ctx = { params: { id: string } };

function denied() {
  return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!requireAdmin(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }

  // Admin tidak boleh mengubah role/status dirinya sendiri lewat panel (hindari
  // terkunci: admin terakhir dilindungi store, dan menonaktifkan diri sendiri
  // akan memutus sesi). Ganti password sendiri lewat /api/account/password.
  if (target.id === session.id) {
    return NextResponse.json(
      { error: 'Tidak dapat mengubah akun sendiri di sini. Gunakan menu Akun untuk mengganti password.' },
      { status: 400 }
    );
  }

  const patch: { role?: UserRole; enabled?: boolean; username?: string } = {};
  if (b.role === 'admin' || b.role === 'viewer') patch.role = b.role as UserRole;
  if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
  if (typeof b.username === 'string' && b.username.trim()) patch.username = b.username;

  try {
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
  if (!requireAdmin(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  if (target.id === session.id) {
    return NextResponse.json({ error: 'Tidak dapat menghapus akun sendiri.' }, { status: 400 });
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

// POST /api/users/[id]/reset — reset password oleh admin (tanpa password lama).
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!requireAdmin(session)) return denied();

  const target = getUserById(ctx.params.id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan.' }, { status: 404 });
  if (target.id === session.id) {
    return NextResponse.json(
      { error: 'Ganti password sendiri melalui menu Akun.' },
      { status: 400 }
    );
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
