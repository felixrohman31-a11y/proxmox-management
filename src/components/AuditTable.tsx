'use client';

import { useCallback, useEffect, useState } from 'react';
import { useL } from './lang-context';
import { RefreshIcon, SearchIcon } from './icons';

interface AuditEntry {
  ts: string;
  user: string;
  action: string;
  target: string;
  detail?: string;
  ip?: string;
}

function badgeCls(action: string): string {
  if (action.startsWith('login.ok') || action.startsWith('ftp.backup')) return 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400';
  if (action.includes('gagal') || action === 'pve.delete' || action.endsWith('.delete'))
    return 'border-red-800/50 bg-red-500/10 text-red-400';
  if (action.startsWith('notify') || action.startsWith('login.gagal'))
    return 'border-amber-600/50 bg-amber-500/10 text-amber-400';
  return 'border-zinc-700 bg-zinc-800/60 text-zinc-400';
}

export default function AuditTable() {
  const L = useL();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/audit?limit=200');
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setErr(j?.error ?? `HTTP ${r.status}`);
        return;
      }
      setErr(null);
      setRows(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      String(r.action ?? '').toLowerCase().includes(needle) ||
      String(r.user ?? '').toLowerCase().includes(needle) ||
      String(r.target ?? '').toLowerCase().includes(needle)
    );
  });

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">{L.audit.title}</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              className="input w-52 py-1 pl-8 text-xs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="{L.audit.search}"
            />
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn-ghost !px-2 !py-1">
            <RefreshIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat
          </button>
        </div>
      </div>
      {err && <p className="px-4 py-2 text-xs text-red-400">{err}</p>}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="sticky top-0 bg-zinc-900">
            <tr>
              <Th>{L.audit.colTime}</Th>
              <Th>{L.audit.colUser}</Th>
              <Th>{L.audit.colAct}</Th>
              <Th>{L.audit.colTarget}</Th>
              <Th>{L.audit.colDetail}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/70">
            {filtered.map((r, i) => (
              <tr key={`${r.ts}-${i}`} className="hover:bg-zinc-900/40">
                <Td className="whitespace-nowrap text-xs tabular-nums text-zinc-500">
                  {new Date(r.ts).toLocaleString('id-ID', { hour12: false })}
                </Td>
                <Td className="text-xs">{escUser(r.user)}</Td>
                <Td>
                  <span
                    className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeCls(r.action)}`}
                  >
                    {r.action}
                  </span>
                </Td>
                <Td className="max-w-[260px] truncate text-xs text-zinc-300" title={r.target}>
                  {r.target}
                </Td>
                <Td className="text-xs text-zinc-500">{r.detail ?? r.ip ?? '-'}</Td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-500">
                  {L.audit.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function escUser(u: string): string {
  return String(u ?? '').replace(/[<>&]/g, '');
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </th>
  );
}

function Td({ children, className = '', title }: { children?: React.ReactNode; className?: string; title?: string }) {
  return (
    <td title={title} className={`px-3 py-2 align-middle ${className}`}>
      {children}
    </td>
  );
}
