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

interface NodeStatusResp {
  cpu?: number;
  cpuinfo?: { cpus?: number };
  memory?: { used?: number; total?: number };
  rootfs?: { used?: number; total?: number };
  uptime?: number;
}

interface GuestStatusResp {
  status?: string;
  name?: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number | string | boolean;
}

const hasStatus = (r: PveResource): boolean => r.status !== undefined && r.status !== null;

export async function fetchResources(clusterId: string): Promise<{ nodes: NodeRow[]; guests: GuestRow[] }> {
  const client = getPveClient(clusterId);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);
  const res = (await client.get<PveResource[]>('/cluster/resources')) ?? [];

  const nodeRaw = res.filter((r) => r.type === 'node');
  const guestRaw = res.filter((r) => r.type === 'qemu' || r.type === 'lxc');

  const nodes: NodeRow[] = await Promise.all(
    nodeRaw.map(async (r): Promise<NodeRow> => {
      if (hasStatus(r)) {
        return {
          node: r.node ?? '-',
          status: r.status as string,
          cpuPercent: Math.round((r.cpu ?? 0) * 100),
          maxCpu: r.maxcpu ?? 0,
          memUsed: r.mem ?? 0,
          memMax: r.maxmem ?? 0,
          diskUsed: r.disk ?? 0,
          diskMax: r.maxdisk ?? 0,
          uptime: r.uptime ?? 0
        };
      }
      // PVE ≤4.x: /cluster/resources tak kirim status/metrik → ambil dari /status.
      try {
        const s = await client.get<NodeStatusResp>(`/nodes/${encodeURIComponent(r.node ?? '')}/status`);
        return {
          node: r.node ?? '-',
          status: 'online',
          cpuPercent: Math.round((s.cpu ?? 0) * 100),
          maxCpu: s.cpuinfo?.cpus ?? 0,
          memUsed: s.memory?.used ?? 0,
          memMax: s.memory?.total ?? 0,
          diskUsed: s.rootfs?.used ?? 0,
          diskMax: s.rootfs?.total ?? 0,
          uptime: s.uptime ?? 0
        };
      } catch {
        return {
          node: r.node ?? '-',
          status: 'offline',
          cpuPercent: 0,
          maxCpu: 0,
          memUsed: 0,
          memMax: 0,
          diskUsed: 0,
          diskMax: 0,
          uptime: 0
        };
      }
    })
  );

  const guests: GuestRow[] = (
    await Promise.all(
      guestRaw.map(async (r): Promise<GuestRow> => {
        const vmid = r.vmid ?? 0;
        const type = r.type as GuestRow['type'];
        const node = r.node ?? '-';
        if (hasStatus(r)) {
          return {
            vmid,
            name: r.name ?? `VM ${r.vmid ?? '?'}`,
            type,
            node,
            status: r.status as string,
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
          };
        }
        // PVE ≤4.x: lengkapi status/nama/metrik lewat status/current.
        try {
          const s = await client.get<GuestStatusResp>(
            `/nodes/${encodeURIComponent(node)}/${type}/${vmid}/status/current`
          );
          return {
            vmid,
            name: s.name ?? `VM ${vmid}`,
            type,
            node,
            status: s.status ?? 'unknown',
            template: Boolean(s.template),
            cpuPercent: Math.round((s.cpu ?? 0) * 100),
            memUsed: s.mem ?? 0,
            memMax: s.maxmem ?? 0,
            diskUsed: s.disk ?? 0,
            diskMax: s.maxdisk ?? 0,
            uptime: s.uptime ?? 0,
            tags: []
          };
        } catch {
          return {
            vmid,
            name: `VM ${vmid}`,
            type,
            node,
            status: 'unknown',
            template: false,
            cpuPercent: 0,
            memUsed: 0,
            memMax: 0,
            diskUsed: 0,
            diskMax: 0,
            uptime: 0,
            tags: []
          };
        }
      })
    )
  ).sort((a, b) => a.vmid - b.vmid);

  return { nodes, guests };
}
