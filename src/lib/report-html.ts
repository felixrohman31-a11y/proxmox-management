import { fmtBytesShort, svgAreaChart } from './report-svg';
import type { MonthlyData } from './report-data';
import { fmtDowntime, type SlaRow } from './sla';
import { getReportStrings } from './report-strings';
import type { PublicCluster } from '@/types';

type ReportLocale = 'id' | 'en';

const BULAN_EN = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
const BULAN_ID = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function bulan(month: number, locale: ReportLocale): string {
  return (locale === 'en' ? BULAN_EN : BULAN_ID)[month] ?? '';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chartBlock(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const nodeLabel = 'Node';
  const cpuLabel = en ? 'CPU Load (%)' : 'Beban CPU (%)';
  const memLabel = en ? 'Memory' : 'Memori';
  const terpakaiLabel = en ? 'Used' : 'Terpakai';
  const totalLabel = 'Total';
  const networkLabel = en ? 'Network Total' : 'Network Total';
  const inLabel = 'In';
  const outLabel = 'Out';

  const chartsPerNode = d.nodes
    .filter((n) => (d.nodeSeries[n.node]?.length ?? 0) > 1)
    .map(
      (n) => `
      <h3 style="margin:16px 0 8px">${nodeLabel} ${esc(n.node)}</h3>
      <div class="chartgrid">
        <div class="chartbox">
          <div class="ctitle">${cpuLabel}</div>
          ${svgAreaChart(d.nodeSeries[n.node], [{ key: 'cpu', label: 'CPU', color: '#ea580c' }], (v) => `${Math.round(v)}%`)}
        </div>
        <div class="chartbox">
          <div class="ctitle">${memLabel}</div>
          ${svgAreaChart(
            d.nodeSeries[n.node],
            [
              { key: 'memG', label: terpakaiLabel, color: '#0284c7' },
              { key: 'memTotG', label: totalLabel, color: '#94a3b8' }
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
      ? `<div class="chartbox" style="margin-top:14px"><div class="ctitle">${networkLabel}</div>${svgAreaChart(
          netAgg,
          [
            { key: 'netin', label: inLabel, color: '#16a34a' },
            { key: 'netout', label: outLabel, color: '#4f46e5' }
          ],
          (v) => fmtBytesShort(v)
        )}</div>`
      : '')
  );
}

function guestTable(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const thStatus = en ? 'Status' : 'Status';
  const thNama = en ? 'Name' : 'Nama';
  const thID = 'ID';
  const thNode = 'Node';
  const thMem = en ? 'Memory' : 'Memori';
  const danLainnya = en ? `and ${d.guests.length - 30} more.` : `dan ${d.guests.length - 30} lainnya.`;
  const rows = d.guests
    .slice(0, 30)
    .map(
      (g) => `<tr><td>${esc(g.status)}</td><td><b>${esc(g.name)}</b></td><td style="text-align:center">${g.vmid}</td><td>${esc(g.node)}</td><td style="text-align:right">${esc(g.memPct)}</td></tr>`
    )
    .join('');
  return `<table><tr><th>${thStatus}</th><th>${thNama}</th><th style="text-align:center">${thID}</th><th>${thNode}</th><th style="text-align:right">${thMem}</th></tr>${rows}</table>${
    d.guests.length > 30 ? `<p><i>… ${danLainnya}</i></p>` : ''
  }`;
}

function storageTable(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const thStorage = 'Storage';
  const thNode = 'Node';
  const thTotal = 'Total';
  const thTerpakai = en ? 'Used' : 'Terpakai';
  const thPct = '%';
  const thKategori = en ? 'Category' : 'Kategori';
  const kritisLabel = en ? 'CRITICAL' : 'KRITIS';
  const waspardaLabel = en ? 'Warning' : 'Waspada';
  const amanLabel = en ? 'Safe' : 'Aman';
  const rows = d.storages
    .map((s) => {
      const color = s.pct >= 85 ? '#dc2626' : s.pct >= 70 ? '#d97706' : '#059669';
      const kat = s.pct >= 85 ? kritisLabel : s.pct >= 70 ? waspardaLabel : amanLabel;
      return `<tr><td><b>${esc(s.storage)}</b></td><td>${esc(s.node)}</td><td>${esc(s.total)}</td>
        <td style="min-width:170px"><div style="background:#e2e8f0;border-radius:6px;height:10px;width:100%"><div style="width:${Math.min(100, s.pct)}%;height:10px;border-radius:6px;background:${color}"></div></div></td>
        <td style="text-align:right">${s.pct}%</td><td style="color:${color};font-weight:600">${kat}</td></tr>`;
    })
    .join('');
  return `<table><tr><th>${thStorage}</th><th>${thNode}</th><th>${thTotal}</th><th>${thTerpakai}</th><th style="text-align:right">${thPct}</th><th>${thKategori}</th></tr>${rows}</table>`;
}

function nodeTable(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const thNode = 'Node';
  const thStatus = en ? 'Status' : 'Status';
  const thOperasional = en ? 'Uptime' : 'Operasional';
  const thCPU = 'CPU';
  const thMem = en ? 'Memory' : 'Memori';
  const aktifLabel = en ? 'ONLINE' : 'AKTIF';
  const offlineLabel = en ? 'OFFLINE' : 'TIDAK AKTIF';
  const rows = d.nodes
    .map(
      (n) => `<tr><td><b>${esc(n.node)}</b></td><td>${
        n.status === 'online' ? `<span style="color:#059669;font-weight:600">${aktifLabel}</span>` : `<span style="color:#dc2626;font-weight:600">${offlineLabel}</span>`
      }</td><td>${esc(n.uptimeDays)}</td><td style="text-align:right">${n.cpuPct}%</td><td style="text-align:right">${n.memPct}% (${esc(n.memUsed)} / ${esc(n.memTotal)})</td></tr>`
    )
    .join('');
  return `<table><tr><th>${thNode}</th><th>${thStatus}</th><th>${thOperasional}</th><th style="text-align:right">${thCPU}</th><th style="text-align:right">${thMem}</th></tr>${rows}</table>`;
}

function failedBlock(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const noEvents = en
    ? 'No failed processes recorded in this period.'
    : 'Tidak ada kegagalan proses teknis yang tercatat pada periode ini.';
  if (!d.failedTasks.length) return `<p>${noEvents}</p>`;
  return `<ul>${d.failedTasks
    .map((f) => `<li><code>${esc(f.type)}</code> — ${esc(f.date)} · status: ${esc(f.status)}</li>`)
    .join('')}</ul>`;
}

function recommendationItems(d: MonthlyData, locale: ReportLocale = 'id'): string[] {
  const R = getReportStrings(locale);
  const out: string[] = [];
  for (const s of d.storages.filter((x) => x.pct >= 85))
    out.push(R.recStoreCritical.replace('{s}', esc(s.storage ?? '')).replace('{p}', String(Math.round(s.pct))));
  for (const s of d.storages.filter((x) => x.pct >= 70 && x.pct < 85))
    out.push(R.recStoreWarning.replace('{s}', esc(s.storage ?? '')).replace('{p}', String(Math.round(s.pct))));
  const offline = d.nodes.filter((n) => n.status !== 'online');
  if (offline.length) out.push(R.recOfflineNode);
  if (d.failedTasks.length) out.push(R.recFailedTasks);
  const stopped = d.guests.filter((g) => !['BERJALAN', 'template'].includes(g.status));
  if (stopped.length) out.push(R.recStoppedGuests.replace('{n}', String(stopped.length)));
  return out;
}

function slaSection(d: MonthlyData, locale: ReportLocale = 'id', withLetter = true): string {
  if (!d.sla) return '';
  const s = d.sla;
  const en = locale === 'en';
  const R = getReportStrings(locale);
  const title = withLetter
    ? `<h2>${R.secG}</h2>`
    : `<h3 style="font-size:14px;margin-top:14px;color:#334155">${R.secG.replace(/^[A-Z]\.\s*/, '')}</h3>`;
  if (!s.summary.tracked) return `${title}<p>${R.slaNone}</p>`;

  const statusCell = (r: SlaRow) =>
    r.status === 'ok'
      ? `<span style="color:#059669;font-weight:600">${R.slaCompliant.toUpperCase()}</span>`
      : r.status === 'breach'
        ? `<span style="color:#dc2626;font-weight:600">${R.slaBreach}</span>`
        : `<span style="color:#64748b">${R.slaNoDataShort}</span>`;

  const table = (rows: SlaRow[], worstFirst = false) => {
    const list = worstFirst
      ? [...rows].sort((a, b) => (a.actualPct ?? 999) - (b.actualPct ?? 999)).slice(0, 15)
      : rows;
    const trs = list
      .map(
        (r) => `<tr><td><b>${esc(r.name)}</b>${r.vmid != null ? ` <span style="color:#64748b">(${r.vmid})</span>` : ''}</td><td>${esc(r.node)}</td><td style="text-align:right">${r.target.toFixed(2)}%</td><td style="text-align:right">${r.actualPct === null ? '—' : `${r.actualPct.toFixed(2)}%`}</td><td style="text-align:right">${fmtDowntime(r.downtimeMin, en)}</td><td>${statusCell(r)}</td></tr>`
      )
      .join('');
    return `<table><tr><th>${R.name}</th><th>${R.node}</th><th style="text-align:right">${R.slaHtmlTarget}</th><th style="text-align:right">${R.slaHtmlActual}</th><th style="text-align:right">${R.slaHtmlDowntime}</th><th>${R.slaHtmlStatus}</th></tr>${trs}</table>`;
  };

  return `${title}
  <p>${R.slaSummaryLine
    .replace('{avg}', s.summary.avgPct === null ? '—' : s.summary.avgPct.toFixed(2))
    .replace('{ok}', String(s.summary.compliant))
    .replace('{n}', String(s.summary.tracked))
    .replace('{breach}', String(s.summary.breach))} ${en ? 'Total downtime' : 'Total downtime'}: <b>${fmtDowntime(s.summary.totalDowntimeMin, en)}</b>.</p>
  <p style="margin-bottom:4px"><b>${R.slaHtmlNodes}:</b></p>
  ${table(s.nodes)}
  <p style="margin:10px 0 4px"><b>${R.slaHtmlGuests}:</b></p>
  ${table(s.guests, true)}
  <p style="font-size:11.5px;color:#94a3b8">${en
    ? 'Computed from the last ~30 days of Proxmox monitoring data; sample gaps count as downtime.'
    : 'Dihitung dari data monitoring Proxmox ±30 hari terakhir; gap sampel dianggap downtime.'}</p>`;
}

function detailSections(d: MonthlyData, withTitles = true, locale: ReportLocale = 'id', letters = false): string {
  const en = locale === 'en';
  const t = (s: string) => (withTitles ? `<h2>${s}</h2>` : '');
  const L = (letter: string, id: string, enTitle: string) => (letters ? `${letter}. ` : '') + (en ? enTitle : id);
  return `
    ${t(L('C', 'Kondisi Server Fisik', 'PHYSICAL SERVER STATUS'))}${nodeTable(d, locale)}
    ${t(L('D', 'Mesin Virtual & Container', 'VIRTUAL MACHINES &amp; CONTAINERS'))}${guestTable(d, locale)}
    ${t(L('E', 'Kapasitas Penyimpanan', 'STORAGE CAPACITY'))}${storageTable(d, locale)}
    ${t(L('F', 'Catatan Kejadian Penting', 'IMPORTANT EVENTS'))}${failedBlock(d, locale)}`;
}

function page(title: string, sub: string, body: string, locale: ReportLocale = 'id'): string {
  const en = locale === 'en';
  const printBtn = en ? 'Print / Save as PDF' : 'Cetak / Simpan PDF';
  const footerText = en
    ? 'Document auto-generated by Proxmox Management — data fetched directly from Proxmox VE.'
    : 'Dokumen dihasilkan otomatis oleh Proxmox Management — data diambil langsung dari Proxmox VE pada saat pembuatan.';
  return `<!DOCTYPE html>
<html lang="${locale}">
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
  <p class="noprint"><button onclick="window.print()" style="padding:7px 16px;border:0;border-radius:8px;background:#ea580c;color:#fff;font-weight:600;cursor:pointer">${printBtn}</button></p>
  ${body}
  <p style="margin-top:28px;font-size:11.5px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px">
    ${footerText}
  </p>
</div>
</body>
</html>`;
}

export function buildMonthlyReportHtml(d: MonthlyData, locale: ReportLocale = 'id'): string {
  const R = getReportStrings(locale);
  const en = locale === 'en';
  const running = d.guests.filter((g) => g.status === 'BERJALAN');
  const stopped = d.guests.filter((g) => !['BERJALAN', 'template'].includes(g.status));
  const online = d.nodes.filter((n) => n.status === 'online');
  const kritis = d.storages.filter((s) => s.pct >= 85);
  const waspada = d.storages.filter((s) => s.pct >= 70 && s.pct < 85);

  const alasan: string[] = [];
  if (online.length < d.nodes.length)
    alasan.push(`${d.nodes.length - online.length} ${en ? 'physical servers offline' : 'server fisik tidak aktif'}`);
  if (kritis.length) alasan.push(`${kritis.length} ${R.critical} (>85%)`);
  if (waspada.length) alasan.push(`${waspada.length} ${R.warning} (70-85%)`);
  if (d.failedTasks.length) alasan.push(`${d.failedTasks.length} ${R.failedProcesses.toLowerCase()}`);
  if (stopped.length) alasan.push(`${stopped.length} ${R.guestsStopped}`);

  const kondisi =
    alasan.length === 0 ? R.healthy : kritis.length ? R.needsAction : R.generallyHealthy;
  const badgeColor =
    kondisi === R.healthy ? '#059669' : kondisi === R.needsAction ? '#dc2626' : '#d97706';

  const thIndikator = en ? 'Indicator' : 'Indikator';
  const thNilai = en ? 'Value' : 'Nilai';
  const dari = en ? 'of' : 'dari';
  const gagal = en ? 'failed' : 'gagal';
  const aksi = en ? 'actions recorded' : 'aksi tercatat';
  const perluDiperhatikan = en ? 'Items needing attention:' : 'Perlu diperhatikan:';
  const grafikTren = en ? 'B. TREND CHARTS (last 30 days)' : 'B. Grafik Tren (30 hari terakhir)';
  const rekomen = en ? 'H. RECOMMENDATIONS' : 'H. Rekomendasi Tindak Lanjut';
  const semuaNormal = en ? 'All indicators are within normal limits.' : 'Semua indikator normal.';
  const prosesBulan = en ? 'Processes this month' : 'Proses teknis bulan ini';
  const thAktivitas = en ? 'Panel activity' : 'Aktivitas administrasi panel';

  const slaRow =
    d.sla && d.sla.summary.avgPct !== null
      ? `<tr><td>${R.slaHtmlSummary}</td><td style="text-align:right">${d.sla.summary.avgPct.toFixed(2)}% (${d.sla.summary.compliant}/${d.sla.summary.tracked} ${R.slaCompliant.toLowerCase()})</td></tr>`
      : '';
  const overallRow =
    d.overallSla
      ? `<tr><td>${R.sla}</td><td style="text-align:right">${d.overallSla.overall.toFixed(2)}% (${R.slaTarget} ${d.overallSla.target.toFixed(1)}% — ${d.overallSla.achieved ? R.slaAchieved : R.slaNotAchieved} / ${d.overallSla.level.toUpperCase()})</td></tr>`
      : '';

  const body = `
  <h2>${R.secA}</h2>
  <p>${R.condition}: <span class="badge" style="background:${badgeColor}">${kondisi}</span></p>
  <table>
    <tr><th>${thIndikator}</th><th style="text-align:right">${thNilai}</th></tr>
    <tr><td>${R.serversOnline}</td><td style="text-align:right">${online.length} ${dari} ${d.nodes.length}</td></tr>
    <tr><td>${R.guestsRunning}</td><td style="text-align:right">${running.length} ${dari} ${d.guests.length}</td></tr>
    ${slaRow}
    ${overallRow}
    <tr><td>${prosesBulan}</td><td style="text-align:right">${d.taskTotal} (${gagal}: ${d.failedTasks.length})</td></tr>
    <tr><td>${thAktivitas}</td><td style="text-align:right">${d.auditCount} ${aksi}</td></tr>
  </table>
  ${alasan.length ? `<p><b>${perluDiperhatikan}</b></p><ul>${alasan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}

  <h2>${grafikTren}</h2>
  ${chartBlock(d, locale)}

  ${detailSections(d, true, locale, true)}

  ${slaSection(d, locale, true)}

  <h2>${rekomen}</h2>
  <ul>${recommendationItems(d, locale).map((r) => `<li>${r}</li>`).join('') || `<li>${semuaNormal}</li>`}</ul>`;

  return page(
    R.reportTitle,
    `${R.cluster} <b>${esc(d.cluster.name)}</b> (${esc(d.cluster.host)}) &middot; ${R.period}: <b>${R.months[d.month]} ${d.year}</b>`,
    body,
    locale
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
  items: ConsolidatedItem[],
  locale: ReportLocale = 'id'
): string {
  const R = getReportStrings(locale);
  const en = locale === 'en';
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
  const allStorage = oks.flatMap((it) => it.data?.storages ?? []);
  const kritis = allStorage.filter((s) => s.pct >= 85);
  const waspada = allStorage.filter((s) => s.pct >= 70 && s.pct < 85);

  const allOverall = oks.map((it) => it.data?.overallSla).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const overallAvg = allOverall.length
    ? Math.round((allOverall.reduce((s, o) => s + o.overall, 0) / allOverall.length) * 100) / 100
    : null;
  const overallAchieved = allOverall.filter((o) => o.achieved).length;

  const alasan: string[] = [];
  if (onlineNodes < totNodes) alasan.push(`${totNodes - onlineNodes} ${R.serversOnline.toLowerCase()}`);
  if (kritis.length) alasan.push(`${kritis.length} ${R.critical} (>85%) — ${en ? 'all clusters' : 'seluruh cluster'}`);
  if (waspada.length) alasan.push(`${waspada.length} ${R.warning} (70-85%)`);
  if (failTotal) alasan.push(`${failTotal} ${R.failedProcesses.toLowerCase()}`);
  if (errs.length) alasan.push(`${errs.length} ${en ? 'cluster data unavailable' : 'cluster tidak dapat dibaca'}`);

  const kondisi =
    alasan.length === 0 ? R.healthy : kritis.length ? R.needsAction : R.generallyHealthy;
  const badgeColor =
    kondisi === R.healthy ? '#059669' : kondisi === R.needsAction ? '#dc2626' : '#d97706';

  const thIndikator = en ? 'Indicator' : 'Indikator';
  const thNilai = en ? 'Value' : 'Nilai';
  const clustersCovered = en ? 'Clusters covered' : 'Cluster tercakup';
  const panelActivity = en ? 'Panel activity' : 'Aktivitas administrasi panel';

  let body = `
  <h2>${R.secA}</h2>
  <p>${R.condition}: <span class="badge" style="background:${badgeColor}">${kondisi}</span></p>
  <table>
    <tr><th>${thIndikator}</th><th style="text-align:right">${thNilai}</th></tr>
    <tr><td>${clustersCovered}</td><td style="text-align:right">${oks.length} / ${items.length}</td></tr>
    <tr><td>${R.serversOnline}</td><td style="text-align:right">${onlineNodes} / ${totNodes}</td></tr>
    <tr><td>${R.guestsRunning}</td><td style="text-align:right">${runGuests} / ${totGuests}</td></tr>
    ${
      overallAvg !== null
        ? `<tr><td>${R.sla}</td><td style="text-align:right">${overallAvg.toFixed(2)}% (${overallAchieved}/${allOverall.length} ${R.slaAchieved})</td></tr>`
        : ''
    }
    <tr><td>${R.failedProcesses}</td><td style="text-align:right">${failTotal}</td></tr>
    <tr><td>${panelActivity}</td><td style="text-align:right">${auditTotal}</td></tr>
  </table>
  ${alasan.length ? `<p><b>${R.attention}</b></p><ul>${alasan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  ${errs.map((it) => `<div class="errbox"><b>${esc(it.cluster.name)}</b>: ${esc(it.error ?? '?')}</div>`).join('')}
  <h2>${R.secB} (${R.period}: ${R.months[month]} ${year})</h2>`;

  oks.forEach((it, idx) => {
    const d = it.data!;
    body += `
    <h3 style="font-size:15px;margin-top:20px;border-left:4px solid #f97316;padding-left:10px">${idx + 1}. ${esc(
      d.cluster.name
    )} <span style="font-weight:400;color:#64748b">(${esc(d.cluster.host)})</span></h3>
    ${chartBlock(d, locale)}
    ${detailSections(d, true, locale, false)}
    ${slaSection(d, locale, false)}`;
    if (d.auditTop.length) {
      body += `<p style="font-size:12.5px;color:#475569"><b>${R.auditActions.replace('{n}', String(d.auditCount))}:</b> ${d.auditTop
        .map(([a, c]) => `${esc(a)} (${c})`)
        .join(', ')}</p>`;
    }
  });

  const allRecs = oks.flatMap((it) =>
    recommendationItems(it.data!, locale).map((r) => `[${esc(it.cluster.name)}] ${r}`)
  );
  body += `<h2>${R.secF}</h2><ul>${
    allRecs.map((r) => `<li>${r}</li>`).join('') || `<li>${R.noRec}</li>`
  }</ul>`;

  return page(
    R.reportTitle,
    `${en ? 'All Clusters' : 'Seluruh Cluster'} (${items.length}) &middot; ${R.period}: ${bulan(month, locale)} ${year}`,
    body,
    locale
  );
}
