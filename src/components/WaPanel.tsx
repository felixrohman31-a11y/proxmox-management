'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, BoltIcon, CheckIcon, RefreshIcon } from './icons';
import { useL } from './lang-context';

type Provider = 'fonnte' | 'telegram';

export default function WaPanel() {
  const L = useL();
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<Provider>('telegram');
  const [phone, setPhone] = useState('');
  const [chatId, setChatId] = useState('');
  const [apikey, setApikey] = useState('');
  const [botToken, setBotToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/settings/wa');
    if (!r.ok) return;
    const j = await r.json();
    if (j.provider) setProvider(j.provider as Provider);
    setPhone(j.phone ?? '');
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setMsg(null);
    if (provider !== 'telegram' && !/^\+?\d{8,16}$/.test(phone.trim().replace(/^\+/, ''))) {
      setMsg({ kind: 'err', text: L.wa.invalidPhone });
      return;
    }
    if (provider === 'telegram' && !chatId.trim()) {
      setMsg({ kind: 'err', text: L.wa.invalidChat });
      return;
    }
    setBusy('save');
    try {
      const payload: Record<string, unknown> = { provider, phone: phone.replace(/^\+/, ''), chatId: chatId.trim() };
      if (apikey) payload.apikey = apikey;
      if (botToken) payload.botToken = botToken;
      const r = await fetch('/api/settings/wa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? L.wa.errSave });
      else setMsg({ kind: 'ok', text: L.wa.saved });
      setApikey('');
      setBotToken('');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setMsg(null);
    try {
      const r = await fetch('/api/settings/wa?action=test', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      setMsg({ kind: j.ok ? 'ok' : 'err', text: j.message ?? '-' });
    } finally {
      setBusy(null);
    }
  }

  const PROVIDERS: Array<{ key: Provider; label: string; hint: string }> = [
    { key: 'telegram', label: L.wa.pTel, hint: L.wa.hintTel },
    { key: 'fonnte', label: L.wa.pFonnte, hint: L.wa.hintFonnte }
  ];
  const currentHint = PROVIDERS.find((p) => p.key === provider)?.hint ?? '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="card p-5"
    >
      <h2 className="text-sm font-semibold text-zinc-200">{L.wa.title}</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-zinc-500">{L.wa.desc}</p>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setProvider(p.key)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              provider === p.key
                ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs leading-relaxed text-zinc-500">
        {currentHint}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {provider !== 'telegram' && (
          <div>
            <label className="label">{L.wa.phone}</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6281234567890" />
          </div>
        )}
        {provider === 'fonnte' && (
          <div>
            <label className="label">
              Token Fonnte {loaded && <span className="normal-case text-zinc-600">{L.ftp.passKeep}</span>}
            </label>
            <input type="password" className="input" value={apikey} onChange={(e) => setApikey(e.target.value)} autoComplete="new-password" />
          </div>
        )}
        {provider === 'telegram' && (
          <>
            <div>
              <label className="label">
                {L.wa.botToken} {loaded && <span className="normal-case text-zinc-600">{L.ftp.passKeep}</span>}
              </label>
              <input type="password" className="input" value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABC-DEF..." autoComplete="new-password" />
            </div>
            <div>
              <label className="label">{L.wa.chatId}</label>
              <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
            </div>
          </>
        )}
      </div>

      {msg && (
        <p
          className={`mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-sm ${
            msg.kind === 'err'
              ? 'border-red-900/60 bg-red-950/40 text-red-300'
              : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
          }`}
        >
          {msg.kind === 'err' ? <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy !== null} className="btn-primary">
          {busy === 'save' && <RefreshIcon className="h-4 w-4 animate-spin" />} {L.wa.save}
        </button>
        <button type="button" className="btn-ghost" onClick={test} disabled={busy !== null}>
          {busy === 'test' ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <BoltIcon />}
          {L.wa.test}
        </button>
      </div>
    </form>
  );
}
