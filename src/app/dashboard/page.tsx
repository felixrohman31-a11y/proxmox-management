import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import ReportDownload from '@/components/ReportDownload';
import StatusBadge from '@/components/StatusBadge';
import StatCard, { Meter } from '@/components/StatCard';
import TaskPanel from '@/components/TaskPanel';
import { Th, Td } from '@/components/TableBits';
import { AlertIcon, CubeIcon, LayersIcon, ServerIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { fetchResources } from '@/lib/resources';
import { resolveCluster } from '@/lib/cluster-select';
import { fmtBytes, fmtUptime, pct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({ searchParams }: { searchParams?: { c?: string | string[] } }) {
  const { clusters, cluster } = resolveCluster(searchParams?.c);

  let error: string | null = null;
  let nodes: Awaited<ReturnType<typeof fetchResources>>['nodes'] = [];
  let guests: Awaited<ReturnType<typeof fetchResources>>['guests'] = [];

  if (cluster) {
    try {
      const data = await fetchResources(cluster.id);
      nodes = data.nodes;
      guests = data.guests;
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

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
        title="Overview"
        subtitle={cluster ? `Ringkasan resource cluster "${cluster.name}"` : 'Belum ada cluster terhubung'}
      >
        <ReportDownload clusterId={cluster?.id ?? ''} clusterName={cluster?.name} />
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard" />
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <LayersIcon className="mx-auto h-10 w-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium text-zinc-200">Belum ada cluster Proxmox</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tambahkan cluster pertama Anda untuk mulai memantau node dan virtual machine.
          </p>
          <Link href="/dashboard/clusters" className="btn-primary mt-5">
            Tambah Cluster
          </Link>
        </div>
      )}

      {cluster && error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Gagal mengambil data dari <b>{cluster.host}</b>: {error}
          </span>
        </div>
      )}

      {cluster && !error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Nodes"
              value={`${onlineNodes.length}/${nodes.length}`}
              sub={`${nodes.length - onlineNodes.length} offline`}
              icon={<ServerIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Guests"
              value={`${runningCount}/${guests.length}`}
              sub={`${stoppedCount} stopped · ${templateCount} template`}
              icon={<CubeIcon className="h-5 w-5" />}
            />
            <StatCard label="CPU" value={`${weightedCpu.toFixed(1)}%`} sub={`${totalCores.toFixed(0)} core`}>
              <Meter className="mt-3" value={weightedCpu} />
            </StatCard>
            <StatCard label="Memori" value={fmtBytes(memSum)} sub={`dari ${fmtBytes(memMaxSum)}`}>
              <Meter className="mt-3" value={pct(memSum, memMaxSum)} />
            </StatCard>
            <StatCard label="Penyimpanan" value={fmtBytes(diskSum)} sub={`dari ${fmtBytes(diskMaxSum)}`}>
              <Meter className="mt-3" value={pct(diskSum, diskMaxSum)} />
            </StatCard>
          </div>

          <section className="card overflow-hidden">
            <header className="border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">Node</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <Th>Node</Th>
                    <Th>Status</Th>
                    <Th>CPU</Th>
                    <Th className="min-w-[8rem]">Memori</Th>
                    <Th className="min-w-[10rem]">Disk</Th>
                    <Th>Uptime</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {nodes.map((n) => (
                    <tr key={n.node} className="hover:bg-zinc-900/40">
                      <Td>
                        <span className="font-medium text-zinc-200">{n.node}</span>
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
                        Tidak ada data node.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-200">Guest Terbaru</h2>
              <Link
                href={`/dashboard/vms?c=${cluster.id}`}
                className="text-xs font-medium text-orange-400 hover:text-orange-300"
              >
                Lihat semua →
              </Link>
            </header>
            <ul className="divide-y divide-zinc-800/70">
              {guests.slice(0, 8).map((g) => (
                <li key={`${g.node}-${g.vmid}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-zinc-500">{g.vmid}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-200">
                    {g.name}
                    {g.template && (
                      <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                        TEMPLATE
                      </span>
                    )}
                  </span>
                  <span className="hidden w-28 shrink-0 truncate text-xs text-zinc-500 sm:block">{g.node}</span>
                  <StatusBadge status={g.template ? 'template' : g.status} />
                  <span className="hidden w-20 shrink-0 text-right text-xs text-zinc-500 md:block">
                    {fmtUptime(g.uptime)}
                  </span>
                </li>
              ))}
              {guests.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-zinc-500">Belum ada VM/container pada cluster ini.</li>
              )}
            </ul>
          </section>

          <TaskPanel clusterId={cluster.id} />
        </div>
      )}
    </>
  );
}
