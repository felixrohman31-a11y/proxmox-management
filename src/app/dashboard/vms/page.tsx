import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import VmTable from '@/components/VmTable';
import { AlertIcon, CubeIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { fetchResources } from '@/lib/resources';
import { resolveCluster } from '@/lib/cluster-select';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function VmsPage({ searchParams }: { searchParams?: { c?: string | string[] } }) {
  const { clusters, cluster } = resolveCluster(searchParams?.c);

  let error: string | null = null;
  let guests: Awaited<ReturnType<typeof fetchResources>>['guests'] = [];

  if (cluster) {
    try {
      const data = await fetchResources(cluster.id);
      guests = data.guests;
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

  return (
    <>
      <PageHeader
        title="Virtual Machines"
        subtitle={cluster ? `${guests.length} guest pada "${cluster.name}"` : 'Kelola VM & container'}
      >
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard/vms" />
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <CubeIcon className="mx-auto h-10 w-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium text-zinc-200">Belum ada cluster Proxmox</h2>
          <p className="mt-1 text-sm text-zinc-500">Tambahkan cluster untuk melihat dan mengelola guest.</p>
          <Link href="/dashboard/clusters" className="btn-primary mt-5">
            Tambah Cluster
          </Link>
        </div>
      )}

      {cluster && error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Gagal mengambil data dari <b>{cluster.host}</b>: {error}
          </span>
        </div>
      )}

      {cluster && !error && (
        <VmTable clusterId={cluster.id} host={cluster.host} port={cluster.port} guests={guests} />
      )}
    </>
  );
}
