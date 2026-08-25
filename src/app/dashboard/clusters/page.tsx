import PageHeader from '@/components/PageHeader';
import ClusterManager from '@/components/ClusterManager';
import { serverT } from '@/lib/locale-server';
import { listClustersSync } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function ClustersPage() {
  const L = serverT();
  const clusters = listClustersSync();
  return (
    <>
      <PageHeader title={L.clusters.title} subtitle={L.clusters.sub} />
      <ClusterManager clusters={clusters} />
    </>
  );
}
