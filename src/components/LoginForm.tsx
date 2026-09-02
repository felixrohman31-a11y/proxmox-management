'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertIcon, RefreshIcon } from './icons';
import { useL } from './lang-context';
import LangToggle from './LangToggle';

export default function LoginForm() {
  const router = useRouter();
  const L = useL();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'Login failed.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative w-full max-w-sm">
      <div className="absolute -top-2 right-0"><LangToggle compact /></div>
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-lg font-black text-white shadow-lg shadow-orange-900/40">
          PM
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-100">Proxmox Management</h1>
        <p className="mt-1 text-sm text-zinc-500">{L.login.sub}</p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6 shadow-soft-lg">
        <div>
          <label className="label" htmlFor="pc-user">{L.login.user}</label>
          <input
            id="pc-user"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label" htmlFor="pc-pass">{L.login.pass}</label>
          <input
            id="pc-pass"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p className="flex items-start gap-1.5 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <button type="submit" disabled={loading || !username || !password} className="btn-primary w-full py-2">
          {loading && <RefreshIcon className="h-4 w-4 animate-spin" />} {L.login.submit}
        </button>
      </form>
    </div>
  );
}
