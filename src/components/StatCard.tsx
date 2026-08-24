import type { ReactNode } from 'react';

export default function StatCard({
  label,
  value,
  sub,
  icon,
  children
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold text-zinc-100">{value}</p>
          {sub ? <p className="mt-0.5 truncate text-xs text-zinc-500">{sub}</p> : null}
        </div>
        {icon ? <div className="shrink-0 rounded-lg bg-zinc-800/80 p-2 text-zinc-400">{icon}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Meter({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v < 55 ? 'bg-emerald-500' : v < 80 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}
