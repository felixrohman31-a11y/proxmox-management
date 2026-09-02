'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useL } from './lang-context';
import { fmt } from '@/lib/i18n-dict';
import { CheckIcon, PlusIcon, RefreshIcon, TrashIcon, XIcon, KeyIcon } from './icons';
import type { ReactNode } from 'react';

// Duplikat ringan dari PublicUser (lib/users) agar komponen client tidak
// menarik kode server (fs/crypto) ke bundel.
type Role3 = 'superadmin' | 'admin' | 'auditor';

interface UserRow {
  id: string;
  username: string;
  role: Role3;
  enabled: boolean;
  createdAt: string;
}

// Peran yang boleh diberikan actor (cerminan assignableRoles di lib/users).
function rolesFor(actor: Role3): Role3[] {
  if (actor === 'superadmin') return ['superadmin', 'admin', 'auditor'];
  if (actor === 'admin') return ['admin', 'auditor'];
  return [];
}

function roleLabel(L: ReturnType<typeof useL>, r: Role3): string {
  return r === 'superadmin' ? L.users.roleSuperadmin : r === 'admin' ? L.users.roleAdmin : L.users.roleAuditor;
}

// Apakah actor boleh mengelola akun berperan target (cerminan canManageUser).
function canManage(actor: Role3, target: Role3): boolean {
  if (actor === 'superadmin') return true;
  if (actor === 'admin') return target === 'auditor';
  return false;
}

