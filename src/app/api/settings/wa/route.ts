import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import {
  ensureScheduler,
  getWaConfig,
  saveWaConfig,
  sendNotification,
  type WaProvider
} from '@/lib/ftp-backup';
import { appendAudit } from '@/lib/audit';

const PROVIDERS: WaProvider[] = ['callmebot', 'fonnte', 'telegram'];

export async function GET() {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  ensureScheduler();
  return NextResponse.json(await getWaConfig());
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

  const raw = String(b.provider ?? 'callmebot');
  if (!PROVIDERS.includes(raw as WaProvider)) {
    return NextResponse.json({ error: 'Provider tidak dikenal.' }, { status: 400 });
  }
  const provider = raw as WaProvider;
  const phone = String(b.phone ?? '').trim().replace(/^\+/, '');
  const chatId = String(b.chatId ?? '').trim();

  if (provider !== 'telegram' && !/^\d{8,16}$/.test(phone)) {
    return NextResponse.json(
      { error: 'Nomor tidak valid. Format internasional tanpa +, contoh: 6281234567890' },
      { status: 400 }
    );
  }
  if (provider === 'telegram' && !/^-?\d+$|^@[\w]{4,}$/.test(chatId)) {
    return NextResponse.json(
      { error: 'Chat ID tidak valid. Contoh angka: 123456789, atau @channelname' },
      { status: 400 }
    );
  }

  await saveWaConfig({
    provider,
    phone,
    chatId,
    apikey: typeof b.apikey === 'string' ? b.apikey : undefined,
    botToken: typeof b.botToken === 'string' ? b.botToken : undefined
  });

  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'settings.wa.save',
    target: `${provider}:${phone || chatId}`
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
    const r = await sendNotification(
      `✅ Test notifikasi ProxCenter — ${new Date().toLocaleString('id-ID', { hour12: false })} WIB`
    );
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: r.ok ? 'notify.test' : 'notify.test.gagal',
      target: 'notifikasi',
      detail: r.message
    });
    return NextResponse.json(r, { status: 200 });
  }
  return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
}
