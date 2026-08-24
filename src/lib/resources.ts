import { getPveClient, PveError } from './pve';
import type { GuestRow, NodeRow } from '@/types';

interface PveResource {
  id: string;
  type: string;
  node?: string;
  vmid?: number;
  name?: string;
  status?: string;
  template?: number | boolean;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  tags?: string;
}

export async function fetchResources(clusterId: string): Promise<{ nodes: NodeRow[]; guests: GuestRow[] }> {
  const client = getPveClient(clusterId);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);
  const res = (await client.get<PveResource[]>('/cluster/resources')) ?? [];

  const nodes: NodeRow[] = res
    .filter((r) => r.type === 'node')
    .map((r) => ({
      node: r.node ?? '-',
      status: r.status ?? 'unknown',
      cpuPercent: Math.round((r.cpu ?? 0) * 100),
      maxCpu: r.maxcpu ?? 0,
      memUsed: r.mem ?? 0,
      memMax: r.maxmem ?? 0,
      diskUsed: r.disk ?? 0,
      diskMax: r.maxdisk ?? 0,
      uptime: r.uptime ?? 0
    }));

  const guests: GuestRow[] = res
    .filter((r) => r.type === 'qemu' || r.type === 'lxc')
    .map((r) => ({
      vmid: r.vmid ?? 0,
      name: r.name ?? `VM ${r.vmid ?? '?'}`,
      type: r.type as GuestRow['type'],
      node: r.node ?? '-',
      status: r.status ?? 'unknown',
      template: Boolean(r.template),
      cpuPercent: Math.round((r.cpu ?? 0) * 100),
      memUsed: r.mem ?? 0,
      memMax: r.maxmem ?? 0,
      diskUsed: r.disk ?? 0,
      diskMax: r.maxdisk ?? 0,
      uptime: r.uptime ?? 0,
      tags: (r.tags ?? '')
        .split(/[;,]/)
        .map((t) => t.trim())
        .filter(Boolean)
    }))
    .sort((a, b) => a.vmid - b.vmid);

  return { nodes, guests };
}
