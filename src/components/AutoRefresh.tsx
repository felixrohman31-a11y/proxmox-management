'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoRefresh({
  intervalMs = 30000,
  label,
  updatedTemplate
}: {
  intervalMs?: number;
  label: string;
  updatedTemplate: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [last, setLast] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem('pm_auto_refresh') === '1') setOn(true);
      const raw = localStorage.getItem('pm_last_updated');
      if (raw) setLast(new Date(JSON.parse(raw)));
    } catch {
      /* abaikan storage tidak tersedia */
    }
  }, []);

  useEffect(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    if (on) {
      timer.current = setInterval(async () => {
        setRefreshing(true);
        try {
          await router.refresh();
        } finally {
          setRefreshing(false);
          const now = new Date();
          setLast(now);
          try {
            localStorage.setItem('pm_last_updated', JSON.stringify(now));
          } catch {
            /* noop */
          }
        }
      }, intervalMs);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [on, intervalMs, router]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem('pm_auto_refresh', next ? '1' : '0');
    } catch {
      /* noop */
    }
    if (next) {
      const now = new Date();
      setLast(now);
      try {
        localStorage.setItem('pm_last_updated', JSON.stringify(now));
      } catch {
        /* noop */
      }
    }
  };

  const dot = on ? (refreshing ? 'bg-orange-400 animate-pulse' : 'bg-emerald-400') : 'bg-zinc-600';
  const time = last ? last.toLocaleTimeString() : '';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={`btn-ghost h-10 px-3 text-sm ${on ? 'border-orange-600/60 text-orange-300' : ''}`}
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </button>
      {last && (
        <span className="hidden text-xs text-zinc-500 sm:inline">
          {updatedTemplate.replace('{t}', time)}
        </span>
      )}
    </div>
  );
}
