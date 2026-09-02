import PageHeader from '@/components/PageHeader';
import ClusterManager from '@/components/ClusterManager';
import { serverT } from '@/lib/locale-server';
import { listClustersSync } from '@/lib/store';
import { getSessionFromCookies } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default function ClustersPage() {
  const L = serverT();
  const session = getSessionFromCookies();
  const clusters = listClustersSync();
  const readOnly = session?.role === 'auditor';
  return (
    <>
      <PageHeader title={L.clusters.title} subtitle={L.clusters.sub} />
      <ClusterManager clusters={clusters} readOnly={readOnly} />
    </>
  );
}
