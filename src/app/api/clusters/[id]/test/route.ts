import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, canWrite } from '@/lib/session';
import { getPveClient, PveError } from '@/lib/pve';

type Ctx = { params: { id: string } };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  const client = getPveClient(ctx.params.id);
  if (!client) {
    return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  }
  try {
    client.invalidate();
    const version = await client.get<Record<string, unknown>>('/version');
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    const status = e instanceof PveError ? (e.status >= 400 ? e.status : 502) : 502;
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status });
  }
}
