import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import CreateGuestForm from '@/components/CreateGuestForm';
import { PlusIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { fetchResources } from '@/lib/resources';
import { resolveCluster } from '@/lib/cluster-select';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CreatePage({ searchParams }: { searchParams?: { c?: string | string[] } }) {
  const { clusters, cluster } = resolveCluster(searchParams?.c);

  let nodes: { node: string; status: string }[] = [];
  let error: string | null = null;
  if (cluster) {
    try {
      const data = await fetchResources(cluster.id);
      nodes = data.nodes.map((n) => ({ node: n.node, status: n.status }));
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

  return (
    <>
      <PageHeader title="Buat Guest" subtitle={cluster ? `Provisioning baru pada "${cluster.name}"` : 'Belum ada cluster'}>
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard/create" />
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <PlusIcon className="mx-auto h-10 w-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium text-zinc-200">Belum ada cluster Proxmox</h2>
          <p className="mt-1 text-sm text-zinc-500">Tambahkan cluster untuk membuat VM/container baru.</p>
          <Link href="/dashboard/clusters" className="btn-primary mt-5">
            Tambah Cluster
          </Link>
        </div>
      )}

      {cluster && error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {cluster && !error && <CreateGuestForm key={cluster.id} clusterId={cluster.id} nodes={nodes} />}
    </>
  );
}
