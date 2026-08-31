import { fmtBytesShort, svgAreaChart } from './report-svg';
import type { MonthlyData } from './report-data';
import { fmtDowntime, type SlaRow } from './sla';
import type { PublicCluster } from '@/types';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BULAN = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function chartBlock(d: MonthlyData): string {
  const chartsPerNode = d.nodes
    .filter((n) => (d.nodeSeries[n.node]?.length ?? 0) > 1)
    .map(
      (n) => `
      <h3 style="margin:16px 0 8px">Node ${esc(n.node)}</h3>
      <div class="chartgrid">
        <div class="chartbox">
          <div class="ctitle">Beban CPU (%)</div>
          ${svgAreaChart(d.nodeSeries[n.node], [{ key: 'cpu', label: 'CPU', color: '#ea580c' }], (v) => `${Math.round(v)}%`)}
        </div>
        <div class="chartbox">
          <div class="ctitle">Memori</div>
          ${svgAreaChart(
            d.nodeSeries[n.node],
            [
              { key: 'memG', label: 'Terpakai', color: '#0284c7' },
              { key: 'memTotG', label: 'Total', color: '#94a3b8' }
            ],
            (v) => `${v.toFixed(0)} GB`
          )}
        </div>
      </div>`
    )
    .join('');

  let netAgg: Array<{ t: number; [k: string]: number | null }> = [];
  const firstKey = Object.keys(d.nodeSeries)[0];
  if (firstKey && d.nodeSeries[firstKey].length > 1 && Object.keys(d.nodeSeries).length > 0) {
    const base = d.nodeSeries[firstKey];
    for (let i = 0; i < base.length; i++) {
      let ni = 0;
      let no = 0;
      for (const n of Object.keys(d.nodeSeries)) {
        const row = d.nodeSeries[n][i];
        if (row && typeof row.netin === 'number') ni += row.netin;
        if (row && typeof row.netout === 'number') no += row.netout;
      }
      netAgg.push({ t: base[i].t, netin: ni, netout: no });
    }
  }

  return (
    chartsPerNode +
    (netAgg.length > 1
      ? `<div class="chartbox" style="margin-top:14px"><div class="ctitle">Network Total</div>${svgAreaChart(
          netAgg,
          [
            { key: 'netin', label: 'In', color: '#16a34a' },
            { key: 'netout', label: 'Out', color: '#4f46e5' }
          ],
          (v) => fmtBytesShort(v)
        )}</div>`
      : '')
  );
}

function guestTable(d: MonthlyData): string {
  const rows = d.guests
    .slice(0, 30)
    .map(
      (g) => `<tr><td>${esc(g.status)}</td><td><b>${esc(g.name)}</b></td><td style="text-align:center">${g.vmid}</td><td>${esc(g.node)}</td><td style="text-align:right">${esc(g.memPct)}</td></tr>`
    )
    .join('');
  return `<table><tr><th>Status</th><th>Nama</th><th style="text-align:center">ID</th><th>Node</th><th style="text-align:right">Memori</th></tr>${rows}</table>${
    d.guests.length > 30 ? `<p><i>… dan ${d.guests.length - 30} lainnya.</i></p>` : ''
  }`;
}

function storageTable(d: MonthlyData): string {
  const rows = d.storages
    .map((s) => {
      const color = s.pct >= 85 ? '#dc2626' : s.pct >= 70 ? '#d97706' : '#059669';
      return `<tr><td><b>${esc(s.storage)}</b></td><td>${esc(s.node)}</td><td>${esc(s.total)}</td>
        <td style="min-width:170px"><div style="background:#e2e8f0;border-radius:6px;height:10px;width:100%"><div style="width:${Math.min(100, s.pct)}%;height:10px;border-radius:6px;background:${color}"></div></div></td>
        <td style="text-align:right">${s.pct}%</td><td style="color:${color};font-weight:600">${s.pct >= 85 ? 'KRITIS' : s.pct >= 70 ? 'Waspada' : 'Aman'}</td></tr>`;
    })
    .join('');
  return `<table><tr><th>Storage</th><th>Node</th><th>Total</th><th>Terpakai</th><th style="text-align:right">%</th><th>Kategori</th></tr>${rows}</table>`;
}

