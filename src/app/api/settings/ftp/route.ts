import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import {
  ensureScheduler,
  getBackupState,
  getFtpSettings,
  runFtpBackup,
  saveFtpSettings,
  testFtp
} from '@/lib/ftp-backup';
import { appendAudit } from '@/lib/audit';

export async function GET() {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  ensureScheduler();
  return NextResponse.json({ settings: getFtpSettings(), state: await getBackupState() });
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
  const host = String(b.host ?? '').trim();
  if (!host) return NextResponse.json({ error: 'Host FTP wajib diisi.' }, { status: 400 });
  const port = Number(b.port) > 0 ? Math.floor(Number(b.port)) : 21;
  const username = String(b.username ?? '').trim();
  const directory = String(b.directory ?? '').trim();
  const password = typeof b.password === 'string' ? b.password : '';
  const passive = b.passive !== false;
  const autoDaily = Boolean(b.autoDaily);

  await saveFtpSettings({
    host,
    port,
    username,
    directory,
    passive,
    autoDaily,
    password: password || undefined
  });
  await appendAudit({
    ts: new Date().toISOString(),
    user: session.u,
    action: 'settings.ftp.save',
    target: `${host}:${port}${directory ? '/' + directory : ''}`
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  ensureScheduler();

  const action = req.nextUrl.searchParams.get('action');
  if (action === 'test') {
    const r = await testFtp();
    return NextResponse.json(r, { status: 200 });
  }
  if (action === 'run') {
    const r = await runFtpBackup('manual');
    return NextResponse.json(r, { status: 200 });
  }
  return NextResponse.json({ error: 'Aksi tidak dikenal.' }, { status: 400 });
}
