import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getPveClient, PveError } from '@/lib/pve';
import { appendAudit } from '@/lib/audit';

type Ctx = { params: { id: string; path: string[] } };

function unauthorized() {
  return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
}

function toError(e: unknown) {
  const status = e instanceof PveError ? (e.status >= 400 ? e.status : 502) : 502;
  return NextResponse.json({ error: (e as Error).message }, { status });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });

  const target = '/' + ctx.params.path.join('/');
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const data = await client.get(target, query);
    return NextResponse.json({ data });
  } catch (e) {
    return toError(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });

  const target = '/' + ctx.params.path.join('/');
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const data = await client.post(target, body);
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'pve.post',
      target,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    });
    return NextResponse.json({ data });
  } catch (e) {
    return toError(e);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });

  const target = '/' + ctx.params.path.join('/');
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const data = await client.request('PUT', target, { body });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'pve.put',
      target,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    });
    return NextResponse.json({ data });
  } catch (e) {
    return toError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });

  const target = '/' + ctx.params.path.join('/');
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const data = await client.request('DELETE', target, { query });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'pve.delete',
      target,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    });
    return NextResponse.json({ data });
  } catch (e) {
    return toError(e);
  }
}
