import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { listClustersSync } from '@/lib/store';
import { slaForCluster, setSlaTarget, setSlaDefaultTarget } from '@/lib/sla';
import { appendAudit } from '@/lib/audit';

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const cluster = listClustersSync().find((c) => c.id === ctx.params.id);
  if (!cluster) {
    return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  }

  const now = new Date();
  const y = Number(req.nextUrl.searchParams.get('year')) || now.getFullYear();
  const m = Number(req.nextUrl.searchParams.get('month')) || now.getMonth() + 1;
  if (m < 1 || m > 12 || y < 2000 || y > 2100) {
    return NextResponse.json({ error: 'Parameter tahun/bulan tidak valid.' }, { status: 400 });
  }

  try {
    const sla = await slaForCluster(cluster, y, m);
    return NextResponse.json(sla);
  } catch (e) {
    return NextResponse.json(
      { error: `Gagal menghitung SLA: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const cluster = listClustersSync().find((c) => c.id === ctx.params.id);
  if (!cluster) {
    return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  }

  let body: { key?: string; target?: number | null; defaultTarget?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    if (typeof body.defaultTarget === 'number') {
      await setSlaDefaultTarget(body.defaultTarget);
      await appendAudit({
        ts: new Date().toISOString(),
        user: session.u || '-',
        action: 'sla.defaultTarget',
        target: String(body.defaultTarget)
      });
    } else if (body.key) {
      const reset = body.target === null || body.target === undefined;
      await setSlaTarget(cluster.id, body.key, reset ? null : Number(body.target));
      await appendAudit({
        ts: new Date().toISOString(),
        user: session.u || '-',
        action: reset ? 'sla.target.reset' : 'sla.target.set',
        target: body.key,
        detail: reset ? undefined : String(body.target)
      });
    } else {
      return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
