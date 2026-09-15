import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import ReportDownload from '@/components/ReportDownload';
import StatusBadge from '@/components/StatusBadge';
import StatCard, { Meter } from '@/components/StatCard';
import TaskPanel from '@/components/TaskPanel';
import EmptyState from '@/components/EmptyState';
import AutoRefresh from '@/components/AutoRefresh';
import DensityToggle from '@/components/DensityToggle';
import GuestList from '@/components/GuestList';
import { Th, Td } from '@/components/TableBits';
import { AlertIcon, CubeIcon, LayersIcon, ServerIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { fetchResources } from '@/lib/resources';
import { resolveCluster } from '@/lib/cluster-select';
import { fmtBytes, fmtUptime, pct } from '@/lib/format';
import { getServerLocale } from '@/lib/locale-server';
import { serverT } from '@/lib/locale-server';
import { fmt } from '@/lib/i18n-dict';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({ searchParams }: { searchParams?: { c?: string | string[] } }) {
  const L = serverT();
  const locale = getServerLocale();
  const { clusters, cluster } = resolveCluster(searchParams?.c);

  let error: string | null = null;
  let nodes: Awaited<ReturnType<typeof fetchResources>>['nodes'] = [];
  let guests: Awaited<ReturnType<typeof fetchResources>>['guests'] = [];
  let pveVersion: string | undefined;

  if (cluster) {
    try {
      const data = await fetchResources(cluster.id);
      nodes = data.nodes;
      guests = data.guests;
      pveVersion = data.pveVersion;
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

  const compat = pveVersion ? /^([45])\./.test(pveVersion) : false;

  const onlineNodes = nodes.filter((n) => n.status === 'online');
  const totalCores = nodes.reduce((s, n) => s + n.maxCpu, 0);
  const usedCores = nodes.reduce((s, n) => s + (n.cpuPercent / 100) * n.maxCpu, 0);
  const weightedCpu =
    totalCores > 0
      ? (usedCores / totalCores) * 100
      : nodes.length > 0
        ? nodes.reduce((s, n) => s + n.cpuPercent, 0) / nodes.length
        : 0;
  const memSum = nodes.reduce((s, n) => s + n.memUsed, 0);
  const memMaxSum = nodes.reduce((s, n) => s + n.memMax, 0);
  const diskSum = nodes.reduce((s, n) => s + n.diskUsed, 0);
  const diskMaxSum = nodes.reduce((s, n) => s + n.diskMax, 0);
  const runningCount = guests.filter((g) => !g.template && g.status === 'running').length;
  const stoppedCount = guests.filter((g) => !g.template && g.status !== 'running').length;
  const templateCount = guests.filter((g) => g.template).length;

  return (
    <>
      <PageHeader
        title={L.overview.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{cluster ? fmt(L.overview.subFor, { name: cluster.name }) : L.overview.subNone}</span>
            {pveVersion && (
              <span className="inline-flex h-10 items-center rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 text-sm text-zinc-300">
                {fmt(L.overview.pveVersion, { v: pveVersion })}
              </span>
            )}
            {compat && (
              <span
                className="inline-flex h-10 items-center rounded-lg border border-amber-700/50 bg-amber-500/10 px-3 text-sm font-medium text-amber-400"
                title={fmt(L.overview.compatMode, {})}
              >
                {fmt(L.overview.compatMode, {})}
              </span>
            )}
          </span>
        }
      >
        <ReportDownload clusterId={cluster?.id ?? ''} clusterName={cluster?.name} />
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard" />
        <DensityToggle
          compactLabel={L.overview.compactOn}
          comfortableLabel={L.overview.compactOff}
        />
        <AutoRefresh label={L.overview.autoRefresh} updatedTemplate={L.overview.autoUpdated} />
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg">
          <EmptyState
            icon={<LayersIcon className="h-10 w-10" />}
            title={L.common.emptyClusterTitle}
            description={L.common.emptyClusterDesc}
            action={
              <Link href="/dashboard/clusters" className="btn-primary">
                {L.common.addCluster}
              </Link>
            }
          />
        </div>
      )}

      {cluster && error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {fmt(L.overview.failFetch, { host: cluster.host, err: error })}
          </span>
        </div>
      )}

      {cluster && !error && (
        <div className="space-y-6">
          <div className="stat-grid grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Nodes"
              value={`${onlineNodes.length}/${nodes.length}`}
              sub={`${nodes.length - onlineNodes.length} ${L.overview.offline}`}
              icon={<ServerIcon className="h-5 w-5" />}
            />
            <StatCard
              label={L.overview.statGuests}
              value={`${runningCount}/${guests.length}`}
              sub={`${stoppedCount} ${L.overview.stoppedWord} · ${templateCount} ${L.overview.templateWord}`}
              icon={<CubeIcon className="h-5 w-5" />}
            />
            <StatCard label={L.overview.statCpu} value={`${weightedCpu.toFixed(1)}%`} sub={`${totalCores.toFixed(0)} ${L.overview.coreWord}`}>
              <Meter className="mt-3" value={weightedCpu} />
            </StatCard>
            <StatCard label={L.overview.statMem} value={fmtBytes(memSum)} sub={`${L.overview.fromWord} ${fmtBytes(memMaxSum)}`}>
              <Meter className="mt-3" value={pct(memSum, memMaxSum)} />
            </StatCard>
            <StatCard label={L.overview.statStore} value={fmtBytes(diskSum)} sub={`${L.overview.fromWord} ${fmtBytes(diskMaxSum)}`}>
              <Meter className="mt-3" value={pct(diskSum, diskMaxSum)} />
            </StatCard>
          </div>

          <p className="text-xs text-zinc-500">{L.overview.thresholdHint}</p>

          <section className="card overflow-hidden">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">{L.overview.heatmap}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{L.overview.heatmapHint}</p>
            </header>
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {nodes.map((n) => {
                const memPct = pct(n.memUsed, n.memMax);
                const diskPct = pct(n.diskUsed, n.diskMax);
                const load = Math.max(n.cpuPercent, memPct, diskPct);
                const tone =
                  load < 80
                    ? 'border-emerald-700/40 bg-emerald-500/10'
                    : load < 90
                      ? 'border-amber-700/40 bg-amber-500/10'
                      : 'border-red-700/40 bg-red-500/10';
                return (
                  <div key={n.node} className={`heat-tile rounded-lg border p-3 ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-zinc-200">{n.node}</span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{n.status}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] text-zinc-400">
                      <div>
                        <div className="font-semibold text-zinc-300">{n.cpuPercent}%</div>
                        <div>CPU</div>
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-300">{Math.round(memPct)}%</div>
                        <div>Mem</div>
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-300">{Math.round(diskPct)}%</div>
                        <div>Disk</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && (
                <div className="col-span-full py-6 text-center text-sm text-zinc-500">{L.overview.noNodes}</div>
              )}
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">{L.overview.secNodes}</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <Th>{L.overview.statNodes}</Th>
                    <Th>{L.vms.colStatus}</Th>
                    <Th>CPU</Th>
                    <Th className="min-w-[8rem]">Memori</Th>
                    <Th className="min-w-[10rem]">Disk</Th>
                    <Th>{L.vms.colUptime}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {nodes.map((n) => (
                    <tr key={n.node} className="hover:bg-zinc-900/40">
                      <Td>
                        <span className="font-medium text-zinc-200">{n.node}</span>
                        {n.pveVersion && (
                          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                            PVE {n.pveVersion}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <StatusBadge status={n.status} />
                      </Td>
                      <Td className="tabular-nums">{n.cpuPercent}%</Td>
                      <Td>
                        <Meter value={pct(n.memUsed, n.memMax)} />
                        <span className="mt-1 block whitespace-nowrap text-xs text-zinc-500">
                          {fmtBytes(n.memUsed)} / {fmtBytes(n.memMax)}
                        </span>
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-400">
                        {fmtBytes(n.diskUsed)} / {fmtBytes(n.diskMax)}
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-400">{fmtUptime(n.uptime)}</Td>
                    </tr>
                  ))}
                  {nodes.length === 0 && (
                    <tr>
                      <Td colSpan={6} className="py-6 text-center text-zinc-500">
                        {L.overview.noNodes}
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">{L.overview.secGuests}</h2>
              <Link
                href={`/dashboard/vms?c=${cluster.id}`}
                className="text-xs font-medium text-orange-400 hover:text-orange-300"
              >
                {L.overview.viewAll}
              </Link>
            </header>
            <GuestList
              guests={guests}
              viewAllHref={`/dashboard/vms?c=${cluster.id}`}
              labels={{
                all: L.overview.filterAll,
                running: L.overview.filterRunning,
                stopped: L.overview.filterStopped,
                search: L.overview.searchPlaceholder,
                viewAll: L.overview.viewAll,
                empty: L.overview.noGuests
              }}
            />
          </section>

          <TaskPanel clusterId={cluster.id} />
        </div>
      )}
    </>
  );
}
