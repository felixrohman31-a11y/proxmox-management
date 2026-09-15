'use client';

import { useState } from 'react';
import { useL, useLocale } from './lang-context';

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ReportDownload({ clusterId, clusterName }: { clusterId: string; clusterName?: string }) {
  const L = useL();
  const locale = useLocale();
  const [start, setStart] = useState<string>(firstOfMonthISO());
  const [end, setEnd] = useState<string>(todayISO());
  const [scope, setScope] = useState<'aktif' | 'semua'>('aktif');

  function download(format: 'html' | 'txt') {
    if (!start || !end) return;
    if (start > end) return;
    const cid = scope === 'semua' ? 'all' : clusterId;
    window.location.href = `/api/reports/${cid}/monthly?start=${start}&end=${end}&format=${format}&locale=${locale}`;
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
            className={`px-2.5 py-1.5 transition duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-orange-500/60 active:scale-95 ${
              scope === val
                ? 'bg-orange-500/15 text-orange-400'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className="input w-auto"
          value={start}
          max={end || undefined}
          onChange={(e) => setStart(e.target.value)}
          aria-label={L.report.ariaStart}
        />
        <span className="text-xs text-zinc-500">{L.report.to}</span>
        <input
          type="date"
          className="input w-auto"
          value={end}
          min={start || undefined}
          onChange={(e) => setEnd(e.target.value)}
          aria-label={L.report.ariaEnd}
        />
      </div>
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
