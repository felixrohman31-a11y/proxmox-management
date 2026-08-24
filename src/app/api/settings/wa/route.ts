import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import {
  ensureScheduler,
  getWaConfig,
  saveWaConfig,
  sendWhatsApp
} from '@/lib/ftp-backup';
import { appendAudit } from '@/lib/audit';

export async function GET() {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  ensureScheduler();
  const cfg = await getWaConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid.' }, { status: 400 });
  }
  const phone = String(b.phone ?? '').trim();
  if (!/^\+?\d{8,16}$/.test(phone)) {
    return NextResponse.json(
      { error: 'Nomor tidak valid. Format internasional tanpa tanda +, contoh: 6281234567890' },
      { status: 400 }
    );
  }
  const apikey = typeof b.apikey === 'string' ? b.apikey.trim() : '';
  await saveWaConfig({ phone: phone.replace(/^\+/, ''), apikey: apikey || undefined });
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'settings.wa.save',
    target: phone
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  ensureScheduler();

  if (req.nextUrl.searchParams.get('action') === 'test') {
    const r = await sendWhatsApp(
      `✅ Test notifikasi ProxCenter — ${new Date().toLocaleString('id-ID', { hour12: false })} WIB`
    );
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: r.ok ? 'notify.test' : 'notify.test.gagal',
      target: 'whatsapp',
      detail: r.message
    });
    return NextResponse.json(r, { status: 200 });
  }
  return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
}
