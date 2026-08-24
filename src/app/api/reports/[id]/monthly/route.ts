import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { gatherMonthlyData } from '@/lib/report-data';
import { buildMonthlyReport } from '@/lib/report';
import { buildMonthlyReportHtml, buildConsolidatedReportHtml, type ConsolidatedItem } from '@/lib/report-html';
import { listClustersSync } from '@/lib/store';

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!getSessionFromCookies()) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 });
  }
  const clusters = listClustersSync();
  if (!clusters.length) {
    return NextResponse.json({ error: 'Belum ada cluster terdaftar.' }, { status: 400 });
  }

  const now = new Date();
  const y = Number(req.nextUrl.searchParams.get('year')) || now.getFullYear();
  const m = Number(req.nextUrl.searchParams.get('month')) || now.getMonth() + 1;
  if (m < 1 || m > 12 || y < 2000 || y > 2100) {
    return NextResponse.json({ error: 'Parameter tahun/bulan tidak valid.' }, { status: 400 });
  }
  const format = req.nextUrl.searchParams.get('format') === 'txt' ? 'txt' : 'html';
  const inline = req.nextUrl.searchParams.get('view') === '1';
  const isAll = ctx.params.id === 'all';

  try {
    if (!isAll) {
      const cluster = clusters.find((c) => c.id === ctx.params.id);
      if (!cluster) {
        return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
      }
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
      return htmlResponse(buildMonthlyReportHtml(data), cluster.name, y, m, inline);
    }

    // ===== mode gabungan seluruh cluster =====
    const items: ConsolidatedItem[] = [];
    for (const cluster of clusters) {
      try {
        items.push({ cluster, data: await gatherMonthlyData(cluster, y, m) });
      } catch (e) {
        items.push({ cluster, error: (e as Error).message });
      }
    }

    if (format === 'txt') {
      const parts: string[] = [];
      for (const it of items) {
        if (it.error) {
          parts.push(`##### ${it.cluster.name} — GAGAL: ${it.error} #####`);
          continue;
        }
        const { content } = await buildMonthlyReport(it.cluster, y, m);
        parts.push(`########## CLUSTER: ${it.cluster.name} ##########\r\n\r\n${content}`);
      }
      return new NextResponse(parts.join('\r\n\r\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="Laporan-Virtualisasi-Semua-Cluster-${y}-${String(m).padStart(2, '0')}.txt"`
        }
      });
    }

    return htmlResponse(buildConsolidatedReportHtml(y, m, items), 'Semua-Cluster', y, m, inline);
  } catch (e) {
    return NextResponse.json({ error: `Gagal membuat laporan: ${(e as Error).message}` }, { status: 502 });
  }
}

function htmlResponse(html: string, name: string, y: number, m: number, inline: boolean): NextResponse {
  const slug = name.replace(/[^a-zA-Z0-9]+/g, '-');
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${`Laporan-Virtualisasi-${slug}-${y}-${String(m).padStart(2, '0')}`}.html"`
    }
  });
}