function Toast({ kind, msg }: { kind: 'ok' | 'err'; msg: string }) {
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-xl ${
        kind === 'err'
          ? 'border-red-900 bg-red-950/90 text-red-200'
          : 'border-emerald-800 bg-emerald-950/90 text-emerald-200'
      }`}
    >
      {msg}
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'superadmin' | 'admin' | 'auditor' | 'active' | 'off' }) {
  const cls =
    tone === 'superadmin'
      ? 'bg-violet-500/10 text-violet-300'
      : tone === 'admin'
        ? 'bg-orange-500/10 text-orange-400'
        : tone === 'auditor'
          ? 'bg-sky-500/10 text-sky-400'
          : tone === 'active'
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-zinc-800 text-zinc-500';
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{children}</span>;
}

export default function UsersManager({
  currentUserId,
  currentRole
}: {
  currentUserId: string;
  currentRole: Role3;
}) {
  const L = useL();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [uname, setUname] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState<Role3>('auditor');
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);

  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPass, setResetPass] = useState('');

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal memuat user.');
      setUsers((json.data as UserRow[]) ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setUname('');
    setPass('');
    setRole('auditor');
    setEnabled(true);
    setShowForm(false);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!uname.trim()) {
      flash('err', 'Username wajib diisi.');
      return;
    }
    if (pass.length < 6) {
      flash('err', L.users.pwReq);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname.trim(), password: pass, role, enabled })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal membuat user.');
      flash('ok', fmt(L.users.doneCreate, { name: json.data.username }));
      resetForm();
      await load();
    } catch (err) {
      flash('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(u: UserRow) {
    setActing(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !u.enabled })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal.');
      flash('ok', L.users.doneUpdate);
      await load();
    } catch (err) {
      flash('err', (err as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function changeRole(u: UserRow, nextRole: Role3) {
    if (nextRole === u.role) return;
    setActing(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal.');
      flash('ok', L.users.doneUpdate);
      await load();
    } catch (err) {
      flash('err', (err as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function remove(u: UserRow) {
    if (!window.confirm(fmt(L.users.confirmDelete, { name: u.username }))) return;
    setActing(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal.');
      flash('ok', fmt(L.users.doneDelete, { name: u.username }));
      await load();
    } catch (err) {
      flash('err', (err as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    if (resetPass.length < 6) {
      flash('err', L.users.pwReq);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${resetFor.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPass })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal.');
      flash('ok', fmt(L.users.doneReset, { name: resetFor.username }));
      setResetFor(null);
      setResetPass('');
    } catch (err) {
      flash('err', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* hint peran */}
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs leading-relaxed text-zinc-500">
        {L.users.viewerHint}
      </p>

      <div className="flex justify-end">
        {showForm ? (
          <button className="btn-ghost" onClick={resetForm} type="button">
            {L.users.cancel}
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setShowForm(true)} type="button">
            <PlusIcon /> {L.users.add}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-200">{L.users.formNew}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{L.users.fUsername}</label>
              <input
                className="input"
                value={uname}
                onChange={(e) => setUname(e.target.value)}
                placeholder="operator"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label">{L.users.fPassword}</label>
              <input
                type="password"
                className="input"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={L.users.passPlaceholder}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label">{L.users.fRole}</label>
              <div className="grid grid-cols-3 gap-2">
                {rolesFor(currentRole).map((val) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => setRole(val)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-orange-500/60 active:scale-[0.98] ${
                      role === val
                        ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {roleLabel(L, val)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-end gap-2 pb-1.5 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-600"
              />
              {L.users.fEnabled}
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? <RefreshIcon className="h-4 w-4 animate-spin" /> : null} {L.users.btnCreate}
            </button>
            <button type="button" className="btn-ghost" onClick={resetForm}>
              {L.users.cancel}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
            <RefreshIcon className="h-4 w-4 animate-spin" /> Memuat…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-zinc-900/60">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{L.users.colUser}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{L.users.colRole}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{L.users.colStatus}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{L.users.colCreated}</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-zinc-500">{L.users.colAct}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 font-medium text-zinc-100">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-800 text-[10px] font-bold uppercase text-orange-400">
                          {u.username.slice(0, 2)}
                        </span>
                        {u.username}
                        {u.id === currentUserId && (
                          <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400">
                            {L.users.selfBadge}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.role}>{roleLabel(L, u.role)}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.enabled ? 'active' : 'off'}>
                        {u.enabled ? L.users.active : L.users.disabled}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-2.5">
                      {canManage(currentRole, u.role) ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={u.role}
                            disabled={acting === u.id}
                            onChange={(e) => void changeRole(u, e.target.value as Role3)}
                            title={L.users.fRole}
                            className="input w-auto cursor-pointer py-1 pr-7 text-xs"
                          >
                            {rolesFor(currentRole).map((r) => (
                              <option key={r} value={r}>
                                {roleLabel(L, r)}
                              </option>
                            ))}
                          </select>
                          {u.id !== currentUserId && (
                            <button
                              type="button"
                              title="Reset password"
                              disabled={acting === u.id}
                              onClick={() => {
                                setResetFor(u);
                                setResetPass('');
                              }}
                              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition duration-150 ease-out hover:bg-zinc-800 hover:text-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                            >
                              <KeyIcon />
                            </button>
                          )}
                          {u.enabled ? (
                            <button
                              type="button"
                              title="Nonaktifkan"
                              disabled={acting === u.id}
                              onClick={() => void toggleEnabled(u)}
                              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition duration-150 ease-out hover:bg-amber-800 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                            >
                              <XIcon />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Aktifkan"
                              disabled={acting === u.id}
                              onClick={() => void toggleEnabled(u)}
                              className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition duration-150 ease-out hover:bg-emerald-800 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                            >
                              <CheckIcon />
                            </button>
                          )}
                          {u.id !== currentUserId && (
                            <button
                              type="button"
                              title="Hapus"
                              disabled={acting === u.id}
                              onClick={() => void remove(u)}
                              className="rounded-md border border-red-800/60 p-1.5 text-red-400 transition duration-150 ease-out hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                            >
                              {acting === u.id ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <TrashIcon />}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                      {L.users.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={submitReset} className="card w-full max-w-md p-5">
            <h3 className="text-sm font-semibold text-zinc-100">{fmt(L.users.resetFor, { name: resetFor.username })}</h3>
            <p className="mt-1 text-xs text-zinc-500">{L.users.resetHint}</p>
            <input
              type="password"
              className="input mt-4"
              autoFocus
              placeholder={L.users.passPlaceholder}
              value={resetPass}
              onChange={(e) => setResetPass(e.target.value)}
              autoComplete="new-password"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setResetFor(null)}>
                {L.users.cancel}
              </button>
              <button type="submit" disabled={busy} className="btn-primary">
                {busy ? <RefreshIcon className="h-4 w-4 animate-spin" /> : null} {L.users.reset}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <Toast kind={toast.kind} msg={toast.msg} />}
    </div>
  );
}
