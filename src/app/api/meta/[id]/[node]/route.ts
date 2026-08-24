import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getCreateMeta } from '@/lib/pve-meta';
import { PveError } from '@/lib/pve';

type Ctx = { params: { id: string; node: string } };

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  try {
    const meta = await getCreateMeta(ctx.params.id, ctx.params.node);
    return NextResponse.json({ data: meta });
  } catch (e) {
    const status = e instanceof PveError ? (e.status >= 400 ? e.status : 502) : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
