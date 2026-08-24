'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from './StatusBadge';
import { Meter } from './StatCard';
import { Th, Td } from './TableBits';
import {
  ChartIcon,
  ExternalIcon,
  PlayIcon,
  PowerIcon,
  RefreshIcon,
  RotateIcon,
  SearchIcon,
  StopIcon
} from './icons';
import type { ReactNode } from 'react';
import type { ActiveTask, GuestRow } from '@/types';
import { fmtBytes, fmtUptime, pct } from '@/lib/format';

type ActionKind = 'start' | 'shutdown' | 'reboot' | 'stop';

const ACTION_LABEL: Record<ActionKind, string> = {
  start: 'Start',
  shutdown: 'Shutdown',
  reboot: 'Reboot',
  stop: 'Force Stop'
};

interface Props {
  clusterId: string;
  host: string;
  port: number;
  guests: GuestRow[];
}

function Chip({ tone = 'default', children }: { tone?: 'default' | 'emerald' | 'amber'; children: ReactNode }) {
  const tones = {
    default: 'border-zinc-800 bg-zinc-900 text-zinc-400',
    emerald: 'border-emerald-800/50 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-700/50 bg-amber-500/10 text-amber-400'
  };
  return <span className={`rounded-full border px-2.5 py-1 font-medium ${tones[tone]}`}>{children}</span>;
}

function TypeBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
  );
}

