import { listClustersSync } from './store';
import type { PublicCluster } from '@/types';

export interface ResolvedCluster {
  clusters: PublicCluster[];
  cluster: PublicCluster | null;
}

export function resolveCluster(param?: string | string[]): ResolvedCluster {
  const clusters = listClustersSync();
  const wanted = Array.isArray(param) ? param[0] : param;
  const cluster = (wanted ? clusters.find((c) => c.id === wanted) : undefined) ?? clusters[0] ?? null;
  return { clusters, cluster };
}
