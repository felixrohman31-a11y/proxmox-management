'use client';

import { useCallback, useEffect, useState } from 'react';
import { useL } from './lang-context';
import { AlertIcon, CheckIcon, RefreshIcon } from './icons';
import type { PublicCluster } from '@/types';

type Kind = 'cluster' | 'node' | 'guest';

interface Window {
  id: string;
  clusterId: string;
  kind: Kind;
  node?: string;
  vmid?: number;
  type?: 'qemu' | 'lxc';
  startSec: number;
  endSec: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

const wibFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
});
function fmtWib(sec: number): string {
  return wibFmt.format(new Date(sec * 1000));
}
function toEpoch(local: string): number {
  const t = new Date(local).getTime();
  return isFinite(t) ? Math.floor(t / 1000) : NaN;
}
// default rentang: hari ini jam 00:00 → +4 jam, dalam nilai datetime-local
function defaultRange(): { start: string; end: string } {
  const now = new Date();
  const s = new Date(now); s.setHours(0, 0, 0, 0);
  const e = new Date(s.getTime() + 4 * 3600 * 1000);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { start: iso(s), end: iso(e) };
}

export default function MaintenancePanel({ clusters }: { clusters: PublicCluster[] }) {
  const L = useL();
  const d0 = defaultRange();
  const [list, setList] = useState<Window[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [clusterId, setClusterId] = useState(clusters[0]?.id ?? '');
  const [kind, setKind] = useState<Kind>('cluster');
  const [node, setNode] = useState('');
  const [vmid, setVmid] = useState('');
  const [type, setType] = useState<'any' | 'qemu' | 'lxc'>('any');
  const [start, setStart] = useState(d0.start);
  const [end, setEnd] = useState(d0.end);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const clusterName = useCallback(
    (id: string) => clusters.find((c) => c.id === id)?.name ?? id.slice(0, 8),
    [clusters]
  );

  const load = useCallback(async () => {
    const r = await fetch('/api/maintenance');
    if (!r.ok) return;
    const j = await r.json();
    setList(Array.isArray(j.windows) ? j.windows : []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setMsg(null);
    if (!clusterId) return;
    if (kind !== 'cluster' && !node.trim()) {
      setMsg({ kind: 'err', text: L.maintenance.errNode });
      return;
    }
    if (kind === 'guest' && !(Number(vmid) > 0)) {
      setMsg({ kind: 'err', text: L.maintenance.errVmid });
      return;
    }
    const s = toEpoch(start);
    const e = toEpoch(end);
    if (!isFinite(s) || !isFinite(e) || e <= s) {
      setMsg({ kind: 'err', text: L.maintenance.errRange });
      return;
    }
    setBusy('add');
    try {
      const r = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId,
          kind,
          node: kind !== 'cluster' ? node.trim() : undefined,
          vmid: kind === 'guest' ? Number(vmid) : undefined,
          type: kind === 'guest' && type !== 'any' ? type : undefined,
          startSec: s,
          endSec: e,
          reason
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? L.maintenance.errSave });
      else {
        setMsg({ kind: 'ok', text: L.maintenance.saved });
        setReason('');
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(`del:${id}`);
    setMsg(null);
    try {
      const r = await fetch(`/api/maintenance?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? L.maintenance.errDelete });
      else {
        setMsg({ kind: 'ok', text: L.maintenance.removed });
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const stateOf = (w: Window) =>
    now >= w.startSec && now < w.endSec ? L.maintenance.active
    : now < w.startSec ? L.maintenance.upcoming : L.maintenance.past;
  const stateCls = (w: Window) =>
    now >= w.startSec && now < w.endSec
      ? 'bg-emerald-500/10 text-emerald-400'
      : now < w.startSec
        ? 'bg-sky-500/10 text-sky-400'
        : 'bg-zinc-700/40 text-zinc-400';

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-zinc-200">{L.maintenance.title}</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-zinc-500">{L.maintenance.desc}</p>

      {loaded && (
        <div className="mb-5 space-y-2">
          {list.length === 0 && (
            <p className="text-sm text-zinc-600">{L.maintenance.empty}</p>
          )}
          {list.map((w) => {
            const scope =
              w.kind === 'cluster' ? L.maintenance.kCluster
              : w.kind === 'node' ? `${L.maintenance.kNode}: ${w.node}`
              : `${L.maintenance.kGuest}: ${w.vmid}${w.node ? ` @${w.node}` : ''}`;
            return (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-200">{clusterName(w.clusterId)}</span>
                    <span className="text-zinc-500">· {scope}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${stateCls(w)}`}>{stateOf(w)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {fmtWib(w.startSec)} → {fmtWib(w.endSec)}
                    {w.reason && <span className="text-zinc-400"> · {w.reason}</span>}
                    {w.createdBy && <span className="text-zinc-600"> · {L.maintenance.by} {w.createdBy}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-lg border border-red-900/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                >
                  {busy === `del:${w.id}` ? <RefreshIcon className="h-3.5 w-3.5 animate-spin" /> : L.maintenance.delete}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        <div>
          <label className="label">{L.maintenance.cluster}</label>
          <select className="input" value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{L.maintenance.scope}</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="cluster">{L.maintenance.kCluster}</option>
            <option value="node">{L.maintenance.kNode}</option>
            <option value="guest">{L.maintenance.kGuest}</option>
          </select>
        </div>
        {kind !== 'cluster' && (
          <div>
            <label className="label">{L.maintenance.node}</label>
            <input className="input" value={node} onChange={(e) => setNode(e.target.value)} placeholder={L.maintenance.nodePh} />
          </div>
        )}
        {kind === 'guest' && (
          <>
            <div>
              <label className="label">{L.maintenance.vmid}</label>
              <input className="input" inputMode="numeric" value={vmid} onChange={(e) => setVmid(e.target.value.replace(/\D/g, ''))} placeholder="100" />
            </div>
            <div>
              <label className="label">{L.maintenance.type}</label>
              <select className="input" value={type} onChange={(e) => setType(e.target.value as 'any' | 'qemu' | 'lxc')}>
                <option value="any">{L.maintenance.anyType}</option>
                <option value="qemu">qemu</option>
                <option value="lxc">lxc</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label className="label">{L.maintenance.start}</label>
          <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">{L.maintenance.end}</label>
          <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="label">{L.maintenance.reason}</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L.maintenance.reasonPh} maxLength={300} />
        </div>

        {msg && (
          <p
            className={`col-span-2 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm sm:col-span-3 ${
              msg.kind === 'err'
                ? 'border-red-900/60 bg-red-950/40 text-red-300'
                : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
            }`}
          >
            {msg.kind === 'err' ? <AlertIcon className="h-4 w-4 shrink-0" /> : <CheckIcon className="h-4 w-4 shrink-0" />}
            {msg.text}
          </p>
        )}

        <div className="col-span-2 flex gap-2 sm:col-span-3">
          <button type="submit" disabled={busy !== null} className="btn-primary">
            {busy === 'add' && <RefreshIcon className="h-4 w-4 animate-spin" />} {L.maintenance.add}
          </button>
        </div>
      </form>
    </div>
  );
}
