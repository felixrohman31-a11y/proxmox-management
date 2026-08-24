'use client';

import { useRouter } from 'next/navigation';
import type { PublicCluster } from '@/types';

export default function ClusterSelector({
  clusters,
  currentId,
  basePath
}: {
  clusters: PublicCluster[];
  currentId: string | null;
  basePath: string;
}) {
  const router = useRouter();
  if (clusters.length === 0) return null;
  return (
    <select
      aria-label="Pilih cluster"
      className="input w-auto min-w-[210px]"
      value={currentId ?? ''}
      onChange={(e) => router.push(`${basePath}?c=${e.target.value}`)}
    >
      {clusters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} — {c.host}
        </option>
      ))}
    </select>
  );
}
