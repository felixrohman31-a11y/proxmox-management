'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendChart } from './TrendChart';
import { RefreshIcon, PowerIcon } from './icons';
import { fmtBytes } from '@/lib/format';
import { useL } from './lang-context';
import { fmt } from '@/lib/i18n-dict';

type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'year';
type TargetType = 'node' | 'guest';

interface GuestLite {
  vmid: number;
  type: 'qemu' | 'lxc';
  name: string;
  node: string;
  status?: string;
}

interface Props {
  clusterId: string;
  nodes: { node: string; status: string }[];
  guests: GuestLite[];
  init: {
    targetType: TargetType;
    node?: string;
    guestKey?: string;
    tf: Timeframe;
    customStart?: string;
    customEnd?: string;
  };
}

const TFS: Timeframe[] = ['hour', 'day', 'week', 'month', 'year'];

function guestKeyOf(g: GuestLite): string {
  return `${g.type}|${g.vmid}|${g.node}`;
}

function xFmtFor(tf: Timeframe): (ms: number) => string {
  if (tf === 'hour' || tf === 'day') {
    return (ms: number) =>
      new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return (ms: number) => new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function customXFmt(start: string, end: string): (ms: number) => string {
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = new Date(`${end}T23:59:59`).getTime();
  const span = isFinite(s) && isFinite(e) ? e - s : 0;
  if (span > 0 && span <= 2 * 86400000) {
    return (ms: number) =>
      new Date(ms).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
  }
  return (ms: number) => new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// PVE lama hanya menerima timeframe tetap; pilih yang paling mendekati rentang.
function tfFromRange(start: string, end: string): Timeframe {
  const s = new Date(`${start}T00:00:00`).getTime();
  const e = new Date(`${end}T23:59:59`).getTime();
  const days = (e - s) / 86400000;
  if (!isFinite(days) || days <= 1) return 'day';
  if (days <= 8) return 'week';
  if (days <= 45) return 'month';
  return 'year';
}

export default function RrdExplorer({ clusterId, nodes, guests, init }: Props) {
  const L = useL();
  const [targetType, setTargetType] = useState<TargetType>(init.targetType);
  const [nodeSel, setNodeSel] = useState(() => {
    if (init.targetType === 'node' && init.node && nodes.some((n) => n.node === init.node)) return init.node;
    return nodes.find((n) => n.status === 'online')?.node ?? nodes[0]?.node ?? '';
  });
  const [guestSel, setGuestSel] = useState(() => {
    if (init.targetType === 'guest' && init.guestKey && guests.some((g) => guestKeyOf(g) === init.guestKey))
      return init.guestKey;
    return guests[0] ? guestKeyOf(guests[0]) : '';
  });
  const [tf, setTf] = useState<Timeframe>(init.tf);
  const [customMode, setCustomMode] = useState(!!(init.customStart && init.customEnd));
  const [customStart, setCustomStart] = useState<string>(() => {
    if (init.customStart) return init.customStart;
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => init.customEnd ?? new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ [k: string]: number | null }> | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const guest = useMemo(() => {
    const [t, vmid, node] = (guestSel || '').split('|');
    return guests.find((g) => g.type === t && String(g.vmid) === vmid && g.node === node);
  }, [guestSel, guests]);

  const xFmt = customMode ? customXFmt(customStart, customEnd) : xFmtFor(tf);
  const rangeText = customMode ? `${customStart} → ${customEnd}` : tf;

  const load = useCallback(async () => {
    let url = '';
    if (targetType === 'node') {
      if (!nodeSel || !nodes.some((n) => n.node === nodeSel)) return;
      url = `/api/pve/${clusterId}/nodes/${encodeURIComponent(nodeSel)}/rrddata`;
    } else {
      if (!guest) return;
      // Untuk rentang kustom, guest non-running boleh dicoba (data historis bisa ada).
      if (!customMode && guest.status && guest.status !== 'running') {
        setRows(null);
        setErr(null);
        return;
      }
      url = `/api/pve/${clusterId}/nodes/${encodeURIComponent(guest.node)}/${guest.type}/${guest.vmid}/rrddata`;
    }
    setLoading(true);
    setNote(null);
    const doFetch = async (q: string) => {
      const r = await fetch(`${url}?${q}`);
      const j = await r.json().catch(() => null);
      return { r, j };
    };
    try {
      let qs: string;
      if (customMode) {
        if (!customStart || !customEnd) {
          setLoading(false);
          return;
        }
        const s = Math.floor(new Date(`${customStart}T00:00:00`).getTime() / 1000);
        const e = Math.floor(new Date(`${customEnd}T23:59:59`).getTime() / 1000);
        if (!isFinite(s) || !isFinite(e) || s >= e) {
          setLoading(false);
          return;
        }
        qs = `start=${s}&end=${e}&cf=AVERAGE`;
      } else {
        qs = `timeframe=${tf}&cf=AVERAGE`;
      }
      let { r, j } = await doFetch(qs);
      // PVE lama (mis. 4.x) menolak start/end pada rrddata → pakai timeframe terdekat.
      if (customMode && !r.ok) {
        const msg = String(j?.error ?? '');
        if (/schema|not defined|not optional|property is missing/i.test(msg) || r.status === 400) {
          qs = `timeframe=${tfFromRange(customStart, customEnd)}&cf=AVERAGE`;
          ({ r, j } = await doFetch(qs));
          if (r.ok) setNote(L.graphs.oldPveNote);
        }
      }
      if (!r.ok) {
        setErr(j?.error ?? `HTTP ${r.status}`);
        setRows(null);
        return;
      }
      setErr(null);
      const list = ((j?.data ?? []) as Array<{ time?: number }>).map((e) => ({
        ...e,
        t: (e.time ?? 0) * 1000
      }));
      setRows(list);
      setUpdated(new Date());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clusterId, targetType, nodeSel, guest, tf, customMode, customStart, customEnd, nodes, L]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const GIB = 1 / 1024 ** 3;
  const cpuSeries = [{ key: 'cpu', label: 'CPU', color: '#fb923c', scale: 100 }];
  const memSeries =
    targetType === 'node'
      ? [
          { key: 'memused', label: L.graphs.serUsed, color: '#38bdf8', scale: GIB },
          { key: 'memtotal', label: L.graphs.serTotal, color: '#52525b', scale: GIB }
        ]
      : [
          { key: 'mem', label: L.graphs.serUsed, color: '#38bdf8', scale: GIB },
          { key: 'maxmem', label: L.graphs.serAlloc, color: '#52525b', scale: GIB }
        ];
  const netSeries = [
    { key: 'netin', label: L.graphs.serIn, color: '#34d399' },
    { key: 'netout', label: L.graphs.serOut, color: '#818cf8' }
  ];
  const diskSeries = [
    { key: 'diskread', label: L.graphs.serRead, color: '#fbbf24' },
    { key: 'diskwrite', label: L.graphs.serWrite, color: '#f472b6' }
  ];

  function Card({ title, series, yFmt, tip }: { title: string; series: { key: string; label: string; color: string; scale?: number }[]; yFmt: (v: number) => string; tip: (v: number, name: string) => string }) {
    const hasData = rows?.some((r) => series.some((s) => r[s.key] != null));
    return (
      <div className="card p-4">
        <div className="mb-3"><h3 className="text-sm font-medium text-zinc-300">{title}</h3></div>
        {hasData ? (
          <TrendChart data={rows ?? []} series={series} xTickFmt={(ms) => xFmt(ms)} yFmt={yFmt} tipFmt={tip} />
        ) : (
          <p className="py-10 text-center text-xs text-zinc-600">{L.graphs.noChart}</p>
        )}
      </div>
    );
  }

  const targetLabel =
    targetType === 'node' ? `Node ${nodeSel}` : guest ? `${guest.type.toUpperCase()} ${guest.vmid} · ${guest.name}` : '-';

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">{L.graphs.target}</label>
          <select className="input w-auto min-w-[130px]" value={targetType} onChange={(e) => setTargetType(e.target.value as TargetType)}>
            <option value="node">{L.graphs.tNode}</option>
            <option value="guest">{L.graphs.tGuest}</option>
          </select>
        </div>
        {targetType === 'node' ? (
          <div>
            <label className="label">{L.graphs.tNode}</label>
            <select className="input w-auto min-w-[160px]" value={nodeSel} onChange={(e) => setNodeSel(e.target.value)}>
              {nodes.map((n) => (
                <option key={n.node} value={n.node}>{n.node}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">{L.graphs.tGuest}</label>
            <select className="input w-auto min-w-[220px]" value={guestSel} onChange={(e) => setGuestSel(e.target.value)}>
              {guests.length === 0 && <option value="">—</option>}
              {guests.map((g) => (
                <option key={guestKeyOf(g)} value={guestKeyOf(g)}>
                  {g.type === 'qemu' ? 'VM' : 'CT'} {g.vmid} · {g.name} ({g.node})
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">{L.graphs.range}</label>
          <div className="flex flex-wrap items-center gap-1">
            {!customMode &&
              TFS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTf(t)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-orange-500/60 active:scale-95 ${
                    tf === t ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setCustomMode((v) => !v)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-orange-500/60 active:scale-95 ${
                customMode ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
              }`}
            >
              {L.graphs.custom}
            </button>
          </div>
          {customMode && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                className="input w-auto"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label={L.graphs.from}
              />
              <span className="text-xs text-zinc-500">{L.graphs.to}</span>
              <input
                type="date"
                className="input w-auto"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label={L.graphs.to}
              />
            </div>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-ghost ml-auto">
          <RefreshIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {L.common.refresh}
        </button>
      </div>

      {note && !err && (
        <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-300/90">{note}</p>
      )}

      {err && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{err}</p>
      )}

      <p className="text-xs text-zinc-600">
        {L.graphs.showing} <span className="text-zinc-400">{targetLabel}</span> · {rangeText}
        {updated ? ` · ${fmt(L.graphs.updatedAt, { time: updated.toLocaleTimeString('id-ID', { hour12: false }) })}` : ''}
      </p>

      {targetType === 'guest' && !customMode && guest && guest.status && guest.status !== 'running' ? (
        <div className="card flex flex-col items-center justify-center rounded-xl border-dashed border-amber-700/50 bg-amber-950/20 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-400">
            <PowerIcon className="h-7 w-7" />
          </span>
          <h3 className="mt-4 text-lg font-medium text-zinc-100">{L.graphs.offlineTitle}</h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-400">
            {fmt(L.graphs.offlineDesc, {
              k: guest.type === 'qemu' ? 'VM' : 'CT',
              name: guest.name,
              vmid: guest.vmid,
              node: guest.node,
              status: guest.status
            })}
          </p>
          <a href={`/dashboard/vms?c=${clusterId}`} className="btn-primary mt-6">{L.graphs.offlineBtn}</a>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={L.graphs.chartCpu} series={cpuSeries} yFmt={(v) => `${Math.round(v)}%`} tip={(v) => `${v.toFixed(1)}%`} />
          <Card title={L.graphs.chartMem} series={memSeries} yFmt={(v) => `${v.toFixed(1)} GiB`} tip={(v) => `${v.toFixed(2)} GiB`} />
          <Card title={L.graphs.chartNet} series={netSeries} yFmt={(v) => fmtBytes(v)} tip={(v, name) => `${name}: ${fmtBytes(v)}/s`} />
          {targetType === 'guest' ? (
            <Card title={L.graphs.chartIo} series={diskSeries} yFmt={(v) => fmtBytes(v)} tip={(v, name) => `${name}: ${fmtBytes(v)}/s`} />
          ) : (
            <>
              <Card title={L.graphs.chartRoot} series={[{ key: 'rootused', label: L.graphs.serUsed, color: '#fbbf24', scale: GIB }, { key: 'roottotal', label: L.graphs.serTotal, color: '#52525b', scale: GIB }]} yFmt={(v) => `${v.toFixed(0)} GiB`} tip={(v) => `${v.toFixed(2)} GiB`} />
              <Card title={L.graphs.chartSwap} series={[{ key: 'swapused', label: L.graphs.serUsed, color: '#f472b6', scale: GIB }, { key: 'swaptotal', label: L.graphs.serTotal, color: '#52525b', scale: GIB }]} yFmt={(v) => `${v.toFixed(0)} GiB`} tip={(v) => `${v.toFixed(2)} GiB`} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
