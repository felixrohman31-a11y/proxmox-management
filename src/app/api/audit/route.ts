import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { readAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const limitParam = Number(req.nextUrl.searchParams.get('limit'));
  const limit = limitParam > 0 && limitParam <= 1000 ? Math.floor(limitParam) : 200;
  const data = await readAudit(limit);
  return NextResponse.json({ data });
}
