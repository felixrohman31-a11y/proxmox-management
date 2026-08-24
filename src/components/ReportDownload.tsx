'use client';

import { useState } from 'react';

export default function ReportDownload({
  clusterId,
  clusterName
}: {
  clusterId: string;
  clusterName?: string;
}) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState<'aktif' | 'semua'>('aktif');

  function download(format: 'html' | 'txt') {
    const [y, m] = month.split('-');
    if (!y || !m) return;
    const cid = scope === 'semua' ? 'all' : clusterId;
    window.location.href = `/api/reports/${cid}/monthly?year=${y}&month=${Number(m)}&format=${format}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-zinc-700 text-xs font-medium">
        {(
          [
            ['aktif', clusterName ?? 'Cluster Aktif'],
            ['semua', 'Semua Cluster']
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setScope(val)}
            className={`px-2.5 py-1.5 transition ${
              scope === val ? 'bg-orange-500/15 text-orange-400' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="month"
        className="input w-auto"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        aria-label="Periode laporan"
      />
      <button
        type="button"
        className="btn-primary"
        onClick={() => download('html')}
        title="Unduh laporan dengan grafik — buka di browser lalu cetak ke PDF"
      >
        {scope === 'semua' ? 'Laporan Gabungan' : 'Laporan + Grafik'}
      </button>
      <button type="button" className="btn-ghost" onClick={() => download('txt')} title="Unduh versi teks polos">
        TXT
      </button>
    </div>
  );
}
