import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { deleteCluster, getStoredCluster, updateCluster } from '@/lib/store';
import { appendAudit } from '@/lib/audit';

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const name = String(b.name ?? '').trim();
  const host = String(b.host ?? '').trim();
  const username = String(b.username ?? '').trim();
  const password = String(b.password ?? '');
  const token = String(b.token ?? '');
  const portNum = Number(b.port);
  const port = portNum > 0 ? Math.floor(portNum) : 8006;
  const insecure = Boolean(b.insecure);
  const authMethod = b.authMethod === 'token' ? 'token' : 'password';

  if (!name || !host || !username) {
    return NextResponse.json({ error: 'Nama, host, dan username wajib diisi.' }, { status: 400 });
  }

  try {
    const updated = await updateCluster(ctx.params.id, {
      name,
      host,
      port,
      username,
      insecure,
      authMethod,
      password: password || undefined,
      token: token || undefined
    });
    if (!updated) {
      return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
    }
    await appendAudit({
      ts: new Date().toISOString(),
      user: getSessionFromCookies()?.u ?? '?',
      action: 'cluster.update',
      target: updated.name
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  try {
    const stored = getStoredCluster(ctx.params.id);
    const ok = await deleteCluster(ctx.params.id);
    if (!ok) {
      return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
    }
    await appendAudit({
      ts: new Date().toISOString(),
      user: getSessionFromCookies()?.u ?? '?',
      action: 'cluster.delete',
      target: stored?.name ?? ctx.params.id
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
