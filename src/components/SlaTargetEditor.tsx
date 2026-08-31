'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useL } from './lang-context';

export default function SlaTargetEditor({
  clusterId,
  slaKey,
  value,
  custom
}: {
  clusterId: string;
  slaKey: string;
  value: number;
  custom: boolean;
}) {
  const L = useL();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(target: number | null) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sla/${clusterId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target === null ? { key: slaKey, target: null } : { key: slaKey, target })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan target.');
      setEditing(false);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setVal(String(value));
          setErr(null);
          setEditing(true);
        }}
        title={custom ? L.sla.customMark : undefined}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition ${
          custom
            ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20'
            : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/70'
        }`}
      >
        {value.toFixed(2)}%{custom ? ' •' : ''}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={50}
          max={100}
          step="0.001"
          className="input w-24 px-2 py-1 text-xs"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save(Number(val));
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
        />
        <button
          type="button"
          className="rounded-md bg-emerald-600/80 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          disabled={busy}
          onClick={() => void save(Number(val))}
        >
          ✓
        </button>
        <button
          type="button"
          className="rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        {err ? <span className="text-[11px] text-red-400">{err}</span> : null}
        {custom ? (
          <button
            type="button"
            className="text-[11px] text-zinc-500 underline hover:text-zinc-300 disabled:opacity-50"
            disabled={busy}
            onClick={() => void save(null)}
          >
            {L.sla.reset}
          </button>
        ) : null}
      </div>
    </div>
  );
}
