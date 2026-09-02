import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import StatCard from '@/components/StatCard';
import SlaTargetEditor from '@/components/SlaTargetEditor';
import { ShieldIcon, CheckIcon, AlertIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { resolveCluster } from '@/lib/cluster-select';
import { getSessionFromCookies } from '@/lib/session';
import { serverT, getServerLocale } from '@/lib/locale-server';
import { slaForCluster, fmtDowntime, type ClusterSla, type SlaRow } from '@/lib/sla';

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
              </td>
              <td className="px-4 py-2 text-right text-zinc-400">{fmtDowntime(r.downtimeMin, en)}</td>
              <td className="px-4 py-2">
                <StatusBadge row={r} L={L} />
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
  searchParams?: { c?: string | string[]; month?: string | string[] };
}) {
  const sp = searchParams ?? {};
  const L = serverT();
  const session = getSessionFromCookies();
  const readOnly = session?.role !== 'admin';
  const en = getServerLocale() === 'en';
  const { clusters, cluster } = resolveCluster(sp.c);

  const now = new Date();
  const monthParam = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const parsed = /^(\d{4})-(\d{2})$/.exec(monthParam ?? '');
  const year = parsed ? Math.min(2100, Math.max(2000, Number(parsed[1]))) : now.getFullYear();
  const month = parsed ? Math.min(12, Math.max(1, Number(parsed[2]))) : now.getMonth() + 1;
  const monthValue = `${year}-${String(month).padStart(2, '0')}`;

  let sla: ClusterSla | null = null;
  let error: string | null = null;
  if (cluster) {
    try {
      sla = await slaForCluster(cluster, year, month);
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
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard/sla" />
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
        <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="c" value={cluster.id} />
          <label className="text-xs text-zinc-500" htmlFor="sla-month">
            {L.sla.period}
          </label>
          <input
            id="sla-month"
            type="month"
            name="month"
            defaultValue={monthValue}
            className="input w-auto"
            max={`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`}
          />
          <button type="submit" className="btn-primary text-xs">
            {L.common.refresh}
          </button>
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
              sub={`${L.sla.period}: ${monthValue}`}
              icon={<ShieldIcon className="h-5 w-5" />}
            />
            <StatCard
              label={L.sla.compliance}
              value={`${sla.summary.compliant} / ${sla.summary.tracked}`}
              sub={`${sla.summary.breach} ${L.sla.breach.toLowerCase()}`}
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
              sub={`${L.sla.noData}: ${sla.summary.noData}`}
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
        </>
      )}
    </>
  );
}
