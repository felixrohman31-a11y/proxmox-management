import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getPveClient, PveError } from '@/lib/pve';
import { appendAudit } from '@/lib/audit';
import { checkRateLimit, RateLimitResult } from '@/lib/rate-limit';

type Ctx = { params: { id: string; path: string[] } };

function unauthorized() {
  return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function toError(e: unknown) {
  const status = e instanceof PveError ? (e.status >= 400 ? e.status : 502) : 502;
  return NextResponse.json({ error: (e as Error).message }, { status });
}

function applyRateHeaders(res: NextResponse, rl: RateLimitResult): NextResponse {
  res.headers.set('X-RateLimit-Limit', String(rl.limit));
  res.headers.set('X-RateLimit-Remaining', String(rl.remaining));
  if (rl.retryAfter !== undefined) res.headers.set('Retry-After', String(rl.retryAfter));
  return res;
}

// Rate limit per-IP + per-cluster (CHANGELOG 1.2.0). Dipanggil SEKALI per
// request: kembalikan { response } bila ditolak (429), atau { rl } bila lolos
// agar header yang sama bisa dipasang pada respon sukses (tanpa hit ganda).
function rateLimit(ip: string, clusterId: string, mutating: boolean): { rl: RateLimitResult; response?: never } | { response: NextResponse; rl?: never } {
  const rl = checkRateLimit(ip, clusterId, mutating);
  if (rl.allowed) return { rl };
  const response = NextResponse.json(
    { error: 'Terlalu banyak permintaan ke cluster ini. Coba lagi nanti.' },
    { status: 429 }
  );
  response.headers.set('X-RateLimit-Limit', String(rl.limit));
  response.headers.set('X-RateLimit-Remaining', '0');
  response.headers.set('Retry-After', String(rl.retryAfter));
  return { response };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  const gate = rateLimit(clientIp(req), ctx.params.id, false);
  if (gate.response) return gate.response;

  const target = '/' + ctx.params.path.join('/');
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const data = await client.get(target, query);
    return applyRateHeaders(NextResponse.json({ data }), gate.rl);
  } catch (e) {
    return toError(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  const gate = rateLimit(clientIp(req), ctx.params.id, true);
  if (gate.response) return gate.response;

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
      ip: clientIp(req)
    });
    return applyRateHeaders(NextResponse.json({ data }), gate.rl);
  } catch (e) {
    return toError(e);
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  const gate = rateLimit(clientIp(req), ctx.params.id, true);
  if (gate.response) return gate.response;

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
      ip: clientIp(req)
    });
    return applyRateHeaders(NextResponse.json({ data }), gate.rl);
  } catch (e) {
    return toError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = getSessionFromCookies();
  if (!session) return unauthorized();
  const client = getPveClient(ctx.params.id);
  if (!client) return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  const gate = rateLimit(clientIp(req), ctx.params.id, true);
  if (gate.response) return gate.response;

  const target = '/' + ctx.params.path.join('/');
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  try {
    const data = await client.request('DELETE', target, { query });
    await appendAudit({
      ts: new Date().toISOString(),
      user: session.u,
      action: 'pve.delete',
      target,
      ip: clientIp(req)
    });
    return applyRateHeaders(NextResponse.json({ data }), gate.rl);
  } catch (e) {
    return toError(e);
  }
}
