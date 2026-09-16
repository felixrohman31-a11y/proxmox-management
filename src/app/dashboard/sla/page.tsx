import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import StatCard from '@/components/StatCard';
import SlaTargetEditor from '@/components/SlaTargetEditor';
import SlaTrend from '@/components/SlaTrend';
import { ShieldIcon, CheckIcon, AlertIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { resolveCluster } from '@/lib/cluster-select';
import { getSessionFromCookies } from '@/lib/session';
import { serverT, getServerLocale } from '@/lib/locale-server';
import { fmt } from '@/lib/i18n-dict';
import { ymdToEpochWIB } from '@/lib/report-data';
import { formatRange } from '@/lib/report-strings';
import { slaForRange, fmtDowntime, type ClusterSla, type SlaRow, type SlaEpisode } from '@/lib/sla';
import { ensureSlaScheduler } from '@/lib/sla-alerts';

export const dynamic = 'force-dynamic';

function StatusBadge({ row, L }: { row: SlaRow; L: ReturnType<typeof serverT> }) {
  if (row.status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <CheckIcon className="h-3 w-3" /> {L.sla.ok}
      </span>
    );
  }
  if (row.status === 'breach') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
        <AlertIcon className="h-3 w-3" /> {L.sla.breach}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
      {L.sla.noData}
    </span>
  );
}

function pctText(row: SlaRow): string {
  return row.actualPct === null ? '—' : `${row.actualPct.toFixed(2)}%`;
}

const wibId = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
});
const wibEn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
});
// Format epoch (detik) ke WIB (Asia/Jakarta) agar konsisten & tidak ikut TZ server.
function fmtWib(sec: number, en: boolean): string {
  return (en ? wibEn : wibId).format(new Date(sec * 1000));
}
function epWibDay(sec: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(sec * 1000));
}
function graphsHref(sla: ClusterSla, r: SlaRow, ep: SlaEpisode): string {
  const range = `&tf=day&start=${epWibDay(ep.start)}&end=${epWibDay(ep.end)}`;
  if (r.kind === 'node') return `/dashboard/graphs?c=${sla.clusterId}&t=node&n=${encodeURIComponent(r.node)}${range}`;
  return `/dashboard/graphs?c=${sla.clusterId}&t=guest&g=${encodeURIComponent(`${r.type}|${r.vmid}|${r.node}`)}${range}`;
}

