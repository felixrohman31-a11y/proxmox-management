import type { ChartRow } from './report-data';

export interface SvgSeries {
  key: string;
  label: string;
  color: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtBytesShort(v: number): string {
  if (!isFinite(v)) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(x >= 100 || i === 0 ? 0 : 1)}${u[i]}`;
}

export function svgAreaChart(
  rows: ChartRow[],
  series: SvgSeries[],
  yFmt: (v: number) => string,
  w = 620,
  h = 190
): string {
  const clean = rows.filter((r) => typeof r.t === 'number' && r.t > 0);
  if (clean.length < 2 || series.length === 0) {
    return `<div style="padding:24px;color:#94a3b8;font-size:12px;text-align:center">Data grafik tidak tersedia.</div>`;
  }

  const pad = { l: 46, r: 10, t: 12, b: 22 };
  const ts = clean.map((r) => r.t);
  const minX = Math.min(...ts);
  const maxX = Math.max(...ts);
  let maxV = 1;
  for (const s of series) for (const r of clean) { const v = r[s.key]; if (typeof v === 'number' && v > maxV) maxV = v; }
  maxV *= 1.15;

  const px = (t: number) => pad.l + ((t - minX) / (maxX - minX || 1)) * (w - pad.l - pad.r);
  const py = (v: number) => h - pad.b - (v / maxV) * (h - pad.t - pad.b);

  let grid = '';
  for (let i = 0; i <= 3; i++) {
    const v = (maxV / 3) * i;
    const y = py(v);
    grid += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
    grid += `<text x="${pad.l - 6}" y="${y + 3.5}" text-anchor="end" font-size="9.5" fill="#64748b">${esc(yFmt(v))}</text>`;
  }
  const midT = minX + (maxX - minX) / 2;
  const dFmt = (t: number) =>
    new Date(t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  grid += `<text x="${pad.l}" y="${h - 6}" font-size="9.5" fill="#64748b">${dFmt(minX)}</text>`;
  grid += `<text x="${(pad.l + w - pad.r) / 2}" y="${h - 6}" text-anchor="middle" font-size="9.5" fill="#64748b">${dFmt(midT)}</text>`;
  grid += `<text x="${w - pad.r}" y="${h - 6}" text-anchor="end" font-size="9.5" fill="#64748b">${dFmt(maxX)}</text>`;

  let paths = '';
  for (const s of series) {
    let dLine = '';
    let dArea = '';
    let pen = false;
    for (const r of clean) {
      const v = r[s.key];
      if (typeof v !== 'number') {
        pen = false;
        continue;
      }
      const x = px(r.t);
      const y = py(v);
      dLine += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
      pen = true;
    }
    const firstPts = clean.filter((r) => typeof r[s.key] === 'number');
    if (firstPts.length >= 2) {
      const fx = px(firstPts[0].t);
      const lx = px(firstPts[firstPts.length - 1].t);
      dArea = `M${fx},${h - pad.b} L${dLine.trimEnd()} L${lx},${h - pad.b} Z`;
    }
    paths += `<path d="${dArea}" fill="${s.color}" opacity="0.13"/>`;
    paths += `<path d="${dLine}" fill="none" stroke="${s.color}" stroke-width="1.7" stroke-linejoin="round"/>`;
  }

  const legend = series
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px"><span style="width:10px;height:10px;border-radius:2px;background:${s.color};display:inline-block"></span><b style="color:#334155">${esc(s.label)}</b></span>`
    )
    .join('');

  return `
<div style="margin-bottom:6px">${legend}</div>
<svg viewBox="0 0 ${w} ${h}" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px" preserveAspectRatio="xMidYMid meet">
  ${grid}
  ${paths}
</svg>`;
}
