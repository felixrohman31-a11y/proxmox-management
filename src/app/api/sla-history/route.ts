import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, canWrite } from '@/lib/session';
import { listHistory, deleteSnapshot } from '@/lib/sla-history';
import { captureClusterSnapshot } from '@/lib/sla-alerts';
import { appendAudit } from '@/lib/audit';

function wibYm(): { y: number; m: number } {
  const wib = new Date(Date.now() + 7 * 3600 * 1000);
  return { y: wib.getUTCFullYear(), m: wib.getUTCMonth() + 1 };
}

export async function GET(req: NextRequest) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const c = req.nextUrl.searchParams.get('c');
  if (!c) return NextResponse.json({ error: 'Parameter cluster hilang.' }, { status: 400 });
  return NextResponse.json({ snapshots: listHistory(c) });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const c = typeof b.c === 'string' ? b.c : '';
  if (!c) return NextResponse.json({ error: 'Parameter cluster hilang.' }, { status: 400 });
  const cur = wibYm();
  const y = Number(b.year) || cur.y;
  const m = Number(b.month) || cur.m;
  if (y < 2000 || y > 2100 || m < 1 || m > 12) {
    return NextResponse.json({ error: 'Periode tidak valid.' }, { status: 400 });
  }
  const res = await captureClusterSnapshot(c, y, m);
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'sla.history.capture',
    target: `${y}-${String(m).padStart(2, '0')}`,
    detail: res.ok ? 'tersimpan' : (res.reason ?? 'gagal')
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.reason ?? 'capture_failed' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, snapshot: res.snap });
}

export async function DELETE(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  const c = req.nextUrl.searchParams.get('c');
  const period = req.nextUrl.searchParams.get('period');
  if (!c || !period) return NextResponse.json({ error: 'Parameter hilang.' }, { status: 400 });
  const removed = await deleteSnapshot(c, period);
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'sla.history.delete',
    target: period,
    detail: removed ? 'dihapus' : 'tidak ada'
  });
  return NextResponse.json({ ok: removed });
}
