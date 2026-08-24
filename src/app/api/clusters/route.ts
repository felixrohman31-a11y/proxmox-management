import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { createCluster, listClustersSync } from '@/lib/store';
import { appendAudit } from '@/lib/audit';

export async function GET() {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  return NextResponse.json({ data: listClustersSync() });
}

export async function POST(req: NextRequest) {
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
  if (authMethod === 'password' && !password) {
    return NextResponse.json({ error: 'Password wajib diisi untuk metode User & Password.' }, { status: 400 });
  }
  if (authMethod === 'token' && !token) {
    return NextResponse.json({ error: 'API Token wajib diisi untuk metode API Token.' }, { status: 400 });
  }

  try {
    const created = await createCluster({
      name,
      host,
      port,
      username,
      insecure,
      authMethod,
      password: authMethod === 'password' ? password : undefined,
      token: authMethod === 'token' ? token : undefined
    });
    await appendAudit({
      ts: new Date().toISOString(),
      user: getSessionFromCookies()?.u ?? '?',
      action: 'cluster.create',
      target: name,
      detail: `${host}:${port} (${authMethod})`
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
