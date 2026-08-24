'use client';

import { useState } from 'react';

export default function ReportDownload({ clusterId }: { clusterId: string }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  function download(format: 'html' | 'txt') {
    const [y, m] = month.split('-');
    if (!y || !m) return;
    window.location.href = `/api/reports/${clusterId}/monthly?year=${y}&month=${Number(m)}&format=${format}`;
  }

  return (
    <div className="flex items-center gap-2">
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
        Laporan + Grafik
      </button>
      <button type="button" className="btn-ghost" onClick={() => download('txt')} title="Unduh versi teks polos">
        TXT
      </button>
    </div>
  );
}
