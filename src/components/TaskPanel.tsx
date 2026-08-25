'use client';

import { useCallback, useEffect, useState } from 'react';
import { Th, Td } from './TableBits';
import { RefreshIcon } from './icons';
import { useL } from './lang-context';
import { fmt } from '@/lib/i18n-dict';

interface TaskRow {
  upid: string;
  node: string;
  user: string;
  type: string;
  vmid?: number;
  starttime?: number;
  endtime?: number;
  status?: string;
}

export default function TaskPanel({ clusterId }: { clusterId: string }) {
  const L = useL();
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pve/${clusterId}/cluster/tasks`);
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(j?.error ?? fmt(L.taskpanel.failLoad, { code: r.status }));
        return;
      }
      setErr(null);
      const list = ((j?.data ?? []) as TaskRow[]).slice();
      list.sort((a, b) => (b.starttime ?? 0) - (a.starttime ?? 0));
      setRows(list.slice(0, 10));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [clusterId, L]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  function fmtTime(t?: number): string {
    if (!t) return '-';
    return new Date(t * 1000).toLocaleTimeString('id-ID', { hour12: false });
  }

  function statusOf(r: TaskRow): { label: string; cls: string; spin?: boolean } {
    const running = r.endtime === undefined && (r.status === undefined || r.status === 'running');
    if (running)
      return { label: L.taskpanel.stRunning, cls: 'border-amber-600/50 bg-amber-500/10 text-amber-400', spin: true };
    const s = String(r.status ?? '').toUpperCase();
    if (s === 'OK') return { label: L.taskpanel.stOk, cls: 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400' };
    return { label: s || 'ERROR', cls: 'border-red-700/50 bg-red-500/10 text-red-400' };
  }

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">{L.taskpanel.title}</h2>
        <span className="text-[11px] text-zinc-500">{L.taskpanel.auto}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left">
          <thead>
            <tr className="border-b border-zinc-800">
              <Th>{L.taskpanel.colTime}</Th>
              <Th>{L.taskpanel.colNode}</Th>
              <Th>{L.taskpanel.colType}</Th>
              <Th>{L.taskpanel.colVmid}</Th>
              <Th>{L.taskpanel.colUser}</Th>
              <Th>{L.taskpanel.colStatus}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {(rows ?? []).map((t) => {
              const st = statusOf(t);
              return (
                <tr key={t.upid} className="hover:bg-zinc-900/40">
                  <Td className="whitespace-nowrap tabular-nums text-zinc-400">{fmtTime(t.starttime)}</Td>
                  <Td className="whitespace-nowrap text-zinc-400">{t.node}</Td>
                  <Td><span className="font-mono text-xs text-zinc-300">{t.type}</span></Td>
                  <Td className="font-mono text-xs text-zinc-500">{t.vmid ?? '-'}</Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-500">{t.user?.split('@')[0]}</Td>
                  <Td>
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none ${st.cls}`}>
                      {st.spin && <RefreshIcon className="h-3 w-3 animate-spin" />}
                      {st.label}
                    </span>
                  </Td>
                </tr>
              );
            })}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">{L.taskpanel.empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {err && <p className="border-t border-zinc-800 px-4 py-2.5 text-xs text-red-400">{err}</p>}
    </section>
  );
}
