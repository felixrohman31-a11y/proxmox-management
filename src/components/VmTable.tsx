'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react';
import type { ActiveTask, GuestRow } from '@/types';
import { fmtBytes, fmtUptime, pct } from '@/lib/format';
import { useL } from './lang-context';
import { fmt } from '@/lib/i18n-dict';

type ActionKind = 'start' | 'shutdown' | 'reboot' | 'stop';
type SortKey = 'vmid' | 'name' | 'cpu' | 'mem' | 'uptime' | 'status';
type ColKey = 'vmid' | 'name' | 'type' | 'node' | 'status' | 'cpu' | 'mem' | 'disk' | 'uptime' | 'act';

interface Props {
  clusterId: string;
  host: string;
  port: number;
  guests: GuestRow[];
  readOnly?: boolean;
}

function Chip({
  tone = 'default',
  active = false,
  onClick,
  children
}: {
  tone?: 'default' | 'emerald' | 'amber';
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const tones = {
    default: 'border-zinc-800 bg-zinc-900 text-zinc-400',
    emerald: 'border-emerald-800/50 bg-emerald-500/10 text-emerald-400',
    amber: 'border-amber-700/50 bg-amber-500/10 text-amber-400'
  };
  const cls = onClick ? (active ? 'border-orange-600/60 bg-orange-500/10 text-orange-300' : tones[tone]) : tones[tone];
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 font-medium transition ${cls}`}>
        {children}
      </button>
    );
  }
  return <span className={`rounded-full border px-2.5 py-1 font-medium ${tones[tone]}`}>{children}</span>;
}

function TypeBadge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
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
      className={`rounded-md border p-1.5 transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${tones[tone]}`}
    >
      {busy ? <RefreshIcon className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        active
          ? 'border-orange-600/60 bg-orange-500/10 text-orange-300'
          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}

export default function VmTable({ clusterId, guests, readOnly = false }: Props) {
  const router = useRouter();
  const L = useL();
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('');
  const [nodeF, setNodeF] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set());

  const COL_DEFAULTS: Record<ColKey, number> = {
    vmid: 96,
    name: 220,
    type: 76,
    node: 120,
    status: 116,
    cpu: 84,
    mem: 168,
    disk: 168,
    uptime: 144,
    act: 168
  };
  const FIXED_W: Record<string, number> = { chevron: 36, select: 36 };
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const raw = localStorage.getItem('pm_col_widths');
      if (raw) return { ...COL_DEFAULTS, ...(JSON.parse(raw) as Partial<Record<ColKey, number>>) };
    } catch {
      /* noop */
    }
    return COL_DEFAULTS;
  });
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const widthOf = (id: ColKey | 'chevron' | 'select'): number =>
    id === 'chevron' || id === 'select' ? FIXED_W[id] : widths[id as ColKey];

  const ACTION_LABEL: Record<ActionKind, string> = {
    start: L.vms.aStart,
    shutdown: L.vms.aShutdown,
    reboot: L.vms.aReboot,
    stop: L.vms.aForceStop
  };

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
              ? {
                  kind: 'ok',
                  msg: fmt(L.vms.toastDone, { label: ACTION_LABEL[t.action as ActionKind], vmid: t.vmid })
                }
              : {
                  kind: 'err',
                  msg: fmt(L.vms.toastFail, {
                    label: ACTION_LABEL[t.action as ActionKind],
                    vmid: t.vmid,
                    err: d.exitstatus ?? '-'
                  })
                }
          );
          setTasks((cur) => cur.filter((x) => x.upid !== t.upid));
          router.refresh();
        } catch {
          // coba lagi di tick berikutnya
        }
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [tasks, clusterId, router, L]);

  const rowHasTask = (g: GuestRow) => tasks.some((t) => t.vmid === g.vmid);

  async function act(g: GuestRow, action: ActionKind) {
    if (
      action === 'stop' &&
      !window.confirm(
        fmt(L.vms.confirmForce, {
          k: g.type === 'qemu' ? L.vms.kindVM : L.vms.kindCT,
          vmid: g.vmid,
          name: g.name
        })
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
        setToast({
          kind: 'err',
          msg: json.error ?? fmt(L.vms.toastHttp, { action, code: res.status })
        });
      } else {
        const upid = typeof json.data === 'string' && json.data.startsWith('UPID:') ? json.data : null;
        if (upid) {
          setTasks((cur) => [...cur, { upid, node: g.node, vmid: g.vmid, action }]);
          setToast({
            kind: 'ok',
            msg: fmt(L.vms.toastTask, { label: ACTION_LABEL[action], vmid: g.vmid })
          });
        } else {
          setToast({ kind: 'ok', msg: fmt(L.vms.toastSent, { action, vmid: g.vmid }) });
          router.refresh();
        }
      }
    } catch {
      setToast({ kind: 'err', msg: L.vms.errConnUpload });
    } finally {
      setBusy(null);
    }
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

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'vmid':
          cmp = a.vmid - b.vmid;
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'cpu':
          cmp = a.cpuPercent - b.cpuPercent;
          break;
        case 'mem':
          cmp = pct(a.memUsed, a.memMax) - pct(b.memUsed, b.memMax);
          break;
        case 'uptime':
          cmp = a.uptime - b.uptime;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [q, typeF, statusF, nodeF]);

  const selKey = (g: GuestRow) => `${g.type}-${g.vmid}-${g.node}`;
  const selectable = (g: GuestRow) => !g.template && (g.status === 'running' || g.status === 'stopped');

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
    if (!window.confirm(fmt(L.vms.confirmBulk, { label, n: targets.length }))) return;

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
        const upid = typeof j?.data === 'string' && j.data.startsWith('UPID:') ? j.data : null;
        if (res.ok && upid) {
          setTasks((cur) => [...cur, { upid, node: g.node, vmid: g.vmid, action }]);
          sent++;
        } else fail++;
      } catch {
        fail++;
      }
    }
    setBusy(null);
    setSelected(new Set());
    setToast({
      kind: fail > 0 ? 'err' : 'ok',
      msg: fmt(L.vms.bulkSent, { label, sent }) + (fail > 0 ? fmt(L.vms.bulkFailSuffix, { fail }) : '')
    });
    setTimeout(() => router.refresh(), 1500);
  }

  const selectedGuests = useMemo(() => filtered.filter((g) => selected.has(selKey(g))), [filtered, selected]);
  const eligibleFiltered = filtered.filter(selectable);
  const allFilteredSelected = eligibleFiltered.length > 0 && eligibleFiltered.every((g) => selected.has(selKey(g)));

  function consoleUrl(g: GuestRow): string {
    return `/dashboard/console?c=${clusterId}&node=${encodeURIComponent(g.node)}&type=${g.type}&vmid=${g.vmid}&name=${encodeURIComponent(g.name)}`;
  }

  function graphUrl(g: GuestRow): string {
    return `/dashboard/graphs?c=${clusterId}&t=guest&g=${encodeURIComponent(`${g.type}|${g.vmid}|${g.node}`)}&tf=day`;
  }

  const runningCount = guests.filter((g) => !g.template && g.status === 'running').length;
  const stoppedCount = guests.filter((g) => !g.template && g.status !== 'running').length;
  const templateCount = guests.filter((g) => g.template).length;

  function onSort(k: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== k) return { key: k, dir: 'asc' };
      if (prev.dir === 'asc') return { key: k, dir: 'desc' };
      return null;
    });
    setPage(1);
  }
  const arrow = (k: SortKey) => (sort?.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');

  function toggleExpand(g: GuestRow) {
    const k = selKey(g);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const vis = (k: ColKey) => !hiddenCols.has(k);
  function toggleCol(k: ColKey) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const colMenu: Array<[ColKey, string]> = [
    ['vmid', L.vms.colId],
    ['name', L.vms.colName],
    ['type', L.vms.colType],
    ['node', L.vms.colNode],
    ['status', L.vms.colStatus],
    ['cpu', L.vms.colCpu],
    ['mem', L.vms.colMem],
    ['disk', L.vms.colDisk],
    ['uptime', L.vms.colUptime],
    ['act', L.vms.colAct]
  ];

  type ColId = ColKey | 'chevron' | 'select';
  const visibleCols: ColId[] = [
    'chevron',
    ...(readOnly ? [] : (['select'] as ColId[])),
    ...((['vmid', 'name', 'type', 'node', 'status', 'cpu', 'mem', 'disk', 'uptime'] as ColKey[]).filter((k) => vis(k))),
    ...((!readOnly && vis('act')) ? (['act'] as ColId[]) : [])
  ];
  const totalWidth = visibleCols.reduce((s, c) => s + widthOf(c), 0);

  function startResize(key: string, e: ReactMouseEvent) {
    const k = key as ColKey;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthsRef.current[k];
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(56, Math.min(480, startW + (ev.clientX - startX)));
      setWidths((w) => ({ ...w, [k]: next }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try {
        localStorage.setItem('pm_col_widths', JSON.stringify(widthsRef.current));
      } catch {
        /* noop */
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function resetWidths() {
    setWidths(COL_DEFAULTS);
    try {
      localStorage.removeItem('pm_col_widths');
    } catch {
      /* noop */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <Chip
          onClick={() => {
            setTypeF('');
            setStatusF('');
            setNodeF('');
          }}
          active={!typeF && !statusF && !nodeF}
        >
          Total {guests.length}
        </Chip>
        <Chip tone="emerald" active={statusF === 'running'} onClick={() => setStatusF(statusF === 'running' ? '' : 'running')}>
          {L.vms.stRunning} {runningCount}
        </Chip>
        <Chip active={statusF === 'stopped'} onClick={() => setStatusF(statusF === 'stopped' ? '' : 'stopped')}>
          {L.vms.stStopped} {stoppedCount}
        </Chip>
        <Chip tone="amber" active={statusF === 'template'} onClick={() => setStatusF(statusF === 'template' ? '' : 'template')}>
          {L.vms.stTemplate} {templateCount}
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L.vms.search}
            className="input w-64 pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={typeF === ''} onClick={() => setTypeF('')}>
            {L.vms.allTypes}
          </FilterChip>
          <FilterChip active={typeF === 'qemu'} onClick={() => setTypeF(typeF === 'qemu' ? '' : 'qemu')}>
            {L.vms.vmq}
          </FilterChip>
          <FilterChip active={typeF === 'lxc'} onClick={() => setTypeF(typeF === 'lxc' ? '' : 'lxc')}>
            {L.vms.ctq}
          </FilterChip>
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <FilterChip active={statusF === ''} onClick={() => setStatusF('')}>
            {L.vms.allStatus}
          </FilterChip>
          <FilterChip active={statusF === 'running'} onClick={() => setStatusF(statusF === 'running' ? '' : 'running')}>
            {L.vms.stRunning}
          </FilterChip>
          <FilterChip active={statusF === 'stopped'} onClick={() => setStatusF(statusF === 'stopped' ? '' : 'stopped')}>
            {L.vms.stStopped}
          </FilterChip>
          <FilterChip active={statusF === 'paused'} onClick={() => setStatusF(statusF === 'paused' ? '' : 'paused')}>
            {L.vms.stPaused}
          </FilterChip>
          <FilterChip active={statusF === 'template'} onClick={() => setStatusF(statusF === 'template' ? '' : 'template')}>
            {L.vms.stTemplate}
          </FilterChip>
          {nodeList.length > 1 && (
            <>
              <span className="mx-1 h-4 w-px bg-zinc-800" />
              <FilterChip active={nodeF === ''} onClick={() => setNodeF('')}>
                {L.vms.allNodes}
              </FilterChip>
              {nodeList.map((n) => (
                <FilterChip key={n} active={nodeF === n} onClick={() => setNodeF(nodeF === n ? '' : n)}>
                  {n}
                </FilterChip>
              ))}
            </>
          )}
        </div>

        <details className="relative ml-auto">
          <summary className="btn-ghost h-9 cursor-pointer px-3 text-xs">{L.vms.colsLabel}</summary>
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs shadow-xl">
            {colMenu.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-zinc-800">
                <input type="checkbox" checked={vis(k)} onChange={() => toggleCol(k)} className="accent-orange-600" />
                {label}
              </label>
            ))}
            <div className="my-1 border-t border-zinc-800" />
            <button
              type="button"
              onClick={resetWidths}
              className="w-full rounded px-1 py-1 text-left text-orange-400 hover:bg-zinc-800"
            >
              {L.vms.resetColWidth}
            </button>
          </div>
        </details>
      </div>

      {selected.size > 0 && !readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-800/50 bg-orange-500/5 p-3 text-sm">
          <span className="font-medium text-zinc-200">{fmt(L.vms.selN, { n: selected.size })}</span>
          {selectedGuests.some((g) => g.status === 'stopped') && (
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(busy) || tasks.length > 0}
              onClick={() => bulkRun('start')}
            >
              {L.vms.bulkStart}
            </button>
          )}
          {selectedGuests.some((g) => g.status === 'running') && (
            <button
              type="button"
              className="btn-danger"
              disabled={Boolean(busy) || tasks.length > 0}
              onClick={() => bulkRun('shutdown')}
            >
              {L.vms.bulkShutdown}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSelected(new Set())}>
            {L.vms.clear}
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-fixed text-left" style={{ width: totalWidth }}>
            <colgroup>
              {visibleCols.map((c) => (
                <col key={c} style={{ width: widthOf(c) }} />
              ))}
            </colgroup>
            <thead className="bg-zinc-900/60">
              <tr>
                <Th className="w-8" />
                {!readOnly && (
                  <Th className="w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Pilih semua"
                      className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
                    />
                  </Th>
                )}
                {vis('vmid') && (
                  <Th onClick={() => onSort('vmid')} colKey="vmid" onResize={startResize} className="cursor-pointer select-none">
                    {L.vms.colId}
                    {arrow('vmid')}
                  </Th>
                )}
                {vis('name') && (
                  <Th onClick={() => onSort('name')} colKey="name" onResize={startResize} className="cursor-pointer select-none">
                    {L.vms.colName}
                    {arrow('name')}
                  </Th>
                )}
                {vis('type') && <Th colKey="type" onResize={startResize}>{L.vms.colType}</Th>}
                {vis('node') && <Th colKey="node" onResize={startResize}>{L.vms.colNode}</Th>}
                {vis('status') && (
                  <Th onClick={() => onSort('status')} colKey="status" onResize={startResize} className="cursor-pointer select-none">
                    {L.vms.colStatus}
                    {arrow('status')}
                  </Th>
                )}
                {vis('cpu') && (
                  <Th onClick={() => onSort('cpu')} colKey="cpu" onResize={startResize} className="cursor-pointer select-none">
                    {L.vms.colCpu}
                    {arrow('cpu')}
                  </Th>
                )}
                {vis('mem') && (
                  <Th colKey="mem" onResize={startResize} className="min-w-[8rem] cursor-pointer select-none" onClick={() => onSort('mem')}>
                    {L.vms.colMem}
                    {arrow('mem')}
                  </Th>
                )}
                {vis('disk') && <Th colKey="disk" onResize={startResize} className="min-w-[9rem]">{L.vms.colDisk}</Th>}
                {vis('uptime') && (
                  <Th onClick={() => onSort('uptime')} colKey="uptime" onResize={startResize} className="cursor-pointer select-none">
                    {L.vms.colUptime}
                    {arrow('uptime')}
                  </Th>
                )}
                {!readOnly && vis('act') && <Th colKey="act" onResize={startResize} className="text-right">{L.vms.colAct}</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {paged.map((g) => {
                const isExp = expanded.has(selKey(g));
                return (
                  <Fragment key={`${g.type}-${g.vmid}-${g.node}`}>
                    <tr
                      onClick={(e) => {
                        const t = e.target as HTMLElement;
                        if (!t.closest('a,button,input')) toggleExpand(g);
                      }}
                      className="hover:bg-zinc-900/40"
                    >
                      <Td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(g);
                          }}
                          aria-label={isExp ? 'Tutup detail' : 'Buka detail'}
                          className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          {isExp ? '⌄' : '›'}
                        </button>
                      </Td>
                      {!readOnly && (
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
                      )}
                      {vis('vmid') && (
                        <Td>
                          <span className="font-mono text-xs text-zinc-400">{g.vmid}</span>
                        </Td>
                      )}
                      {vis('name') && (
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
                      )}
                      {vis('type') && (
                        <Td>
                          {g.template ? (
                            <TypeBadge label="TEMPLATE" cls="bg-amber-500/10 text-amber-400" />
                          ) : g.type === 'qemu' ? (
                            <TypeBadge label="VM" cls="bg-indigo-500/10 text-indigo-400" />
                          ) : (
                            <TypeBadge label="CT" cls="bg-cyan-500/10 text-cyan-400" />
                          )}
                        </Td>
                      )}
                      {vis('node') && <Td className="whitespace-nowrap text-zinc-400">{g.node}</Td>}
                      {vis('status') && (
                        <Td>
                          <StatusBadge status={g.template ? 'template' : g.status} />
                        </Td>
                      )}
                      {vis('cpu') && <Td className="tabular-nums">{g.cpuPercent}%</Td>}
                      {vis('mem') && (
                        <Td className="min-w-[7rem]">
                          <Meter value={pct(g.memUsed, g.memMax)} />
                          <span className="mt-1 block whitespace-nowrap text-xs text-zinc-500">
                            {fmtBytes(g.memUsed)} / {fmtBytes(g.memMax)}
                          </span>
                        </Td>
                      )}
                      {vis('disk') && (
                        <Td className="whitespace-nowrap tabular-nums text-zinc-400">
                          {fmtBytes(g.diskUsed)} / {fmtBytes(g.diskMax)}
                        </Td>
                      )}
                      {vis('uptime') && <Td className="whitespace-nowrap text-zinc-400">{fmtUptime(g.uptime)}</Td>}
                      {!readOnly && vis('act') && (
                        <Td>
                          <div className="flex items-center justify-end gap-1">
                            {!g.template && g.status === 'stopped' && (
                              <ActBtn
                                title={L.vms.aStart}
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
                                  title={L.vms.aReboot}
                                  tone="ghost"
                                  busy={busy === `${g.vmid}:reboot` || rowHasTask(g)}
                                  onClick={() => act(g, 'reboot')}
                                >
                                  <RotateIcon />
                                </ActBtn>
                                <ActBtn
                                  title={L.vms.aShutdown}
                                  tone="ghost"
                                  busy={busy === `${g.vmid}:shutdown` || rowHasTask(g)}
                                  onClick={() => act(g, 'shutdown')}
                                >
                                  <PowerIcon />
                                </ActBtn>
                                <ActBtn
                                  title={L.vms.aForceStop}
                                  tone="red"
                                  busy={busy === `${g.vmid}:stop` || rowHasTask(g)}
                                  onClick={() => act(g, 'stop')}
                                >
                                  <StopIcon />
                                </ActBtn>
                              </>
                            )}
                            <a
                              href={graphUrl(g)}
                              title={L.vms.graphT}
                              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition duration-150 ease-out hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:scale-95"
                            >
                              <ChartIcon />
                            </a>
                            <a
                              href={consoleUrl(g)}
                              target="_blank"
                              rel="noreferrer"
                              title={L.vms.consT}
                              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition duration-150 ease-out hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:scale-95"
                            >
                              <ExternalIcon />
                            </a>
                          </div>
                        </Td>
                      )}
                    </tr>
                    {isExp && (
                      <tr className="bg-zinc-900/40">
                        <td colSpan={99} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                            <span>
                              <span className="text-zinc-500">Node:</span> {g.node}
                            </span>
                            <span>
                              <span className="text-zinc-500">Tipe:</span> {g.type === 'qemu' ? 'VM' : 'CT'}
                            </span>
                            <span>
                              <span className="text-zinc-500">Status:</span> {g.template ? 'template' : g.status}
                            </span>
                            <span>
                              <span className="text-zinc-500">Uptime:</span> {fmtUptime(g.uptime)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-zinc-500">Tags:</span>
                            {g.tags.length ? (
                              g.tags.map((t) => (
                                <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                  {t}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-zinc-600">—</span>
                            )}
                            <a href={graphUrl(g)} className="btn-ghost ml-auto h-8 px-3 text-xs">
                              {L.vms.graphT}
                            </a>
                            <a href={consoleUrl(g)} target="_blank" rel="noreferrer" className="btn-ghost h-8 px-3 text-xs">
                              {L.vms.consT}
                            </a>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={99} className="px-4 py-10 text-center text-sm text-zinc-500">
                    {L.vms.noMatch}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-zinc-400">
          <span>
            Menampilkan {Math.min(sorted.length, (safePage - 1) * pageSize + 1)}–
            {Math.min(sorted.length, safePage * pageSize)} dari {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="btn-ghost h-8 px-2 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="tabular-nums">
              {safePage}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount}
              className="btn-ghost h-8 px-2 disabled:opacity-40"
            >
              ›
            </button>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="input h-8 w-auto py-0 text-xs"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

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
