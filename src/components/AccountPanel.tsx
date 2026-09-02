'use client';

import { useState } from 'react';
import { useL } from './lang-context';
import { KeyIcon, RefreshIcon } from './icons';

export default function AccountPanel() {
  const L = useL();
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!oldPass || !newPass || !confirm) {
      setMsg({ kind: 'err', text: L.account.emptyErr });
      return;
    }
    if (newPass !== confirm) {
      setMsg({ kind: 'err', text: L.account.mismatch });
      return;
    }
    if (newPass === oldPass) {
      setMsg({ kind: 'err', text: L.account.errSame });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Gagal mengganti password.');
      setOldPass('');
      setNewPass('');
      setConfirm('');
      setMsg({ kind: 'ok', text: L.account.done });
      // Password berubah → pwdVersion naik → sesi ini tidak valid lagi.
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err) {
      setMsg({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <header className="flex items-center gap-2">
        <KeyIcon className="h-5 w-5 text-orange-400" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{L.account.title}</h2>
          <p className="text-xs text-zinc-500">{L.account.sub}</p>
        </div>
      </header>

      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="label">{L.account.oldPass}</label>
          <input
            type="password"
            className="input"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="label">{L.account.newPass}</label>
          <input
            type="password"
            className="input"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            autoComplete="new-password"
            minLength={6}
          />
        </div>
        <div>
          <label className="label">{L.account.confirm}</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" onClick={submit} disabled={busy} className="btn-primary">
          {busy ? <RefreshIcon className="h-4 w-4 animate-spin" /> : null} {L.account.btnSave}
        </button>
        <p className="text-xs text-zinc-600">{L.account.note}</p>
      </div>

      {msg && (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            msg.kind === 'ok'
              ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
              : 'border-red-900/60 bg-red-950/40 text-red-300'
          }`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
