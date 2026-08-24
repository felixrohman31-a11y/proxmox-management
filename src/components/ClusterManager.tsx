'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Th, Td } from './TableBits';
import {
  AlertIcon,
  BoltIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  XIcon
} from './icons';
import type { PublicCluster } from '@/types';

interface TestResult {
  loading?: boolean;
  ok?: boolean;
  msg?: string;
}

interface FormState {
  id: string | null;
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: 'password' | 'token';
  password: string;
  token: string;
  insecure: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  host: '',
  port: '8006',
  username: 'root@pam',
  authMethod: 'password',
  password: '',
  token: '',
  insecure: true
};

function MiniBtn({
  title,
  onClick,
  tone = 'default',
  disabled,
  children
}: {
  title: string;
  onClick: () => void;
  tone?: 'default' | 'red';
  disabled?: boolean;
  children: ReactNode;
}) {
  const cls =
    tone === 'red'
      ? 'border-red-800/60 text-red-400 hover:bg-red-500/10'
      : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100';
  return (
    <button title={title} aria-label={title} onClick={onClick} disabled={disabled} className={`rounded-md border p-1.5 transition disabled:opacity-40 ${cls}`}>
      {children}
    </button>
  );
}

export default function ClusterManager({ clusters }: { clusters: PublicCluster[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(clusters.length === 0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(c: PublicCluster) {
    setForm({
      id: c.id,
      name: c.name,
      host: c.host,
      port: String(c.port),
      username: c.username,
      authMethod: c.authMethod === 'token' ? 'token' : 'password',
      password: '',
      token: '',
      insecure: c.insecure
    });
    setFormError(null);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setFormError('Lengkapi nama, host, dan username.');
      return;
    }
    if (form.authMethod === 'password' && !form.id && !form.password) {
      setFormError('Password wajib diisi untuk metode User & Password.');
      return;
    }
    if (form.authMethod === 'token' && !form.id && !form.token) {
      setFormError('API Token wajib diisi untuk metode API Token.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 8006,
        username: form.username.trim(),
        insecure: form.insecure,
        authMethod: form.authMethod
      };
      if (form.authMethod === 'password' && form.password) payload.password = form.password;
      if (form.authMethod === 'token' && form.token) payload.token = form.token;
      const res = await fetch(form.id ? `/api/clusters/${form.id}` : '/api/clusters', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(json.error ?? 'Gagal menyimpan cluster.');
        return;
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: PublicCluster) {
    if (!window.confirm(`Hapus cluster "${c.name}"? Kredensial tersimpan juga akan dihapus.`)) return;
    setDeleting(c.id);
    try {
      await fetch(`/api/clusters/${c.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function test(c: PublicCluster) {
    setTests((t) => ({ ...t, [c.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/clusters/${c.id}/test`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        const v = json.version ?? {};
        setTests((t) => ({
          ...t,
          [c.id]: { ok: true, msg: `Terhubung — Proxmox VE ${v.version ?? '?'} (repo ${v.repoid ?? 'n/a'})` }
        }));
      } else {
        setTests((t) => ({ ...t, [c.id]: { ok: false, msg: json.error ?? `HTTP ${res.status}` } }));
      }
    } catch (e) {
      setTests((t) => ({ ...t, [c.id]: { ok: false, msg: (e as Error).message } }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        {showForm ? (
          <button className="btn-ghost" onClick={() => setShowForm(false)}>
            Tutup Form
          </button>
        ) : (
          <button className="btn-primary" onClick={openCreate}>
            <PlusIcon /> Tambah Cluster
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={save} className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-200">
            {form.id ? 'Edit Cluster' : 'Tambah Cluster Proxmox'}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">Nama</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Proxmox Utama"
              />
            </div>
            <div>
              <label className="label">Host / IP</label>
              <input
                className="input"
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
                placeholder="192.168.1.10 atau pve.example.com"
              />
            </div>
            <div>
              <label className="label">Port API</label>
              <input className="input" value={form.port} onChange={(e) => set('port', e.target.value)} placeholder="8006" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label">Metode Autentikasi</label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['password', 'User & Password'],
                    ['token', 'API Token']
                  ] as const
                ).map(([val, label]) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => set('authMethod', val)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      form.authMethod === val
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Username (user@realm)</label>
              <input
                className="input"
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
                placeholder="root@pam"
              />
            </div>
            {form.authMethod === 'password' ? (
              <div>
                <label className="label">
                  Password{' '}
                  {form.id && <span className="normal-case text-zinc-600">(kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="label">
                  API Token{' '}
                  {form.id && <span className="normal-case text-zinc-600">(kosongkan jika tidak diubah)</span>}
                </label>
                <input
                  type="password"
                  className="input font-mono text-xs"
                  value={form.token}
                  onChange={(e) => set('token', e.target.value)}
                  placeholder="root@pam!proxcenter=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  autoComplete="off"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                  Buat token lewat <b>Datacenter → Permissions → API Tokens</b> atau CLI:{' '}
                  <code className="text-zinc-500">pveum user token add root@pam proxcenter -privsep 0</code>. Jika{' '}
                  <i>privsep</i> aktif, beri role Administrator pada token tersebut.
                </p>
              </div>
            )}
            <label className="flex items-end gap-2 pb-1.5 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={form.insecure}
                onChange={(e) => set('insecure', e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
              />
              Abaikan sertifikat TLS (self-signed)
            </label>
          </div>
          {formError && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-red-400">
              <AlertIcon /> {formError}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Menyimpan…' : form.id ? 'Simpan Perubahan' : 'Simpan Cluster'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Batal
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Disarankan membuat user khusus dengan role Administrator, misalnya{' '}
            <code className="text-zinc-500">proxcenter@pve</code>, alih-alih memakai root@pam.
          </p>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-zinc-900/60">
              <tr>
                <Th>Nama</Th>
                <Th>Endpoint</Th>
                <Th>Username</Th>
                <Th>Auth</Th>
                <Th>TLS</Th>
                <Th>Dibuat</Th>
                <Th className="text-right">Aksi</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {clusters.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-900/40">
                  <Td>
                    <span className="font-medium text-zinc-100">{c.name}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-zinc-400">
                      {c.host}:{c.port}
                    </span>
                  </Td>
                  <Td className="text-zinc-400">{c.username}</Td>
                  <Td>
                    {c.authMethod === 'token' ? (
                      <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                        API TOKEN
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        PASSWORD
                      </span>
                    )}
                  </Td>
                  <Td>
                    {c.insecure ? (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        skip verify
                      </span>
                    ) : (
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                        verify
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-zinc-500">
                    {new Date(c.createdAt).toLocaleDateString('id-ID')}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <MiniBtn onClick={() => test(c)} title="Tes koneksi" disabled={tests[c.id]?.loading}>
                        {tests[c.id]?.loading ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <BoltIcon />}
                      </MiniBtn>
                      <MiniBtn onClick={() => openEdit(c)} title="Edit">
                        <PencilIcon />
                      </MiniBtn>
                      <MiniBtn onClick={() => remove(c)} title="Hapus" tone="red" disabled={deleting === c.id}>
                        {deleting === c.id ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <TrashIcon />}
                      </MiniBtn>
                    </div>
                  </Td>
                </tr>
              ))}
              {clusters.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-500">
                    Belum ada cluster. Klik &quot;Tambah Cluster&quot; untuk memulai.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {Object.keys(tests).length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {Object.entries(tests).map(([id, r]) => {
            const c = clusters.find((x) => x.id === id);
            if (!c || r.loading || r.msg == null) return null;
            return (
              <li key={id} className={`flex items-start gap-2 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.ok ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <XIcon className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>
                  <b className="text-zinc-300">{c.name}</b> — {r.msg}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
