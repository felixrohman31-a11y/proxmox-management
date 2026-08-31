'use client';

import { useState } from 'react';
import { useL, useLocale } from './lang-context';

export default function ReportDownload({ clusterId, clusterName }: { clusterId: string; clusterName?: string }) {
  const L = useL();
  const locale = useLocale();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState<'aktif' | 'semua'>('aktif');

  function download(format: 'html' | 'txt') {
    const [y, m] = month.split('-');
    if (!y || !m) return;
    const cid = scope === 'semua' ? 'all' : clusterId;
    window.location.href = `/api/reports/${cid}/monthly?year=${y}&month=${Number(m)}&format=${format}&locale=${locale}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-zinc-700 text-xs font-medium">
        {(
          [
            ['aktif', scope === 'semua' ? L.report.scopeActive : clusterName ?? L.report.scopeActive],
            ['semua', L.report.scopeAll]
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setScope(val)}
            className={`px-2.5 py-1.5 transition ${
              scope === val
                ? 'bg-orange-500/15 text-orange-400'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
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
        aria-label={L.report.ariaMonth}
      />
      <button
        type="button"
        className="btn-primary"
        onClick={() => download('html')}
        title="Open in browser → print as PDF"
      >
        {L.report.btn}
      </button>
      <button type="button" className="btn-ghost" onClick={() => download('txt')} title="Plain text">
        {L.report.btnTxt}
      </button>
    </div>
  );
}