function nodeTable(d: MonthlyData): string {
  const rows = d.nodes
    .map(
      (n) => `<tr><td><b>${esc(n.node)}</b></td><td>${
        n.status === 'online' ? '<span style="color:#059669;font-weight:600">AKTIF</span>' : '<span style="color:#dc2626;font-weight:600">TIDAK AKTIF</span>'
      }</td><td>${esc(n.uptimeDays)}</td><td style="text-align:right">${n.cpuPct}%</td><td style="text-align:right">${n.memPct}% (${esc(n.memUsed)} / ${esc(n.memTotal)})</td></tr>`
    )
    .join('');
  return `<table><tr><th>Node</th><th>Status</th><th>Operasional</th><th style="text-align:right">CPU</th><th style="text-align:right">Memori</th></tr>${rows}</table>`;
}

function failedBlock(d: MonthlyData): string {
  if (!d.failedTasks.length)
    return '<p>Tidak ada kegagalan proses teknis yang tercatat pada periode ini.</p>';
  return `<ul>${d.failedTasks
    .map((f) => `<li><code>${esc(f.type)}</code> — ${esc(f.date)} · status: ${esc(f.status)}</li>`)
    .join('')}</ul>`;
}

function recommendationItems(d: MonthlyData): string[] {
  const out: string[] = [];
  for (const s of d.storages.filter((x) => x.pct >= 85))
    out.push(`Segera tambah/bersihkan kapasitas penyimpanan <b>${esc(s.storage)}</b> node ${esc(s.node)} (terpakai ${s.pct}%).`);
  for (const s of d.storages.filter((x) => x.pct >= 70 && x.pct < 85))
    out.push(`Pantau kapasitas <b>${esc(s.storage)}</b> (${s.pct}%) dan rencanakan penambahan ruang.`);
  const offline = d.nodes.filter((n) => n.status !== 'online');
  if (offline.length) out.push(`Periksa server fisik tidak aktif: ${offline.map((n) => esc(n.node)).join(', ')}.`);
  if (d.failedTasks.length) out.push('Tinjau proses yang gagal agar tidak berulang bulan depan.');
  const stopped = d.guests.filter((g) => !['BERJALAN', 'template'].includes(g.status));
  if (stopped.length) out.push(`Konfirmasi apakah ${stopped.length} mesin yang mati memang sudah tidak digunakan.`);
  return out;
}

function slaSection(d: MonthlyData, withLetter = true): string {
  if (!d.sla) return '';
  const s = d.sla;
  const title = withLetter
    ? '<h2>G. Service Level Agreement (SLA)</h2>'
    : '<h3 style="font-size:14px;margin-top:14px;color:#334155">Service Level Agreement (SLA)</h3>';
  if (!s.summary.tracked) return `${title}<p>Belum ada data SLA untuk periode ini.</p>`;

  const statusCell = (r: SlaRow) =>
    r.status === 'ok'
      ? '<span style="color:#059669;font-weight:600">MEMENUHI</span>'
      : r.status === 'breach'
        ? '<span style="color:#dc2626;font-weight:600">MELANGGAR</span>'
        : '<span style="color:#64748b">tidak ada data</span>';

  const table = (rows: SlaRow[], worstFirst = false) => {
    const list = worstFirst
      ? [...rows].sort((a, b) => (a.actualPct ?? 999) - (b.actualPct ?? 999)).slice(0, 15)
      : rows;
    const trs = list
      .map(
        (r) => `<tr><td><b>${esc(r.name)}</b>${r.vmid != null ? ` <span style="color:#64748b">(${r.vmid})</span>` : ''}</td><td>${esc(r.node)}</td><td style="text-align:right">${r.target.toFixed(2)}%</td><td style="text-align:right">${r.actualPct === null ? '—' : `${r.actualPct.toFixed(2)}%`}</td><td style="text-align:right">${fmtDowntime(r.downtimeMin, false)}</td><td>${statusCell(r)}</td></tr>`
      )
      .join('');
    return `<table><tr><th>Nama</th><th>Node</th><th style="text-align:right">Target</th><th style="text-align:right">Aktual</th><th style="text-align:right">Downtime</th><th>Status</th></tr>${trs}</table>`;
  };

  return `${title}
  <p>Rata-rata ketersediaan <b>${s.summary.avgPct === null ? '—' : `${s.summary.avgPct.toFixed(2)}%`}</b> — ${s.summary.compliant} dari ${s.summary.tracked} entitas memenuhi target, ${s.summary.breach} melanggar. Total downtime: <b>${fmtDowntime(s.summary.totalDowntimeMin, false)}</b>.</p>
  <p style="margin-bottom:4px"><b>Node fisik:</b></p>
  ${table(s.nodes)}
  <p style="margin:10px 0 4px"><b>VM &amp; container (ketersediaan terendah dulu, maks 15):</b></p>
  ${table(s.guests, true)}
  <p style="font-size:11.5px;color:#94a3b8">Dihitung dari data monitoring Proxmox ±30 hari terakhir; gap sampel dianggap downtime.</p>`;
}

