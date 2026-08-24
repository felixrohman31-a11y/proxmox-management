import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { buildMonthlyReport } from '@/lib/report';
import { listClustersSync } from '@/lib/store';

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const cluster = listClustersSync().find((c) => c.id === ctx.params.id);
  if (!cluster) {
    return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
  }

  const now = new Date();
  const y = Number(req.nextUrl.searchParams.get('year')) || now.getFullYear();
  const m = Number(req.nextUrl.searchParams.get('month')) || now.getMonth() + 1;
  if (m < 1 || m > 12 || y < 2000 || y > 2100) {
    return NextResponse.json({ error: 'Parameter tahun/bulan tidak valid.' }, { status: 400 });
  }

  try {
    const { filename, content } = await buildMonthlyReport(cluster, y, m);
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
