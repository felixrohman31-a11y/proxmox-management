import PageHeader from '@/components/PageHeader';
import ClusterManager from '@/components/ClusterManager';
import { listClustersSync } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default function ClustersPage() {
  const clusters = listClustersSync();
  return (
    <>
      <PageHeader title="Clusters" subtitle="Kelola koneksi ke server/cluster Proxmox VE" />
      <ClusterManager clusters={clusters} />
    </>
  );
}