function detailSections(d: MonthlyData, withTitles = true): string {
  const t = (s: string) => (withTitles ? `<h2>${s}</h2>` : '');
  return `
    ${t('Kondisi Server Fisik')}${nodeTable(d)}
    ${t('Mesin Virtual & Container')}${guestTable(d)}
    ${t('Kapasitas Penyimpanan')}${storageTable(d)}
    ${t('Catatan Kejadian Penting')}${failedBlock(d)}`;
}

function page(title: string, sub: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;background:#f1f5f9;margin:0;padding:24px}
  .page{max-width:940px;margin:0 auto;background:#fff;border-radius:14px;padding:36px 42px;box-shadow:0 2px 12px rgba(15,23,42,.08)}
  h1{font-size:21px;margin:0 0 2px}
  .sub{color:#64748b;font-size:13px;margin-bottom:14px}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;color:#fff;font-weight:700;font-size:13px;letter-spacing:.3px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
  th{text-align:left;background:#f1f5f9;padding:7px 9px;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#475569}
  td{padding:7px 9px;border-bottom:1px solid #f1f5f9}
  h2{font-size:16px;margin:26px 0 6px;padding-bottom:5px;border-bottom:2px solid #f97316;display:inline-block}
  h3{font-size:13.5px;margin:0 0 6px;color:#334155}
  .chartgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .chartbox{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff}
  .ctitle{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px}
  ul{margin:6px 0;padding-left:22px;font-size:13.5px;line-height:1.65}
  p{font-size:13.5px;line-height:1.6}
  code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
  .errbox{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:10px 14px;font-size:13px}
  @media print{
    body{background:#fff;padding:0}
    .page{box-shadow:none;max-width:100%}
    .noprint{display:none}
  }
</style>
</head>
<body>
<div class="page">
  <h1>${esc(title)}</h1>
  <div class="sub">${sub}</div>
  <p class="noprint"><button onclick="window.print()" style="padding:7px 16px;border:0;border-radius:8px;background:#ea580c;color:#fff;font-weight:600;cursor:pointer">Cetak / Simpan PDF</button></p>
  ${body}
  <p style="margin-top:28px;font-size:11.5px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px">
    Dokumen dihasilkan otomatis oleh Proxmox Management — data diambil langsung dari Proxmox VE pada saat pembuatan.
  </p>
</div>
</body>
</html>`;
}

export function buildMonthlyReportHtml(d: MonthlyData): string {
  const running = d.guests.filter((g) => g.status === 'BERJALAN');
  const stopped = d.guests.filter((g) => !['BERJALAN', 'template'].includes(g.status));
  const online = d.nodes.filter((n) => n.status === 'online');
  const kritis = d.storages.filter((s) => s.pct >= 85);
  const waspada = d.storages.filter((s) => s.pct >= 70 && s.pct < 85);

  const alasan: string[] = [];
  if (online.length < d.nodes.length) alasan.push(`${d.nodes.length - online.length} server fisik tidak aktif`);
  if (kritis.length) alasan.push(`${kritis.length} penyimpanan berstatus KRITIS (>85%)`);
  if (waspada.length) alasan.push(`${waspada.length} penyimpanan mulai penuh (70-85%)`);
  if (d.failedTasks.length) alasan.push(`${d.failedTasks.length} proses teknis gagal bulan ini`);
  if (stopped.length) alasan.push(`${stopped.length} mesin dalam keadaan mati`);

  const kondisi =
    alasan.length === 0 ? 'SEHAT' : kritis.length ? 'PERLU TINDAK LANJUT SEGERA' : 'CENDERUNG SEHAT, ADA CATATAN';
  const badgeColor =
    kondisi === 'SEHAT' ? '#059669' : kondisi.startsWith('PERLU TINDAK') ? '#dc2626' : '#d97706';

  const body = `
  <h2>A. Ringkasan untuk Pimpinan</h2>
  <p>Kondisi umum infrastruktur: <span class="badge" style="background:${badgeColor}">${kondisi}</span></p>
  <table>
    <tr><th>Indikator</th><th style="text-align:right">Nilai</th></tr>
    <tr><td>Server fisik aktif</td><td style="text-align:right">${online.length} dari ${d.nodes.length}</td></tr>
    <tr><td>Mesin berjalan</td><td style="text-align:right">${running.length} dari ${d.guests.length}</td></tr>
    ${
      d.sla && d.sla.summary.avgPct !== null
        ? `<tr><td>SLA rata-rata bulan ini</td><td style="text-align:right">${d.sla.summary.avgPct.toFixed(2)}% (${d.sla.summary.compliant}/${d.sla.summary.tracked} memenuhi)</td></tr>`
        : ''
    }
    <tr><td>Proses teknis bulan ini</td><td style="text-align:right">${d.taskTotal} (gagal: ${d.failedTasks.length})</td></tr>
    <tr><td>Aktivitas administrasi panel</td><td style="text-align:right">${d.auditCount} aksi tercatat</td></tr>
  </table>
  ${alasan.length ? `<p><b>Perlu diperhatikan:</b></p><ul>${alasan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}

  <h2>B. Grafik Tren (30 hari terakhir)</h2>
  ${chartBlock(d)}

  ${detailSections(d, false)
    .replace('Kondisi Server Fisik', 'C. Kondisi Server Fisik')
    .replace('Mesin Virtual &amp; Container', 'D. Mesin Virtual &amp; Container')
    .replace('Kapasitas Penyimpanan', 'E. Kapasitas Penyimpanan')
    .replace('Catatan Kejadian Penting', 'F. Catatan Kejadian Penting')}

  ${slaSection(d)}

  <h2>H. Rekomendasi Tindak Lanjut</h2>
  <ul>${recommendationItems(d).map((r) => `<li>${r}</li>`).join('') || '<li>Semua indikator normal.</li>'}</ul>`;

  return page(
    'Laporan Bulanan Infrastruktur Virtualisasi',
    `Cluster <b>${esc(d.cluster.name)}</b> (${esc(d.cluster.host)}) &middot; Periode <b>${BULAN[d.month]} ${d.year}</b>`,
    body
  );
}

export interface ConsolidatedItem {
  cluster: PublicCluster;
  data?: MonthlyData;
  error?: string;
}

export function buildConsolidatedReportHtml(
  year: number,
  month: number,
  items: ConsolidatedItem[]
): string {
  const oks = items.filter((it) => it.data);
  const errs = items.filter((it) => it.error);

  const totNodes = oks.reduce((s, it) => s + (it.data?.nodes.length ?? 0), 0);
  const onlineNodes = oks.reduce(
    (s, it) => s + (it.data?.nodes.filter((n) => n.status === 'online').length ?? 0),
    0
  );
  const totGuests = oks.reduce((s, it) => s + (it.data?.guests.length ?? 0), 0);
  const runGuests = oks.reduce(
    (s, it) => s + (it.data?.guests.filter((g) => g.status === 'BERJALAN').length ?? 0),
    0
  );
  const failTotal = oks.reduce((s, it) => s + (it.data?.failedTasks.length ?? 0), 0);
  const auditTotal = oks.reduce((s, it) => s + (it.data?.auditCount ?? 0), 0);
  const allSlaRows = oks
    .flatMap((it) => {
      const s = it.data?.sla;
      return s ? [...s.nodes, ...s.guests] : [];
    })
    .filter((r) => r.actualPct !== null);
  const slaTracked = allSlaRows.length;
  const slaCompliant = allSlaRows.filter((r) => r.status === 'ok').length;
  const slaAvg = slaTracked
    ? Math.round((allSlaRows.reduce((s, r) => s + (r.actualPct ?? 0), 0) / slaTracked) * 100) / 100
    : null;
  const allStorage = oks.flatMap((it) => it.data?.storages ?? []);
  const kritis = allStorage.filter((s) => s.pct >= 85);
  const waspada = allStorage.filter((s) => s.pct >= 70 && s.pct < 85);

  const alasan: string[] = [];
  if (onlineNodes < totNodes) alasan.push(`${totNodes - onlineNodes} server fisik tidak aktif`);
  if (kritis.length) alasan.push(`${kritis.length} penyimpanan KRITIS (>85%) di seluruh cluster`);
  if (waspada.length) alasan.push(`${waspada.length} penyimpanan mulai penuh (70-85%)`);
  if (failTotal) alasan.push(`${failTotal} proses teknis gagal bulan ini`);
  if (errs.length) alasan.push(`${errs.length} cluster tidak dapat dibaca datanya`);

  const kondisi =
    alasan.length === 0 ? 'SEHAT' : kritis.length ? 'PERLU TINDAK LANJUT SEGERA' : 'CENDERUNG SEHAT, ADA CATATAN';
  const badgeColor =
    kondisi === 'SEHAT' ? '#059669' : kondisi.startsWith('PERLU TINDAK') ? '#dc2626' : '#d97706';

  let body = `
  <h2>A. Ringkasan Gabungan untuk Pimpinan</h2>
  <p>Kondisi umum infrastruktur: <span class="badge" style="background:${badgeColor}">${kondisi}</span></p>
  <table>
    <tr><th>Indikator</th><th style="text-align:right">Nilai</th></tr>
    <tr><td>Cluster tercakup</td><td style="text-align:right">${oks.length} dari ${items.length}</td></tr>
    <tr><td>Total server fisik aktif</td><td style="text-align:right">${onlineNodes} dari ${totNodes}</td></tr>
    <tr><td>Total mesin berjalan</td><td style="text-align:right">${runGuests} dari ${totGuests}</td></tr>
    ${
      slaTracked
        ? `<tr><td>SLA rata-rata bulan ini</td><td style="text-align:right">${slaAvg}% (${slaCompliant}/${slaTracked} memenuhi)</td></tr>`
        : ''
    }
    <tr><td>Proses teknis gagal</td><td style="text-align:right">${failTotal} kejadian</td></tr>
    <tr><td>Aktivitas administrasi panel</td><td style="text-align:right">${auditTotal} aksi tercatat</td></tr>
  </table>
  ${alasan.length ? `<p><b>Perlu diperhatikan:</b></p><ul>${alasan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  ${errs.map((it) => `<div class="errbox">Cluster <b>${esc(it.cluster.name)}</b> gagal dibaca: ${esc(it.error ?? '?')}</div>`).join('')}
  <h2>B. Grafik Tren per Cluster (30 hari terakhir)</h2>`;

  oks.forEach((it, idx) => {
    const d = it.data!;
    body += `
    <h3 style="font-size:15px;margin-top:20px;border-left:4px solid #f97316;padding-left:10px">${idx + 1}. ${esc(
      d.cluster.name
    )} <span style="font-weight:400;color:#64748b">(${esc(d.cluster.host)})</span></h3>
    ${chartBlock(d)}
    ${detailSections(d)}
    ${slaSection(d, false)}`;
    if (d.auditTop.length) {
      body += `<p style="font-size:12.5px;color:#475569"><b>Aktivitas panel:</b> ${d.auditCount} aksi — ${d.auditTop
        .map(([a, c]) => `${esc(a)} (${c})`)
        .join(', ')}</p>`;
    }
  });

  const allRecs = oks.flatMap((it) =>
    recommendationItems(it.data!).map((r) => `[${esc(it.cluster.name)}] ${r}`)
  );
  body += `<h2>C. Rekomendasi Tindak Lanjut Gabungan</h2><ul>${
    allRecs.map((r) => `<li>${r}</li>`).join('') || '<li>Semua indikator normal.</li>'
  }</ul>`;

  return page(
    'Laporan Bulanan Virtualisasi — Seluruh Cluster',
    `Konsolidasi ${items.length} cluster &middot; Periode <b>${BULAN[month]} ${year}</b>`,
    body
  );
}
