import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies, canWrite } from '@/lib/session';
import { getWaConfig, getSlaAlertConfig, saveSlaAlertConfig } from '@/lib/ftp-backup';
import { runSlaCycle, ensureSlaScheduler } from '@/lib/sla-alerts';
import { appendAudit } from '@/lib/audit';

export async function GET() {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const [cfg, wa] = await Promise.all([getSlaAlertConfig(), getWaConfig()]);
  return NextResponse.json({ enabled: cfg.enabled, waReady: wa.hasSecret });
}

export async function PUT(req: NextRequest) {
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
  const cfg = await saveSlaAlertConfig({ enabled: Boolean(b.enabled) });
  if (cfg.enabled) ensureSlaScheduler();
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'settings.sla.alert',
    target: 'alert-sla',
    detail: cfg.enabled ? 'aktif' : 'nonaktif'
  });
  return NextResponse.json({ ok: true, enabled: cfg.enabled });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  if (!canWrite(session)) {
    return NextResponse.json({ error: 'Akses ditolak. Peran read-only.' }, { status: 403 });
  }
  if (req.nextUrl.searchParams.get('action') !== 'run') {
    return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
  }
  ensureSlaScheduler();
  const r = await runSlaCycle(true);
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'settings.sla.alert.run',
    target: 'alert-sla',
    detail: `${r.alerts} alert · ${r.captured} snapshot · ${r.message ?? ''}`
  });
  return NextResponse.json(r);
}
