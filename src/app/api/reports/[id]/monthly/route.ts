import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { gatherMonthlyData, ymdToEpochWIB } from '@/lib/report-data';
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
  // Rentang periode: prioritas start/end (YYYY-MM-DD), fallback year/month.
  const startParam = req.nextUrl.searchParams.get('start');
  const endParam = req.nextUrl.searchParams.get('end');
  let startEpoch: number;
  let endEpoch: number;
  const yDef = now.getFullYear();
  const mDef = now.getMonth() + 1;
  if (startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)) {
    const [sy, sm, sd] = startParam.split('-').map(Number);
    startEpoch = ymdToEpochWIB(sy, sm, sd);
    if (endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
      const [ey, em, ed] = endParam.split('-').map(Number);
      endEpoch = ymdToEpochWIB(ey, em, ed + 1); // eksklusif: sertakan hari terakhir penuh
    } else {
      endEpoch = ymdToEpochWIB(sy, sm, sd + 1);
    }
  } else {
    const y = Number(req.nextUrl.searchParams.get('year')) || yDef;
    const m = Number(req.nextUrl.searchParams.get('month')) || mDef;
    if (m < 1 || m > 12 || y < 2000 || y > 2100) {
      return NextResponse.json({ error: 'Parameter tahun/bulan tidak valid.' }, { status: 400 });
    }
    startEpoch = ymdToEpochWIB(y, m, 1);
    endEpoch = ymdToEpochWIB(y, m + 1, 1);
  }
  const format = req.nextUrl.searchParams.get('format') === 'txt' ? 'txt' : 'html';
  const inline = req.nextUrl.searchParams.get('view') === '1';
  const isAll = ctx.params.id === 'all';
  const locale = (req.nextUrl.searchParams.get('locale') ?? 'id') as 'id' | 'en';

  try {
    if (!isAll) {
      const cluster = clusters.find((c) => c.id === ctx.params.id);
      if (!cluster) {
        return NextResponse.json({ error: 'Cluster tidak ditemukan.' }, { status: 404 });
      }
      if (format === 'txt') {
        const { filename, content } = await buildMonthlyReport(cluster, startEpoch, endEpoch, locale);
        return new NextResponse(content, {
          status: 200,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        });
      }
      const data = await gatherMonthlyData(cluster, startEpoch, endEpoch);
      return htmlResponse(buildMonthlyReportHtml(data, locale), cluster.name, startEpoch, endEpoch, inline);
    }

    // ===== mode gabungan seluruh cluster =====
    const items: ConsolidatedItem[] = [];
    for (const cluster of clusters) {
      try {
        items.push({ cluster, data: await gatherMonthlyData(cluster, startEpoch, endEpoch) });
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
        const { content } = await buildMonthlyReport(it.cluster, startEpoch, endEpoch, locale);
        parts.push(`########## CLUSTER: ${it.cluster.name} ##########\r\n\r\n${content}`);
      }
      const d1 = new Date(startEpoch * 1000);
      const d2 = new Date(endEpoch * 1000);
      const ds = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      return new NextResponse(parts.join('\r\n\r\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="Laporan-Virtualisasi-Semua-Cluster-${ds(d1)}_${ds(d2)}.txt"`
        }
      });
    }

    return htmlResponse(buildConsolidatedReportHtml(startEpoch, endEpoch, items, locale), 'Semua-Cluster', startEpoch, endEpoch, inline);
  } catch (e) {
    return NextResponse.json({ error: `Gagal membuat laporan: ${(e as Error).message}` }, { status: 502 });
  }
}

function htmlResponse(html: string, name: string, startEpoch: number, endEpoch: number, inline: boolean): NextResponse {
  const slug = name.replace(/[^a-zA-Z0-9]+/g, '-');
  const d1 = new Date(startEpoch * 1000);
  const d2 = new Date(endEpoch * 1000);
  const ds = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${`Laporan-Virtualisasi-${slug}-${ds(d1)}_${ds(d2)}`}.html"`
    }
  });
}
