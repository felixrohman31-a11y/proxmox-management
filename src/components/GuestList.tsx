'use client';

import { useMemo, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { fmtUptime } from '@/lib/format';
import type { GuestRow } from '@/types';

type Filter = 'all' | 'running' | 'stopped';

export default function GuestList({
  guests,
  viewAllHref,
  labels
}: {
  guests: GuestRow[];
  viewAllHref: string;
  labels: {
    all: string;
    running: string;
    stopped: string;
    search: string;
    viewAll: string;
    empty: string;
  };
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return guests.filter((g) => {
      if (g.template) return filter === 'all';
      const isRunning = g.status === 'running';
      if (filter === 'running' && !isRunning) return false;
      if (filter === 'stopped' && isRunning) return false;
      if (needle) {
        const hay = `${g.name} ${g.vmid} ${g.node}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [guests, filter, q]);

  const chip = (f: Filter, text: string) => (
    <button
      type="button"
      onClick={() => setFilter(f)}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        filter === f
          ? 'bg-orange-600 text-white'
          : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {text}
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="flex items-center gap-1">
          {chip('all', labels.all)}
          {chip('running', labels.running)}
          {chip('stopped', labels.stopped)}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.search}
          className="input h-8 w-44 py-1 text-xs"
        />
      </div>
      <ul className="divide-y divide-zinc-800/70">
        {guests.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">{labels.empty}</li>
        )}
        {guests.length > 0 &&
          filtered.slice(0, 50).map((g) => (
            <li
              key={`${g.node}-${g.vmid}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-150 hover:bg-zinc-900/40"
            >
              <span className="w-12 shrink-0 font-mono text-xs text-zinc-500">{g.vmid}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">{g.name}</span>
              <span className="hidden w-28 shrink-0 truncate text-xs text-zinc-500 sm:block">{g.node}</span>
              <StatusBadge status={g.template ? 'template' : g.status} />
              <span className="hidden w-20 shrink-0 text-right text-xs text-zinc-500 md:block">
                {fmtUptime(g.uptime)}
              </span>
            </li>
          ))}
        {guests.length > 0 && filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">—</li>
        )}
      </ul>
    </>
  );
}
