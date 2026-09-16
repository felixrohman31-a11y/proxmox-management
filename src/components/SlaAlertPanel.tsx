'use client';

import { useCallback, useEffect, useState } from 'react';
import { useL } from './lang-context';
import { AlertIcon, BoltIcon, CheckIcon, RefreshIcon } from './icons';

export default function SlaAlertPanel() {
  const L = useL();
  const [enabled, setEnabled] = useState(false);
  const [waReady, setWaReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/settings/sla-alert');
    if (!r.ok) return;
    const j = await r.json();
    setEnabled(Boolean(j.enabled));
    setWaReady(Boolean(j.waReady));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(next: boolean) {
    setBusy('toggle');
    setMsg(null);
    try {
      const r = await fetch('/api/settings/sla-alert', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? L.slaAlerts.err });
      else {
        setEnabled(Boolean(j.enabled));
        setMsg({ kind: 'ok', text: L.slaAlerts.saved });
      }
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setBusy('run');
    setMsg(null);
    try {
      const r = await fetch('/api/settings/sla-alert?action=run', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ kind: 'err', text: j.error ?? L.slaAlerts.err });
      else setMsg({ kind: 'ok', text: j.message ?? L.slaAlerts.none });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-zinc-200">{L.slaAlerts.title}</h2>
      <p className="mt-1 mb-4 text-xs leading-relaxed text-zinc-500">{L.slaAlerts.desc}</p>

      {loaded && !waReady && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-300/90">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" /> {L.slaAlerts.waNeed}
        </p>
      )}

      <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
        enabled ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-zinc-800 bg-zinc-950/40'
      } ${!waReady ? 'opacity-60' : ''}`}>
        <span>
          <span className="block text-sm font-medium text-zinc-200">{L.slaAlerts.enabled}</span>
          <span className="block text-xs text-zinc-500">{L.slaAlerts.interval}</span>
        </span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={enabled}
            disabled={!waReady || busy !== null}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span className={`h-6 w-11 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
          <span
            className={`pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </span>
      </label>

      {msg && (
        <p
          className={`mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
            msg.kind === 'err'
              ? 'border-red-900/60 bg-red-950/40 text-red-300'
              : 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
          }`}
        >
          {msg.kind === 'err' ? <AlertIcon className="h-4 w-4 shrink-0" /> : <CheckIcon className="h-4 w-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      <div className="mt-4">
        <button type="button" className="btn-ghost" onClick={runNow} disabled={!waReady || busy !== null}>
          {busy === 'run' ? <RefreshIcon className="h-4 w-4 animate-spin" /> : <BoltIcon />}
          {busy === 'run' ? L.slaAlerts.running : L.slaAlerts.test}
        </button>
      </div>
    </div>
  );
}
