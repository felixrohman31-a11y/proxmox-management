'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, ArchiveIcon, RefreshIcon, TrashIcon } from './icons';
import { fmtBytes } from '@/lib/format';
import type { CreateMeta } from '@/types';

interface Props {
  clusterId: string;
  nodes: { node: string; status: string }[];
  guests: { vmid: number; type: 'qemu' | 'lxc'; name: string; node: string; status: string }[];
}

interface DumpRow {
  volid: string;
  format?: string;
  size?: number;
  ctime?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function BackupPanel({ clusterId, nodes, guests }: Props) {
  const [node, setNode] = useState(() => nodes.find((n) => n.status === 'online')?.node ?? '');
  const [guestSel, setGuestSel] = useState('');
  const [storage, setStorage] = useState('');
  const [mode, setMode] = useState('snapshot');
  const [compress, setCompress] = useState('zstd');

  const [meta, setMeta] = useState<CreateMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [phase, setPhase] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [backups, setBackups] = useState<DumpRow[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  const guest = (() => {
    const [t, vmid, n] = (guestSel || '').split('|');
    return guests.find((g) => g.type === t && String(g.vmid) === vmid && g.node === n);
  })();

  const loadMeta = useCallback(async () => {
    if (!node) return;
    setMetaLoading(true);
    setMetaErr(null);
    try {
      const r = await fetch(`/api/meta/${clusterId}/${encodeURIComponent(node)}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data) {
        setMetaErr(j?.error ?? `Gagal memuat metadata (HTTP ${r.status}).`);
        return;
      }
      const m = j.data as CreateMeta;
      setMeta(m);
      setStorage((s) => s || (m.backupStorages[0] ?? ''));
    } catch (e) {
      setMetaErr((e as Error).message);
    } finally {
      setMetaLoading(false);
    }
  }, [clusterId, node]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const loadBackups = useCallback(async () => {
    if (!node || !storage || !guest) {
      setBackups([]);
      return;
    }
    setBackupsLoading(true);
    try {
      const r = await fetch(
        `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(
          storage
        )}/content?content=backup&vmid=${guest.vmid}`
      );
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setBackups([]);
        return;
      }
      const list = ((j?.data ?? []) as DumpRow[]).slice();
      list.sort((a, b) => (b.ctime ?? 0) - (a.ctime ?? 0));
      setBackups(list);
    } finally {
      setBackupsLoading(false);
    }
  }, [clusterId, node, storage, guest]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  async function awaitTask(upid: string, label: string): Promise<void> {
    for (let i = 0; i < 300; i++) {
      await sleep(3000);
      try {
        const r = await fetch(
          `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`
        );
        const j = await r.json().catch(() => null);
        const d = (j?.data ?? {}) as { status?: string; exitstatus?: string };
        const finished = d.exitstatus !== undefined || d.status === 'stopped';
        if (!finished) continue;
        const ok = String(d.exitstatus ?? '')
          .toUpperCase()
          .includes('OK');
        if (!ok) throw Object.assign(new Error(`${label} gagal: ${d.exitstatus ?? 'unknown'}`), { fatal: true });
        return;
      } catch (e) {
        if ((e as Error & { fatal?: boolean }).fatal) throw e;
      }
    }
    throw new Error(`${label}: timeout menunggu task.`);
  }

  async function run() {
    setFormError(null);
    setDoneMsg(null);
    if (!guest) {
      setFormError('Pilih guest terlebih dahulu.');
      return;
    }
    if (!storage) {
      setFormError('Pilih storage tujuan backup.');
      return;
    }
    setPhase(`Menjalankan vzdump ${guest.type.toUpperCase()} ${guest.vmid} ke ${storage}…`);
    try {
      const body = {
        vmid: String(guest.vmid),
        storage,
        mode,
        compress,
        'notes-template': '{{guestname}} — backup via Proxmox Management'
      };
      const r = await fetch(`/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/vzdump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.data) throw new Error(j?.error ?? `Gagal memulai backup (HTTP ${r.status}).`);
      const upid = String(j.data);
      if (!upid.startsWith('UPID:')) throw new Error('Respons task tidak valid.');
      setPhase('Task backup berjalan — proses bisa beberapa menit…');
      await awaitTask(upid, `Backup ${guest.vmid}`);
      setDoneMsg(`Backup ${guest.name} (${guest.vmid}) selesai di ${storage}.`);
      await loadBackups();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  async function removeDump(volid: string) {
    if (!window.confirm(`Hapus file backup?\n${volid}`)) return;
    setPhase('Menghapus file backup…');
    try {
      const r = await fetch(
        `/api/pve/${clusterId}/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content/${encodeURIComponent(volid)}`,
        { method: 'DELETE' }
      );
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `Gagal menghapus (HTTP ${r.status}).`);
      await loadBackups();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="card p-5"
      >
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">Jalankan Backup (vzdump)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Node</label>
            <select className="input" value={node} onChange={(e) => setNode(e.target.value)}>
              {nodes.map((n) => (
                <option key={n.node} value={n.node} disabled={n.status !== 'online'}>
                  {n.node}
                  {n.status !== 'online' ? ` (${n.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Guest</label>
            <select className="input" value={guestSel} onChange={(e) => setGuestSel(e.target.value)}>
              <option value="">— pilih guest —</option>
              {guests.map((g) => (
                <option key={`${g.type}|${g.vmid}|${g.node}`} value={`${g.type}|${g.vmid}|${g.node}`}>
                  {g.type === 'qemu' ? 'VM' : 'CT'} {g.vmid} · {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Storage Tujuan (backup)</label>
            <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}>
              {meta?.backupStorages.length ? (
                meta.backupStorages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              ) : (
                <option value="">— tidak ada storage backup —</option>
              )}
            </select>
          </div>
          <div>
            <label className="label">Mode</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="snapshot">Snapshot</option>
              <option value="suspend">Suspend</option>
              <option value="stop">Stop</option>
            </select>
          </div>
          <div>
            <label className="label">Kompresi</label>
            <select className="input" value={compress} onChange={(e) => setCompress(e.target.value)}>
              <option value="zstd">ZSTD (cepat)</option>
              <option value="lzo">LZO</option>
              <option value="gzip">GZIP</option>
              <option value="0">Tanpa kompresi</option>
            </select>
          </div>
        </div>

        {metaLoading && (
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
            <RefreshIcon className="h-4 w-4 animate-spin" /> Memuat metadata…
          </p>
        )}
        {metaErr && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {metaErr}
          </p>
        )}
        {formError && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {formError}
          </p>
        )}
        {doneMsg && (
          <p className="mt-3 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {doneMsg}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={Boolean(phase) || !guest || metaLoading}>
            <ArchiveIcon /> Jalankan Backup
          </button>
          {phase && (
            <span className="flex items-center gap-2 text-sm text-zinc-400">
              <RefreshIcon className="h-4 w-4 animate-spin" /> {phase}
            </span>
          )}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            File Backup Tersimpan{guest ? ` — ${guest.type.toUpperCase()} ${guest.vmid}` : ''}
          </h2>
          <button type="button" onClick={loadBackups} disabled={!guest || backupsLoading} className="btn-ghost !py-1">
            <RefreshIcon className={`h-3.5 w-3.5 ${backupsLoading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-zinc-900/60">
              <tr>
                <Th>File (volid)</Th>
                <Th>Ukuran</Th>
                <Th>Tanggal</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {backups.map((b) => (
                <tr key={b.volid} className="hover:bg-zinc-900/40">
                  <Td className="font-mono text-xs text-zinc-300">{b.volid}</Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-400">{fmtBytes(b.size)}</Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-400">
                    {b.ctime ? new Date(b.ctime * 1000).toLocaleString('id-ID', { hour12: false }) : '-'}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        title="Hapus file backup"
                        onClick={() => removeDump(b.volid)}
                        disabled={Boolean(phase)}
                        className="rounded-md border border-red-800/60 p-1.5 text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
              {!backupsLoading && guest && storage && backups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Belum ada file backup untuk guest ini pada storage {storage}.
                  </td>
                </tr>
              )}
              {!guest && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Pilih guest untuk melihat daftar backup.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle text-sm text-zinc-300 ${className}`}>{children}</td>;
}