function ActBtn({
  title,
  onClick,
  busy,
  tone,
  children
}: {
  title: string;
  onClick: () => void;
  busy?: boolean;
  tone: 'emerald' | 'ghost' | 'red';
  children: ReactNode;
}) {
  const tones = {
    emerald: 'border-emerald-700/60 text-emerald-400 hover:bg-emerald-500/10',
    ghost: 'border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
    red: 'border-red-800/60 text-red-400 hover:bg-red-500/10'
  };
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={`rounded-md border p-1.5 transition disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <RefreshIcon className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

export default function VmTable({ clusterId, host, port, guests }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [nodeF, setNodeF] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (tasks.length === 0) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      for (const t of [...tasks]) {
        try {
          const r = await fetch(
            `/api/pve/${clusterId}/nodes/${encodeURIComponent(t.node)}/tasks/${encodeURIComponent(t.upid)}/status`
          );
          const j = await r.json().catch(() => null);
          const d = (j?.data ?? {}) as { status?: string; exitstatus?: string };
          const finished = d.exitstatus !== undefined || d.status === 'stopped';
          if (!finished || cancelled) continue;
          const ok = String(d.exitstatus ?? '')
            .toUpperCase()
            .includes('OK');
          setToast(
            ok
              ? { kind: 'ok', msg: `${ACTION_LABEL[t.action as ActionKind]} ${t.vmid} selesai — task OK.` }
              : {
                  kind: 'err',
                  msg: `${ACTION_LABEL[t.action as ActionKind]} ${t.vmid} GAGAL: ${d.exitstatus ?? 'unknown error'}`
                }
          );
          setTasks((cur) => cur.filter((x) => x.upid !== t.upid));
          router.refresh();
        } catch {
          // biarkan dicoba lagi di tick berikutnya
        }
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [tasks, clusterId, router]);

  const rowHasTask = (g: GuestRow) => tasks.some((t) => t.vmid === g.vmid);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selKey = (g: GuestRow) => `${g.type}-${g.vmid}-${g.node}`;
  const selectable = (g: GuestRow) =>
    !g.template && (g.status === 'running' || g.status === 'stopped');

  function toggleSel(g: GuestRow) {
    const k = selKey(g);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAllFiltered() {
    const eligible = filtered.filter(selectable);
    const allSelected = eligible.length > 0 && eligible.every((g) => selected.has(selKey(g)));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const g of eligible) {
        if (allSelected) next.delete(selKey(g));
        else next.add(selKey(g));
      }
      return next;
    });
  }

  async function bulkRun(action: 'start' | 'shutdown') {
    const targets = filtered.filter(
      (g) =>
        selected.has(selKey(g)) &&
        selectable(g) &&
        (action === 'start' ? g.status === 'stopped' : g.status === 'running')
    );
    if (targets.length === 0) return;
    const label = ACTION_LABEL[action];
    if (!window.confirm(`Jalankan ${label} untuk ${targets.length} guest terpilih?`)) return;

    setBusy(`bulk:${action}`);
    let sent = 0;
    let fail = 0;
    for (const g of targets) {
      try {
        const res = await fetch(
          `/api/pve/${clusterId}/nodes/${encodeURIComponent(g.node)}/${g.type}/${g.vmid}/status/${action}`,
          { method: 'POST' }
        );
        const j = await res.json().catch(() => null);
        const upid =
          typeof j?.data === 'string' && j.data.startsWith('UPID:') ? j.data : null;
        if (res.ok && upid) {
          setTasks((cur) => [...cur, { upid, node: g.node, vmid: g.vmid, action }]);
          sent++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }
    setBusy(null);
    setSelected(new Set());
    setToast({
      kind: fail > 0 ? 'err' : 'ok',
      msg: `${label} massal: ${sent} task dikirim${fail > 0 ? `, ${fail} gagal` : ''}.`
    });
    setTimeout(() => router.refresh(), 1500);
  }

  const nodeList = useMemo(() => Array.from(new Set(guests.map((g) => g.node))).sort(), [guests]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return guests.filter((g) => {
      if (typeF && g.type !== typeF) return false;
      if (statusF) {
        if (statusF === 'template') {
          if (!g.template) return false;
        } else if (g.template || g.status !== statusF) return false;
      }
      if (nodeF && g.node !== nodeF) return false;
      if (!needle) return true;
      return (
        String(g.vmid).includes(needle) ||
        g.name.toLowerCase().includes(needle) ||
        g.node.toLowerCase().includes(needle) ||
        g.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [guests, q, typeF, statusF, nodeF]);

  const selectedGuests = useMemo(
    () => filtered.filter((g) => selected.has(selKey(g))),
    [filtered, selected]
  );

  const eligibleFiltered = filtered.filter(selectable);
  const allFilteredSelected =
    eligibleFiltered.length > 0 && eligibleFiltered.every((g) => selected.has(selKey(g)));

  async function act(g: GuestRow, action: ActionKind) {
    if (
      action === 'stop' &&
      !window.confirm(
        `Force stop ${g.type === 'qemu' ? 'VM' : 'CT'} ${g.vmid} (${g.name})?\nData yang belum tersimpan bisa hilang.`
      )
    ) {
      return;
    }
    const key = `${g.vmid}:${action}`;
    setBusy(key);
    try {
      const res = await fetch(
        `/api/pve/${clusterId}/nodes/${encodeURIComponent(g.node)}/${g.type}/${g.vmid}/status/${action}`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: 'err', msg: json.error ?? `Perintah ${action} gagal (HTTP ${res.status}).` });
      } else {
        const upid =
          typeof json.data === 'string' && json.data.startsWith('UPID:') ? json.data : null;
        if (upid) {
          setTasks((cur) => [...cur, { upid, node: g.node, vmid: g.vmid, action }]);
          setToast({ kind: 'ok', msg: `${ACTION_LABEL[action]} ${g.vmid} — task berjalan, memantau status…` });
        } else {
          setToast({ kind: 'ok', msg: `Perintah ${action} untuk ${g.vmid} dikirim.` });
          router.refresh();
        }
      }
    } catch (e) {
      setToast({ kind: 'err', msg: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function consoleUrl(g: GuestRow): string {
    return `/dashboard/console?c=${clusterId}&node=${encodeURIComponent(g.node)}&type=${g.type}&vmid=${g.vmid}&name=${encodeURIComponent(g.name)}`;
  }

  const runningCount = guests.filter((g) => !g.template && g.status === 'running').length;
  const stoppedCount = guests.filter((g) => !g.template && g.status !== 'running').length;
  const templateCount = guests.filter((g) => g.template).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip>Total {guests.length}</Chip>
        <Chip tone="emerald">Running {runningCount}</Chip>
        <Chip>Stopped {stoppedCount}</Chip>
        <Chip tone="amber">Template {templateCount}</Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, VMID, node, tag…"
            className="input w-64 pl-8"
          />
        </div>
        <select className="input w-auto" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
          <option value="">Semua tipe</option>
          <option value="qemu">VM (qemu)</option>
          <option value="lxc">Container (lxc)</option>
        </select>
        <select className="input w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">Semua status</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
          <option value="paused">Paused</option>
          <option value="template">Template</option>
        </select>
        <select className="input w-auto" value={nodeF} onChange={(e) => setNodeF(e.target.value)}>
          <option value="">Semua node</option>
          {nodeList.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-800/50 bg-orange-500/5 p-3 text-sm">
          <span className="font-medium text-zinc-200">{selected.size} dipilih</span>
          {selectedGuests.some((g) => g.status === 'stopped') && (
            <button type="button" className="btn-primary" disabled={Boolean(busy) || tasks.length > 0} onClick={() => bulkRun('start')}>
              Start Terpilih
            </button>
          )}
          {selectedGuests.some((g) => g.status === 'running') && (
            <button type="button" className="btn-danger" disabled={Boolean(busy) || tasks.length > 0} onClick={() => bulkRun('shutdown')}>
              Shutdown Terpilih
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSelected(new Set())}>
            Bersihkan
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left">
            <thead className="bg-zinc-900/60">
              <tr>
                <Th className="w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label="Pilih semua"
                    className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
                  />
                </Th>
                <Th>VMID</Th>
                <Th>Nama</Th>
                <Th>Tipe</Th>
                <Th>Node</Th>
                <Th>Status</Th>
                <Th>CPU</Th>
                <Th className="min-w-[8rem]">Memori</Th>
                <Th className="min-w-[9rem]">Disk</Th>
                <Th>Uptime</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {filtered.map((g) => (
                <tr key={`${g.type}-${g.vmid}-${g.node}`} className="hover:bg-zinc-900/40">
                  <Td>
                    {selectable(g) && (
                      <input
                        type="checkbox"
                        checked={selected.has(selKey(g))}
                        onChange={() => toggleSel(g)}
                        aria-label={`Pilih ${g.name}`}
                        className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
                      />
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-zinc-400">{g.vmid}</span>
                  </Td>
                  <Td>
                    <div className="max-w-[220px] truncate font-medium text-zinc-100">{g.name}</div>
                    {g.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {g.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {t}
                          </span>
                        ))}
                        {g.tags.length > 3 && (
                          <span className="text-[10px] text-zinc-600">+{g.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {g.template ? (
                      <TypeBadge label="TEMPLATE" cls="bg-amber-500/10 text-amber-400" />
                    ) : g.type === 'qemu' ? (
                      <TypeBadge label="VM" cls="bg-indigo-500/10 text-indigo-400" />
                    ) : (
                      <TypeBadge label="CT" cls="bg-cyan-500/10 text-cyan-400" />
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-zinc-400">{g.node}</Td>
                  <Td>
                    <StatusBadge status={g.template ? 'template' : g.status} />
                  </Td>
                  <Td className="tabular-nums">{g.cpuPercent}%</Td>
                  <Td className="min-w-[7rem]">
                    <Meter value={pct(g.memUsed, g.memMax)} />
                    <span className="mt-1 block whitespace-nowrap text-xs text-zinc-500">
                      {fmtBytes(g.memUsed)} / {fmtBytes(g.memMax)}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-zinc-400">
                    {fmtBytes(g.diskUsed)} / {fmtBytes(g.diskMax)}
                  </Td>
                  <Td className="whitespace-nowrap text-zinc-400">{fmtUptime(g.uptime)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      {!g.template && g.status === 'stopped' && (
                        <ActBtn
                          title="Start"
                          tone="emerald"
                          busy={busy === `${g.vmid}:start` || rowHasTask(g)}
                          onClick={() => act(g, 'start')}
                        >
                          <PlayIcon />
                        </ActBtn>
                      )}
                      {!g.template && g.status === 'running' && (
                        <>
                          <ActBtn
                            title="Reboot"
                            tone="ghost"
                            busy={busy === `${g.vmid}:reboot` || rowHasTask(g)}
                            onClick={() => act(g, 'reboot')}
                          >
                            <RotateIcon />
                          </ActBtn>
                          <ActBtn
                            title="Shutdown"
                            tone="ghost"
                            busy={busy === `${g.vmid}:shutdown` || rowHasTask(g)}
                            onClick={() => act(g, 'shutdown')}
                          >
                            <PowerIcon />
                          </ActBtn>
                          <ActBtn
                            title="Force Stop"
                            tone="red"
                            busy={busy === `${g.vmid}:stop` || rowHasTask(g)}
                            onClick={() => act(g, 'stop')}
                          >
                            <StopIcon />
                          </ActBtn>
                        </>
                      )}
                      <a
                        href={`/dashboard/graphs?c=${clusterId}&t=guest&g=${encodeURIComponent(
                          `${g.type}|${g.vmid}|${g.node}`
                        )}&tf=day`}
                        title="Grafik monitoring"
                        className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <ChartIcon />
                      </a>
                      <a
                        href={consoleUrl(g)}
                        target="_blank"
                        rel="noreferrer"
                        title="Buka konsol noVNC (via web Proxmox)"
                        className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <ExternalIcon />
                      </a>
                    </div>
                  </Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-zinc-500">
                    Tidak ada guest yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl ${
            toast.kind === 'err'
              ? 'border-red-900 bg-red-950/90 text-red-200'
              : 'border-emerald-800 bg-emerald-950/90 text-emerald-200'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
