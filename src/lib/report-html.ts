import { fmtBytesShort, svgAreaChart } from './report-svg';
import type { MonthlyData } from './report-data';

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BULAN = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function buildMonthlyReportHtml(d: MonthlyData): string {
  const running = d.guests.filter((g) => g.status === 'BERJALAN');
  const stopped = d.guests.filter((g) => !['BERJALAN', 'template'].includes(g.status));
  const templates = d.guests.filter((g) => g.status === 'template');
  const onlineNodes = d.nodes.filter((n) => n.status === 'online');
  const kritis = d.storages.filter((s) => s.pct >= 85);
  const waspada = d.storages.filter((s) => s.pct >= 70 && s.pct < 85);

  const alasan: string[] = [];
  if (onlineNodes.length < d.nodes.length)
    alasan.push(`${d.nodes.length - onlineNodes.length} server fisik tidak aktif`);
  if (kritis.length) alasan.push(`${kritis.length} penyimpanan berstatus KRITIS (>85%)`);
  if (waspada.length) alasan.push(`${waspada.length} penyimpanan mulai penuh (70-85%)`);
  if (d.failedTasks.length) alasan.push(`${d.failedTasks.length} proses teknis gagal bulan ini`);
  if (stopped.length) alasan.push(`${stopped.length} mesin dalam keadaan mati`);

  const kondisi =
    alasan.length === 0 ? 'SEHAT' : kritis.length ? 'PERLU TINDAK LANJUT SEGERA' : 'CENDERUNG SEHAT, ADA CATATAN';
  const badgeColor =
    kondisi === 'SEHAT' ? '#059669' : kondisi.startsWith('PERLU TINDAK') ? '#dc2626' : '#d97706';

  const guestRows = d.guests
    .slice(0, 30)
    .map(
      (g) => `<tr>
        <td>${esc(g.status)}</td>
        <td><b>${esc(g.name)}</b></td>
        <td style="text-align:center">${g.vmid}</td>
        <td>${esc(g.node)}</td>
        <td style="text-align:right">${esc(g.memPct)}</td>
      </tr>`
    )
    .join('');

  const storageRows = d.storages
    .map((s) => {
      const color = s.pct >= 85 ? '#dc2626' : s.pct >= 70 ? '#d97706' : '#059669';
      return `<tr>
        <td><b>${esc(s.storage)}</b></td>
        <td>${esc(s.node)}</td>
        <td>${fmtBytesShort(parseFloat(s.total))} iB</td>
        <td style="min-width:180px">
          <div style="background:#e2e8f0;border-radius:6px;height:10px;width:100%">
            <div style="width:${Math.min(100, s.pct)}%;height:10px;border-radius:6px;background:${color}"></div>
          </div>
        </td>
        <td style="text-align:right">${s.pct}%</td>
        <td style="color:${color};font-weight:600">${s.pct >= 85 ? 'KRITIS' : s.pct >= 70 ? 'Waspada' : 'Aman'}</td>
      </tr>`;
    })
    .join('');

  const nodeRows = d.nodes
    .map(
      (n) => `<tr>
        <td><b>${esc(n.node)}</b></td>
        <td>${n.status === 'online' ? '<span style="color:#059669;font-weight:600">AKTIF</span>' : '<span style="color:#dc2626;font-weight:600">TIDAK AKTIF</span>'}</td>
        <td>${esc(n.uptimeDays)}</td>
        <td style="text-align:right">${n.cpuPct}%</td>
        <td style="text-align:right">${n.memPct}% (${esc(n.memUsed)} / ${esc(n.memTotal)})</td>
      </tr>`
    )
    .join('');

  const failedRows = d.failedTasks.length
    ? `<ul>${d.failedTasks
        .map((f) => `<li><code>${esc(f.type)}</code> — ${esc(f.date)} · status: ${esc(f.status)}</li>`)
        .join('')}</ul>`
    : '<p>Tidak ada kegagalan proses teknis yang tercatat pada periode ini. 👍</p>';

  let rekom = '';
  for (const s of kritis) rekom += `<li>Segera tambah/bersihkan kapasitas penyimpanan <b>${esc(s.storage)}</b> (terpakai ${s.pct}%).</li>`;
  for (const s of waspada) rekom += `<li>Pantau kapasitas <b>${esc(s.storage)}</b> (${s.pct}%) dan rencanakan penambahan ruang.</li>`;
  if (onlineNodes.length < d.nodes.length) rekom += '<li>Periksa server fisik yang tidak aktif bersama tim teknis.</li>';
  if (d.failedTasks.length) rekom += '<li>Tinjau proses yang gagal agar tidak berulang bulan depan.</li>';
  if (stopped.length) rekom += `<li>Konfirmasi apakah ${stopped.length} mesin yang mati memang sudah tidak digunakan.</li>`;
  if (!rekom) rekom = '<li>Semua indikator dalam batas normal — tidak ada tindakan khusus bulan ini.</li>';

  const chartsPerNode = d.nodes
    .filter((n) => (d.nodeSeries[n.node]?.length ?? 0) > 1)
    .map(
      (n) => `
    <h3 style="margin:22px 0 8px">Node ${esc(n.node)}</h3>
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

  const netAgg: Array<{ t: number; [k: string]: number | null }> = [];
  const firstKey = Object.keys(d.nodeSeries)[0];
  if (firstKey && d.nodeSeries[firstKey].length > 1) {
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

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Laporan Virtualisasi ${esc(d.cluster.name)} — ${BULAN[d.month]} ${d.year}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;background:#f1f5f9;margin:0;padding:24px}
  .page{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;padding:36px 42px;box-shadow:0 2px 12px rgba(15,23,42,.08)}
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
  @media print{
    body{background:#fff;padding:0}
    .page{box-shadow:none;max-width:100%}
    .noprint{display:none}
  }
</style>
</head>
<body>
<div class="page">
  <h1>Laporan Bulanan Infrastruktur Virtualisasi</h1>
  <div class="sub">Cluster <b>${esc(d.cluster.name)}</b> (${esc(d.cluster.host)}) &middot; Periode <b>${BULAN[d.month]} ${d.year}</b> &middot; dihasilkan otomatis oleh ProxCenter</div>

  <p class="noprint"><button onclick="window.print()" style="padding:7px 16px;border:0;border-radius:8px;background:#ea580c;color:#fff;font-weight:600;cursor:pointer">Cetak / Simpan PDF</button></p>

  <h2>A. Ringkasan untuk Pimpinan</h2>
  <p>Kondisi umum infrastruktur:
    <span class="badge" style="background:${badgeColor}">${kondisi}</span>
  </p>
  <table>
    <tr><th>Indikator</th><th style="text-align:right">Nilai</th></tr>
    <tr><td>Server fisik aktif</td><td style="text-align:right">${onlineNodes.length} dari ${d.nodes.length}</td></tr>
    <tr><td>Mesin virtual/container berjalan</td><td style="text-align:right">${running.length} dari ${d.guests.length} (mati: ${stopped.length})</td></tr>
    <tr><td>Proses teknis bulan ini</td><td style="text-align:right">${d.taskTotal} (gagal: ${d.failedTasks.length})</td></tr>
    <tr><td>Aktivitas administrasi panel</td><td style="text-align:right">${d.auditCount} aksi tercatat</td></tr>
  </table>
  ${alasan.length ? `<p><b>Perlu diperhatikan:</b></p><ul>${alasan.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}

  <h2>B. Grafik Tren (30 hari terakhir)</h2>
  ${chartsPerNode || '<p>Data grafik belum tersedia.</p>'}
  ${
    netAgg.length > 1
      ? `<div class="chartbox" style="margin-top:14px"><div class="ctitle">Network Total Semua Node</div>${svgAreaChart(
          netAgg,
          [
            { key: 'netin', label: 'In', color: '#16a34a' },
            { key: 'netout', label: 'Out', color: '#4f46e5' }
          ],
          (v) => fmtBytesShort(v)
        )}</div>`
      : ''
  }

  <h2>C. Kondisi Server Fisik</h2>
  <table><tr><th>Node</th><th>Status</th><th>Operasional</th><th style="text-align:right">CPU</th><th style="text-align:right">Memori</th></tr>${nodeRows}</table>

  <h2>D. Mesin Virtual &amp; Container</h2>
  <table><tr><th>Status</th><th>Nama</th><th style="text-align:center">ID</th><th>Node</th><th style="text-align:right">Memori</th></tr>${guestRows}</table>
  ${d.guests.length > 30 ? `<p><i>… dan ${d.guests.length - 30} lainnya (detail lengkap di panel ProxCenter).</i></p>` : ''}

  <h2>E. Kapasitas Penyimpanan</h2>
  <table><tr><th>Storage</th><th>Node</th><th>Total</th><th>Terpakai</th><th style="text-align:right">%</th><th>Kategori</th></tr>${storageRows}</table>

  <h2>F. Catatan Kejadian Penting</h2>
  ${failedRows}

  <h2>G. Rekomendasi Tindak Lanjut</h2>
  <ul>${rekom}</ul>

  <p style="margin-top:28px;font-size:11.5px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px">
    Dokumen dihasilkan otomatis oleh ProxCenter — data diambil langsung dari Proxmox VE pada saat pembuatan.
  </p>
</div>
</body>
</html>`;
}
