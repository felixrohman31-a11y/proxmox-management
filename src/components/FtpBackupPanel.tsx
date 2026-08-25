'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, BoltIcon, CheckIcon, RefreshIcon } from './icons';
import type { PublicCluster } from '@/types';

interface FtpSettingsView {
  host: string;
  port: number;
  username: string;
  directory: string;
  passive: boolean;
  autoDaily: boolean;
  configured: boolean;
}

interface BackupState {
  lastAttempt?: string;
  lastSuccess?: string;
  lastFile?: string;
  lastError?: string;
}

export default function FtpBackupPanel({ clusters }: { clusters: PublicCluster[] }) {
  const [loaded, setLoaded] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('21');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [directory, setDirectory] = useState('/backup/proxmox-management');
  const [passive, setPassive] = useState(true);
  const [autoDaily, setAutoDaily] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [state, setState] = useState<BackupState>({});

  const load = useCallback(async () => {
    const r = await fetch('/api/settings/ftp');
    if (!r.ok) return;
    const j = await r.json();
    if (j.settings) {
      setHost(j.settings.host ?? '');
      setPort(String(j.settings.port ?? 21));
      setUsername(j.settings.username ?? '');
      setDirectory(j.settings.directory ?? '/backup/proxmox-management');
      setPassive(j.settings.passive !== false);
      setAutoDaily(Boolean(j.settings.autoDaily));
    }
    setState(j.state ?? {});
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!host.trim() || !username.trim()) {
      setMsg({ kind: 'err', text: 'Host dan username wajib diisi.' });
      return;
    }
    setBusy('save');
    try {
      const payload: Record<string, unknown> = {
        host: host.trim(),
        port: Number(port) || 21,
        username: username.trim(),
        directory: directory.trim(),
        passive,
        autoDaily
      };
      if (password) payload.password = password;
      const r = await fetch('/api/settings/ftp', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? 'Gagal menyimpan.' });
      else setMsg({ kind: 'ok', text: 'Pengaturan FTP tersimpan.' });
      setPassword('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function action(kind: 'test' | 'run') {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await fetch(`/api/settings/ftp?action=${kind}`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      setMsg({ kind: j.ok ? 'ok' : 'err', text: j.message ?? j.error ?? '-' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  function fmt(iso?: string): string {
    return iso ? new Date(iso).toLocaleString('id-ID', { hour12: false }) : '-';
  }

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">Backup Konfigurasi ke FTP</h2>
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          Mengirim salinan konfigurasi panel (daftar cluster &amp; kredensial terenkripsi + kunci) ke server FTP.
          Simpan arsip di lokasi yang aman — berisi kunci dekripsi.
        </p>

        {clusters.length > 0 && (
          <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-xs font-medium text-zinc-400">
              Cluster tercakup dalam backup ({clusters.length}):
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {clusters.map((c) => (
                <span key={c.id} className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
                  {c.name} <span className="text-zinc-500">· {c.host}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">Host FTP</label>
            <input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.0.2.10" />
          </div>
          <div>
            <label className="label">Port</label>
            <input className="input" value={port} onChange={(e) => setPort(e.target.value)} placeholder="21" />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Password {!loaded && '(belum disimpan)'}</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={loaded ? 'kosongkan jika tetap' : ''}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Direktori Tujuan</label>
            <input className="input" value={directory} onChange={(e) => setDirectory(e.target.value)} />
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" checked={passive} onChange={(e) => setPassive(e.target.checked)} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600" />
              Mode pasif
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-400">
              <input type="checkbox" checked={autoDaily} onChange={(e) => setAutoDaily(e.target.checked)} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600" />
              Backup harian otomatis (beta)
            </label>
          </div>
        </div>

        {msg && (
          <p className={`mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-sm ${msg.kind === 'err' ? 'border-red-900/60 bg-red-950/40 text-red-300' : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'}`}>
            {msg.kind === 'err' ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />} {msg.text}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={Boolean(busy)} className="btn-primary">
            {busy === 'save' && <RefreshIcon className="h-4 w-4 animate-spin" />} Simpan Pengaturan
          </button>
          <button type="button" className="btn-ghost" onClick={() => action('test')} disabled={Boolean(busy)}>
            {busy === 'test' ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <BoltIcon />} Tes Koneksi
          </button>
          <button type="button" className="btn-danger" onClick={() => action('run')} disabled={Boolean(busy)}>
            {busy === 'run' ? <RefreshIcon className="h-4 w-4 animate-spin" /> : null} Backup Sekarang
          </button>
        </div>
      </form>

      <div className="card p-4 text-sm">
        <h3 className="mb-2 text-sm font-semibold text-zinc-200">Status Backup Terakhir</h3>
        <ul className="space-y-1 text-xs text-zinc-400">
          <li>Percobaan terakhir : {fmt(state.lastAttempt)}</li>
          <li>Berhasil terakhir   : {fmt(state.lastSuccess)}</li>
          <li>File terakhir       : {state.lastFile ?? '-'}</li>
          {state.lastError && <li className="text-red-400">Error terakhir   : {state.lastError}</li>}
        </ul>
      </div>
    </div>
  );
}