function SlaTable({
  rows,
  title,
  sla,
  L,
  en,
  readOnly
}: {
  rows: SlaRow[];
  title: string;
  sla: ClusterSla;
  L: ReturnType<typeof serverT>;
  en: boolean;
  readOnly?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="card p-5 text-sm text-zinc-500">
        {title} — {L.common.noData}
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto p-0">
      <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-2 font-medium">{L.sla.name}</th>
            <th className="px-4 py-2 font-medium">{L.sla.node}</th>
            <th className="px-4 py-2 font-medium">{L.sla.target}</th>
            <th className="px-4 py-2 text-right font-medium">{L.sla.actual}</th>
            <th className="px-4 py-2 text-right font-medium">{L.sla.downtime}</th>
            <th className="px-4 py-2 font-medium">{L.sla.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-zinc-800/70">
              <td className="px-4 py-2">
                {r.kind === 'guest' ? (
                  <Link
                    href={`/dashboard/vms?c=${sla.clusterId}&vm=${r.vmid}`}
                    className="font-medium text-zinc-100 hover:text-orange-400"
                  >
                    {r.name} <span className="text-zinc-500">({r.vmid})</span>
                  </Link>
                ) : (
                  <span className="font-medium text-zinc-100">{r.name}</span>
                )}
                <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                  {r.kind === 'guest' ? r.type : 'node'}
                </span>
              </td>
              <td className="px-4 py-2 text-zinc-400">{r.node}</td>
              <td className="px-4 py-2">
                <SlaTargetEditor
                  clusterId={sla.clusterId}
                  slaKey={r.key}
                  value={r.target}
                  custom={sla.customTargets[r.key] !== undefined}
                  readOnly={readOnly}
                />
              </td>
              <td
                className={`px-4 py-2 text-right font-mono ${
                  r.status === 'breach' ? 'text-red-400' : r.status === 'ok' ? 'text-emerald-400' : 'text-zinc-500'
                }`}
              >
                {pctText(r)}
                {r.coveragePct !== null && r.coveragePct < 99.5 && (
                  <span
                    title={fmt(L.sla.coverageHint, { p: r.coveragePct.toFixed(0) })}
                    className={`ml-1 text-[10px] ${r.coveragePct < 90 ? 'text-amber-400' : 'text-zinc-500'}`}
                  >
                    ·{r.coveragePct.toFixed(0)}%
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right text-zinc-400">
                {fmtDowntime(r.downtimeMin, en)}
                {r.budgetRemainingMin !== null && (
                  <div
                    title={fmt(r.budgetRemainingMin >= 0 ? L.sla.budgetHint : L.sla.overBudgetHint, {
                      m: fmtDowntime(Math.abs(r.budgetRemainingMin), en),
                      t: r.target
                    })}
                    className={`text-[10px] font-normal ${r.atRisk ? 'text-amber-400' : 'text-emerald-500/70'}`}
                  >
                    {L.sla.budget}: {r.budgetRemainingMin >= 0 ? '+' : '−'}
                    {fmtDowntime(Math.abs(r.budgetRemainingMin), en)}
                  </div>
                )}
                {r.maintenanceMin != null && (
                  <div
                    title={fmt(L.sla.maintHint, { m: fmtDowntime(r.maintenanceMin, en) })}
                    className="text-[10px] font-normal text-zinc-500"
                  >
                    · {fmtDowntime(r.maintenanceMin, en)} {L.sla.maintLabel}
                  </div>
                )}
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge row={r} L={L} />
                  {r.atRisk && r.status !== 'breach' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                      <AlertIcon className="h-3 w-3" /> {L.sla.atRisk}
                    </span>
                  )}
                  {r.episodes && r.episodes.length > 0 && (
                    <details className="text-[11px] leading-tight">
                      <summary className="cursor-pointer list-none text-zinc-500 hover:text-orange-400">
                        ▸ {L.sla.whenLabel} <span className="text-zinc-600">({r.episodes.length})</span>
                      </summary>
                      <ul className="mt-1 space-y-0.5 border-l border-zinc-800 pl-2">
                        {r.episodes.slice(0, 40).map((ep, i) => {
                          const last = i === r.episodes.length - 1;
                          const downNow = r.kind === 'node' ? r.statusNow !== 'online' : r.statusNow !== 'running';
                          return (
                            <li key={i} className="text-zinc-400">
                              <span className="font-mono">{fmtWib(ep.start, en)}</span>
                              <span className="text-zinc-600"> → </span>
                              <span className="font-mono">{fmtWib(ep.end, en)}</span>
                              <span className="text-zinc-600"> · </span>
                              {fmtDowntime((ep.end - ep.start) / 60, en)}
                              {last && downNow && (
                                <span className="ml-1 text-red-400">({L.sla.ongoing})</span>
                              )}
                              {' '}
                              <Link
                                href={graphsHref(sla, r, ep)}
                                className="text-orange-400/70 hover:text-orange-400"
                              >
                                ↗ {L.sla.openGraph}
                              </Link>
                            </li>
                          );
                        })}
                        {r.episodes.length > 40 && (
                          <li className="text-zinc-600">+{r.episodes.length - 40}</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SlaPage({
  searchParams
}: {
  searchParams?: {
    c?: string | string[];
    month?: string | string[];
    start?: string | string[];
    end?: string | string[];
  };
}) {
  const sp = searchParams ?? {};
  const L = serverT();
  const session = getSessionFromCookies();
  const readOnly = session?.role === 'auditor';
  const en = getServerLocale() === 'en';
  if (session) {
    // Pastikan siklus monitor SLA (histori + alert) berjalan selama panel aktif.
    try {
      ensureSlaScheduler();
    } catch {
      /* abaikan */
    }
  }
  const { clusters, cluster } = resolveCluster(sp.c);

  const now = new Date();
  const locale = getServerLocale();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();
  const todayISO = isoOf(todayY, todayM, todayD);

  // Rentang tanggal via `?start=YYYY-MM-DD&end=YYYY-MM-DD` (WIB). Tanpa param:
  // default awal-bulan-ini → hari ini. Fallback lama: `?month=YYYY-MM` (sebulan penuh).
  const spStart = Array.isArray(sp.start) ? sp.start[0] : sp.start;
  const spEnd = Array.isArray(sp.end) ? sp.end[0] : sp.end;
  const ymd = (v?: string): [number, number, number] | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const ps = ymd(spStart);
  const pe = ymd(spEnd);
  let sy: number, sm: number, sd: number, ey: number, em: number, ed: number;
  if (ps || pe) {
    [sy, sm, sd] = ps ?? [todayY, todayM, 1];
    [ey, em, ed] = pe ?? [todayY, todayM, todayD];
  } else {
    const monthParam = Array.isArray(sp.month) ? sp.month[0] : sp.month;
    const parsed = /^(\d{4})-(\d{2})$/.exec(monthParam ?? '');
    const year = parsed ? Math.min(2100, Math.max(2000, Number(parsed[1]))) : todayY;
    const month = parsed ? Math.min(12, Math.max(1, Number(parsed[2]))) : todayM;
    sy = year;
    sm = month;
    sd = 1;
    if (parsed) {
      ed = new Date(Date.UTC(year, month, 0)).getUTCDate(); // hari terakhir bulan
      ey = year;
      em = month;
    } else {
      ey = todayY;
      em = todayM;
      ed = todayD;
    }
  }
  const startEpoch = ymdToEpochWIB(sy, sm, sd);
  let endEpoch = ymdToEpochWIB(ey, em, ed) + 86400; // sertakan hari terakhir penuh
  if (endEpoch <= startEpoch) {
    endEpoch = startEpoch + 86400;
    ey = sy;
    em = sm;
    ed = sd;
  }
  const startISO = isoOf(sy, sm, sd);
  const endISO = isoOf(ey, em, ed);
  // Label periode dibentuk dari tanggal kalender (UTC-noon) agar tidak digeser TZ server.
  const rangeLabel = formatRange(
    Math.floor(Date.UTC(sy, sm - 1, sd, 12) / 1000),
    Math.floor(Date.UTC(ey, em - 1, ed, 12) / 1000),
    locale
  );
  const periodOpen = endEpoch > Math.floor(now.getTime() / 1000);

  let sla: ClusterSla | null = null;
  let error: string | null = null;
  if (cluster) {
    try {
      sla = await slaForRange(cluster, startEpoch, endEpoch);
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

  const worst =
    sla && sla.summary.tracked
      ? [...sla.guests, ...sla.nodes]
          .filter((r) => r.actualPct !== null)
          .sort((a, b) => (a.actualPct ?? 100) - (b.actualPct ?? 100))[0]
      : null;

  return (
    <>
      <PageHeader title={L.sla.title} subtitle={L.sla.subtitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/sla/fleet" className="btn-ghost text-xs whitespace-nowrap">
            {L.fleet.link}
          </Link>
          <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard/sla" />
        </div>
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <ShieldIcon className="mx-auto h-10 w-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium text-zinc-200">{L.common.emptyClusterTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500">{L.common.emptyClusterDesc}</p>
          <Link href="/dashboard/clusters" className="btn-primary mt-5">
            {L.common.addCluster}
          </Link>
        </div>
      )}

      {cluster && (
        <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
          <input type="hidden" name="c" value={cluster.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500" htmlFor="sla-start">
              {L.sla.from}
            </label>
            <input
              id="sla-start"
              type="date"
              name="start"
              defaultValue={startISO}
              max={todayISO}
              className="input w-auto"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500" htmlFor="sla-end">
              {L.sla.to}
            </label>
            <input
              id="sla-end"
              type="date"
              name="end"
              defaultValue={endISO}
              max={todayISO}
              className="input w-auto"
            />
          </div>
          <button type="submit" className="btn-primary text-xs">
            {L.sla.apply}
          </button>
          {!periodOpen && (
            <span className="mb-1 ml-1 inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-[11px] text-zinc-400">
              {L.sla.final}
            </span>
          )}
        </form>
      )}

      {cluster && error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {cluster && sla && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={L.sla.avgAvailability}
              value={sla.summary.avgPct === null ? '—' : `${sla.summary.avgPct.toFixed(2)}%`}
              sub={`${L.sla.period}: ${rangeLabel}`}
              icon={<ShieldIcon className="h-5 w-5" />}
            />
            <StatCard
              label={L.sla.compliance}
              value={`${sla.summary.compliant} / ${sla.summary.tracked}`}
              sub={
                periodOpen && sla.summary.atRisk
                  ? `${sla.summary.breach} ${L.sla.breach.toLowerCase()} · ${sla.summary.atRisk} ${L.sla.atRisk.toLowerCase()}`
                  : `${sla.summary.breach} ${L.sla.breach.toLowerCase()}`
              }
              icon={<CheckIcon className="h-5 w-5" />}
            />
            <StatCard
              label={L.sla.worst}
              value={worst ? `${worst.actualPct?.toFixed(2)}%` : '—'}
              sub={worst ? worst.name : L.common.noData}
              icon={<AlertIcon className="h-5 w-5" />}
            />
            <StatCard
              label={L.sla.totalDowntime}
              value={fmtDowntime(sla.summary.tracked ? sla.summary.totalDowntimeMin : null, en)}
              sub={`${L.sla.noData}: ${sla.summary.noData}${
                sla.summary.maintenanceMin > 0
                  ? ` · ${fmtDowntime(sla.summary.maintenanceMin, en)} ${L.sla.maintLabel}`
                  : ''
              }`}
              icon={<AlertIcon className="h-5 w-5" />}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>
              {L.sla.defaultTarget}:{' '}
              <span className="font-mono text-zinc-300">{sla.defaultTarget.toFixed(2)}%</span>
            </span>
            <span>·</span>
            <span>{L.sla.windowNote}</span>
          </div>

          <div className="mt-4 space-y-4">
            <SlaTable rows={sla.nodes} title={L.sla.nodes} sla={sla} L={L} en={en} readOnly={readOnly} />
            <SlaTable rows={sla.guests} title={L.sla.guests} sla={sla} L={L} en={en} readOnly={readOnly} />
          </div>

          <div className="mt-4">
            <SlaTrend clusterId={sla.clusterId} canWrite={!readOnly} />
          </div>
        </>
      )}
    </>
  );
}
