import PageHeader from '@/components/PageHeader';
import ClusterSelector from '@/components/ClusterSelector';
import RrdExplorer from '@/components/RrdExplorer';
import { ChartIcon } from '@/components/icons';
import { PveError } from '@/lib/pve';
import { fetchResources } from '@/lib/resources';
import { resolveCluster } from '@/lib/cluster-select';
import Link from 'next/link';
import { serverT } from '@/lib/locale-server';
import { fmt } from '@/lib/i18n-dict';

export const dynamic = 'force-dynamic';

const TFS = ['hour', 'day', 'week', 'month', 'year'] as const;
type Tf = (typeof TFS)[number];

function pickTf(v?: string | string[]): Tf {
  const s = Array.isArray(v) ? v[0] : v;
  return (TFS as readonly string[]).includes(s ?? '') ? (s as Tf) : 'day';
}

export default async function GraphsPage({
  searchParams
}: {
  searchParams?: { c?: string | string[]; t?: string | string[]; n?: string | string[]; g?: string | string[]; tf?: string | string[] };
}) {
  const sp = searchParams ?? {};
  const L = serverT();
  const { clusters, cluster } = resolveCluster(sp.c);

  let nodes: { node: string; status: string }[] = [];
  let guests: { vmid: number; type: 'qemu' | 'lxc'; name: string; node: string }[] = [];
  let error: string | null = null;

  if (cluster) {
    try {
      const data = await fetchResources(cluster.id);
      nodes = data.nodes.map((n) => ({ node: n.node, status: n.status }));
      guests = data.guests.map((g) => ({ vmid: g.vmid, type: g.type, name: g.name, node: g.node, status: g.status }));
    } catch (e) {
      error = e instanceof PveError ? e.message : (e as Error).message;
    }
  }

  const targetType = (Array.isArray(sp.t) ? sp.t[0] : sp.t) === 'guest' ? 'guest' : 'node';
  const nodeParam = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const guestParam = Array.isArray(sp.g) ? sp.g[0] : sp.g;
  const tf = pickTf(sp.tf);

  return (
    <>
      <PageHeader title={L.graphs.title} subtitle={cluster ? fmt(L.graphs.subFor, { name: cluster.name }) : L.overview.subNone}>
        <ClusterSelector clusters={clusters} currentId={cluster?.id ?? null} basePath="/dashboard/graphs" />
      </PageHeader>

      {!cluster && (
        <div className="card mx-auto max-w-lg p-8 text-center">
          <ChartIcon className="mx-auto h-10 w-10 text-zinc-600" />
          <h2 className="mt-3 text-lg font-medium text-zinc-200">{L.common.emptyClusterTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500">{L.common.emptyClusterDesc}</p>
          <Link href="/dashboard/clusters" className="btn-primary mt-5">
            Tambah Cluster
          </Link>
        </div>
      )}

      {cluster && error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {cluster && !error && (
        <RrdExplorer
          key={cluster.id}
          clusterId={cluster.id}
          nodes={nodes}
          guests={guests}
          init={{ targetType, node: nodeParam, guestKey: guestParam, tf }}
        />
      )}
    </>
  );
}
