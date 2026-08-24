'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendChart } from './TrendChart';
import { RefreshIcon } from './icons';
import { fmtBytes } from '@/lib/format';

type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'year';
type TargetType = 'node' | 'guest';

interface GuestLite {
  vmid: number;
  type: 'qemu' | 'lxc';
  name: string;
  node: string;
}

interface Props {
  clusterId: string;
  nodes: { node: string; status: string }[];
  guests: GuestLite[];
  init: { targetType: TargetType; node?: string; guestKey?: string; tf: Timeframe };
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

export default function RrdExplorer({ clusterId, nodes, guests, init }: Props) {
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ [k: string]: number | null }> | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const guest = useMemo(() => {
    const [t, vmid, node] = (guestSel || '').split('|');
    return guests.find((g) => g.type === t && String(g.vmid) === vmid && g.node === node);
  }, [guestSel, guests]);


  const load = useCallback(async () => {
    let url = '';
    if (targetType === 'node') {
      if (!nodeSel || !nodes.some((n) => n.node === nodeSel)) return;
      url = `/api/pve/${clusterId}/nodes/${encodeURIComponent(nodeSel)}/rrddata`;
    } else {
      if (!guest) return;
      url = `/api/pve/${clusterId}/nodes/${encodeURIComponent(guest.node)}/${guest.type}/${guest.vmid}/rrddata`;
    }
    setLoading(true);
    try {
      const r = await fetch(`${url}?timeframe=${tf}&cf=AVERAGE`);
      const j = await r.json().catch(() => null);
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
  }, [clusterId, targetType, nodeSel, guest, tf, nodes]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const cpuSeries = [{ key: 'cpu', label: 'CPU', color: '#fb923c', scale: 100 }];
  const GIB = 1 / 1024 ** 3;
  const memSeries =
    targetType === 'node'
      ? [
          { key: 'memused', label: 'Terpakai', color: '#38bdf8', scale: GIB },
          { key: 'memtotal', label: 'Total', color: '#52525b', scale: GIB }
        ]
      : [
          { key: 'mem', label: 'Terpakai', color: '#38bdf8', scale: GIB },
          { key: 'maxmem', label: 'Alokasi', color: '#52525b', scale: GIB }
        ];
  const netSeries = [
    { key: 'netin', label: 'In', color: '#34d399' },
    { key: 'netout', label: 'Out', color: '#818cf8' }
  ];
  const diskSeries = [
    { key: 'diskread', label: 'Read', color: '#fbbf24' },
    { key: 'diskwrite', label: 'Write', color: '#f472b6' }
  ];

  function Card({
    title,
    series,
    yFmt,
    tip
  }: {
    title: string;
    series: { key: string; label: string; color: string; scale?: number }[];
    yFmt: (v: number) => string;
    tip: (v: number, name: string) => string;
  }) {
    const hasData = rows?.some((r) => series.some((s) => r[s.key] != null));
    return (
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
        </div>
        {hasData ? (
          <TrendChart data={rows ?? []} series={series} xTickFmt={(ms) => xFmtFor(tf)(ms)} yFmt={yFmt} tipFmt={tip} />
        ) : (
          <p className="py-10 text-center text-xs text-zinc-600">Tidak ada data untuk rentang ini.</p>
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
          <label className="label">Target</label>
          <select
            className="input w-auto min-w-[130px]"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TargetType)}
          >
            <option value="node">Node</option>
            <option value="guest">VM / CT</option>
          </select>
        </div>

        {targetType === 'node' ? (
          <div>
            <label className="label">Node</label>
            <select className="input w-auto min-w-[160px]" value={nodeSel} onChange={(e) => setNodeSel(e.target.value)}>
              {nodes.map((n) => (
                <option key={n.node} value={n.node}>
                  {n.node}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="label">Guest</label>
            <select
              className="input w-auto min-w-[220px]"
              value={guestSel}
              onChange={(e) => setGuestSel(e.target.value)}
            >
              {guests.length === 0 && <option value="">— tidak ada guest —</option>}
              {guests.map((g) => (
                <option key={`${g.type}|${g.vmid}|${g.node}`} value={`${g.type}|${g.vmid}|${g.node}`}>
                  {g.type === 'qemu' ? 'VM' : 'CT'} {g.vmid} · {g.name} ({g.node})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">Rentang</label>
          <div className="flex gap-1">
            {TFS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                  tf === t ? 'bg-orange-500/15 text-orange-400' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={load} disabled={loading} className="btn-ghost ml-auto">
          <RefreshIcon className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Muat ulang
        </button>
      </div>

      {err && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{err}</p>
      )}

      <p className="text-xs text-zinc-600">
        Menampilkan: <span className="text-zinc-400">{targetLabel}</span> · rentang {tf}
        {updated ? ` · diperbarui ${updated.toLocaleTimeString('id-ID', { hour12: false })}` : ''}
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="CPU (%)" series={cpuSeries} yFmt={(v) => `${Math.round(v)}%`} tip={(v) => `${v.toFixed(1)}%`} />
        <Card
          title="Memori"
          series={memSeries}
          yFmt={(v) => `${v.toFixed(1)} GiB`}
          tip={(v) => `${v.toFixed(2)} GiB`}
        />
        <Card
          title="Network"
          series={netSeries}
          yFmt={(v) => fmtBytes(v)}
          tip={(v, name) => `${name}: ${fmtBytes(v)}/s`}
        />
        {targetType === 'guest' ? (
          <Card
            title="Disk IO"
            series={diskSeries}
            yFmt={(v) => fmtBytes(v)}
            tip={(v, name) => `${name}: ${fmtBytes(v)}/s`}
          />
        ) : (
          <>
            <Card
              title="Disk Root"
              series={[
                { key: 'rootused', label: 'Terpakai', color: '#fbbf24', scale: GIB },
                { key: 'roottotal', label: 'Total', color: '#52525b', scale: GIB }
              ]}
              yFmt={(v) => `${v.toFixed(0)} GiB`}
              tip={(v) => `${v.toFixed(2)} GiB`}
            />
            <Card
              title="Swap"
              series={[
                { key: 'swapused', label: 'Terpakai', color: '#f472b6', scale: GIB },
                { key: 'swaptotal', label: 'Total', color: '#52525b', scale: GIB }
              ]}
              yFmt={(v) => `${v.toFixed(0)} GiB`}
              tip={(v) => `${v.toFixed(2)} GiB`}
            />
          </>
        )}
      </div>
    </div>
  );
}
