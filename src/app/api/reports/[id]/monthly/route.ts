import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { gatherMonthlyData } from '@/lib/report-data';
import { buildMonthlyReport } from '@/lib/report';
import { buildMonthlyReportHtml } from '@/lib/report-html';
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
  const format = req.nextUrl.searchParams.get('format') === 'txt' ? 'txt' : 'html';
  const inline = req.nextUrl.searchParams.get('view') === '1';

  try {
    if (format === 'txt') {
      const { filename, content } = await buildMonthlyReport(cluster, y, m);
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    const data = await gatherMonthlyData(cluster, y, m);
    const html = buildMonthlyReportHtml(data);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${`Laporan-Virtualisasi-${cluster.name.replace(/[^a-zA-Z0-9]+/g, '-')}-${y}-${String(m).padStart(2, '0')}`}.html"`
      }
    });
  } catch (e) {
    return NextResponse.json({ error: `Gagal membuat laporan: ${(e as Error).message}` }, { status: 502 });
  }
}
