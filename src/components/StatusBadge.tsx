const STYLES: Record<string, string> = {
  running: 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400',
  online: 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400',
  active: 'border-emerald-700/50 bg-emerald-500/10 text-emerald-400',
  stopped: 'border-zinc-700 bg-zinc-800/60 text-zinc-400',
  paused: 'border-amber-600/50 bg-amber-500/10 text-amber-400',
  offline: 'border-rose-700/50 bg-rose-500/10 text-rose-400',
  error: 'border-red-700/50 bg-red-500/10 text-red-400'
};

export default function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status.toLowerCase()] ?? 'border-zinc-700 bg-zinc-800/60 text-zinc-400';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-none ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
