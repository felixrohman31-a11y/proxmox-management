'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, BoltIcon, CheckIcon, RefreshIcon } from './icons';

export default function WaPanel() {
  const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState('');
  const [apikey, setApikey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/settings/wa');
    if (!r.ok) return;
    const j = await r.json();
    setPhone(j.phone ?? '');
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!/^\+?\d{8,16}$/.test(phone.trim())) {
      setMsg({ kind: 'err', text: 'Nomor tidak valid. Contoh: 6281234567890' });
      return;
    }
    setBusy('save');
    try {
      const payload: Record<string, unknown> = { phone: phone.trim() };
      if (apikey) payload.apikey = apikey;
      const r = await fetch('/api/settings/wa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? 'Gagal menyimpan.' });
      else setMsg({ kind: 'ok', text: 'Konfigurasi WhatsApp tersimpan.' });
      setApikey('');
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="card p-5"
    >
      <h2 className="text-sm font-semibold text-zinc-200">Notifikasi WhatsApp</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-zinc-500">
        Menggunakan layanan gratis <b>CallMeBot</b>. Cara aktivasi: kirim pesan WhatsApp{' '}
        <code className="text-zinc-400">"I allow callmebot to send me messages"</code> ke nomor{' '}
        <code className="text-zinc-400">+34 644 51 95 23</code>, lalu Anda akan menerima API Key. Panel akan mengirim
        peringatan otomatis saat guest terdeteksi mati (pemeriksaan tiap 5 menit).
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nomor WA (format internasional)</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="6281234567890"
          />
        </div>
        <div>
          <label className="label">
            API Key {loaded && <span className="normal-case text-zinc-600">(kosongkan jika tetap)</span>}
          </label>
          <input
            type="password"
            className="input"
            value={apikey}
            onChange={(e) => setApikey(e.target.value)}
            placeholder={loaded ? '' : 'XXXXXX'}
            autoComplete="new-password"
          />
        </div>
      </div>

      {msg && (
        <p
          className={`mt-3 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-sm ${
            msg.kind === 'err'
              ? 'border-red-900/60 bg-red-950/40 text-red-300'
              : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
          }`}
        >
          {msg.kind === 'err' ? (
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {msg.text}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy !== null} className="btn-primary">
          {busy === 'save' && <RefreshIcon className="h-4 w-4 animate-spin" />} Simpan
        </button>
        <button type="button" className="btn-ghost" onClick={test} disabled={busy !== null}>
          {busy === 'test' ? (
            <RefreshIcon className="h-4 w-4 animate-spin" />
          ) : (
            <BoltIcon />
          )}
          Kirim Pesan Uji
        </button>
      </div>
    </form>
  );
}
