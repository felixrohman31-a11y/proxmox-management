'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useL, useLocale } from './lang-context';
import { TrendChart } from './TrendChart';
import { AlertIcon, ChartIcon, CheckIcon, PlusIcon, RefreshIcon, TrashIcon } from './icons';

interface Snap {
  period: string; // YYYY-MM
  year: number;
  month: number;
  capturedAt: string;
  final: boolean;
  avgPct: number | null;
  compliant: number;
  breach: number;
  tracked: number;
  noData: number;
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2)}%`;
}

export default function SlaTrend({ clusterId, canWrite }: { clusterId: string; canWrite: boolean }) {
  const L = useL();
  const locale = useLocale();
  const uiLocale = locale === 'en' ? 'en-GB' : 'id-ID';
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const periodLabel = useCallback(
    (p: string) => {
      const [y, m] = p.split('-').map(Number);
      const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
      return new Intl.DateTimeFormat(uiLocale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    },
    [uiLocale]
  );

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/sla-history?c=${encodeURIComponent(clusterId)}`);
    if (!r.ok) return;
    const j = await r.json();
    const list: Snap[] = Array.isArray(j.snapshots) ? j.snapshots : [];
    list.sort((a, b) => (a.year - b.year) || (a.month - b.month));
    setSnaps(list);
    setLoaded(true);
  }, [clusterId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function capture() {
    setBusy('capture');
    setMsg(null);
    try {
      const r = await fetch('/api/sla-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ c: clusterId })
      });
      const j = await r.json().catch(() => ({}));
      setMsg({ kind: r.ok ? 'ok' : 'err', text: r.ok ? L.slaHistory.captured : (j.error === 'no_data' ? L.slaHistory.captureErr : L.slaHistory.captureErr) });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function del(p: string) {
    if (!window.confirm(`${L.slaHistory.delete} ${periodLabel(p)}?`)) return;
    setBusy(`del:${p}`);
    setMsg(null);
    try {
      await fetch(`/api/sla-history?c=${encodeURIComponent(clusterId)}&period=${encodeURIComponent(p)}`, { method: 'DELETE' });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  // data grafik ketersediaan (kronologis)
  const chartData = useMemo(
    () => snaps.filter((s) => s.avgPct != null).map((s) => ({ t: Date.UTC(s.year, s.month - 1, 1), avgPct: s.avgPct })),
    [snaps]
  );

  // delta vs bulan sebelumnya (dua titik tersedia terakhir)
  const delta = useMemo(() => {
    const withVal = snaps.filter((s) => s.avgPct != null);
    if (withVal.length < 2) return null;
    const cur = withVal[withVal.length - 1];
    const prev = withVal[withVal.length - 2];
    return { cur, prev, diff: (cur.avgPct as number) - (prev.avgPct as number) };
  }, [snaps]);

  const desc = L.slaHistory.desc;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <ChartIcon className="h-4 w-4 text-orange-400" /> {L.slaHistory.title}
          </h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-zinc-500">{desc}</p>
        </div>
        {canWrite && (
          <button type="button" onClick={capture} disabled={busy !== null} className="btn-ghost shrink-0">
            {busy === 'capture' ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
            {busy === 'capture' ? L.slaHistory.capturing : L.slaHistory.capture}
          </button>
        )}
      </div>

      {msg && (
        <p
          className={`mb-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
            msg.kind === 'err'
              ? 'border-red-900/60 bg-red-950/40 text-red-300'
              : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
          }`}
        >
          {msg.kind === 'err' ? <AlertIcon className="h-4 w-4 shrink-0" /> : <CheckIcon className="h-4 w-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      {loaded && snaps.length === 0 && <p className="text-sm text-zinc-600">{L.slaHistory.empty}</p>}

      {snaps.length > 0 && (
        <>
          {delta && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-500">{L.slaHistory.latest}</span>
              <span className="font-mono font-medium text-zinc-100">{fmtPct(delta.cur.avgPct)}</span>
              <span className="text-xs text-zinc-600">{periodLabel(delta.cur.period)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  delta.diff >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}
                title={`${periodLabel(delta.prev.period)} → ${periodLabel(delta.cur.period)}`}
              >
                {delta.diff >= 0 ? '▲' : '▼'} {Math.abs(delta.diff).toFixed(2)}%
              </span>
            </div>
          )}

          {chartData.length >= 2 ? (
            <TrendChart
              data={chartData}
              series={[{ key: 'avgPct', label: L.slaHistory.availability, color: '#f97316' }]}
              xTickFmt={(ms) => periodLabel(new Date(ms).toISOString().slice(0, 7))}
              yFmt={(v) => `${v.toFixed(1)}%`}
              tipFmt={(v) => `${Number(v).toFixed(2)}%`}
              height={180}
            />
          ) : (
            <p className="mb-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">{L.slaHistory.needMore}</p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{L.slaHistory.period}</th>
                  <th className="py-1.5 pr-3 font-medium">{L.slaHistory.availability}</th>
                  <th className="py-1.5 pr-3 font-medium">{L.slaHistory.compliant}</th>
                  <th className="py-1.5 pr-3 font-medium">{L.slaHistory.breach}</th>
                  <th className="py-1.5 pr-3 font-medium">{L.slaHistory.tracked}</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {[...snaps].reverse().map((s) => (
                  <tr key={s.period} className="border-t border-zinc-800/70">
                    <td className="py-1.5 pr-3">
                      <span className="font-medium text-zinc-200">{periodLabel(s.period)}</span>
                      <span
                        className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                          s.final ? 'bg-zinc-700/40 text-zinc-400' : 'bg-sky-500/10 text-sky-400'
                        }`}
                      >
                        {s.final ? L.slaHistory.final : L.slaHistory.live}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-zinc-300">{fmtPct(s.avgPct)}</td>
                    <td className="py-1.5 pr-3 text-emerald-400">{s.compliant}</td>
                    <td className="py-1.5 pr-3 text-red-400">{s.breach}</td>
                    <td className="py-1.5 pr-3 text-zinc-400">{s.tracked}</td>
                    <td className="py-1.5 text-right">
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => del(s.period)}
                          disabled={busy !== null}
                          className="rounded-md p-1 text-zinc-500 hover:text-red-400 disabled:opacity-40"
                          title={L.slaHistory.delete}
                        >
                          {busy === `del:${s.period}` ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
