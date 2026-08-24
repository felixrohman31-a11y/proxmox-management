import type { PublicCluster } from '@/types';
import { getPveClient } from './pve';
import { readAudit } from './audit';

export interface MonthlyData {
  cluster: PublicCluster;
  year: number;
  month: number;
  nodes: NodeSummary[];
  guests: GuestSummary[];
  storages: StorageSummary[];
  failedTasks: { date: string; type: string; status: string }[];
  taskTotal: number;
  auditCount: number;
  auditTop: Array<[string, number]>;
  nodeSeries: Record<string, ChartRow[]>;
}

export interface NodeSummary {
  node: string;
  status: string;
  uptimeDays: string;
  cpuPct: number;
  memPct: number;
  memUsed: string;
  memTotal: string;
}

export interface GuestSummary {
  status: string;
  name: string;
  vmid: number;
  node: string;
  memPct: string;
}

export interface StorageSummary {
  storage: string;
  node: string;
  type: string;
  pct: number;
  used: string;
  total: string;
}

export interface ChartRow {
  t: number;
  [k: string]: number | null;
}

const GIB = 1024 ** 3;

export async function gatherMonthlyData(
  cluster: PublicCluster,
  year: number,
  month: number
): Promise<MonthlyData> {
  const client = getPveClient(cluster.id);
  if (!client) throw new Error('Cluster tidak ditemukan.');

  const res = ((await client.get<Array<Record<string, unknown>>>('/cluster/resources').catch(() => [])) ??
    []) as Array<Record<string, unknown>>;
  const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  const nodesRaw = res.filter((r) => r.type === 'node');
  const guestsRaw = res.filter((r) => r.type === 'qemu' || r.type === 'lxc');

  const nodes: NodeSummary[] = nodesRaw.map((r) => ({
    node: str(r.node),
    status: str(r.status),
    uptimeDays: num(r.uptime) >= 86400 ? `${Math.floor(num(r.uptime) / 86400)} hari` : '< 1 hari',
    cpuPct: Math.round(num(r.cpu) * 100),
    memPct: num(r.maxmem) ? Math.round((num(r.mem) / num(r.maxmem)) * 100) : 0,
    memUsed: `${(num(r.mem) / GIB).toFixed(1)} GB`,
    memTotal: `${(num(r.maxmem) / GIB).toFixed(1)} GB`
  }));

  const guests: GuestSummary[] = guestsRaw
    .map((r) => ({
      status: r.template ? 'template' : str(r.status) === 'running' ? 'BERJALAN' : str(r.status).toUpperCase(),
      name: str(r.name) || '-',
      vmid: num(r.vmid),
      node: str(r.node),
      memPct: num(r.maxmem) ? `${Math.round((num(r.mem) / num(r.maxmem)) * 100)}%` : '-'
    }))
    .sort((a, b) => a.vmid - b.vmid);

  const nodeNames = Array.from(new Set(nodes.map((n) => n.node))).filter(Boolean);
  const storageLists = await Promise.all(
    nodeNames.map((n) =>
      client
        .get<Array<Record<string, unknown>>>(`/nodes/${n}/storage`)
        .catch(() => [] as Array<Record<string, unknown>>)
    )
  );
  const seen = new Set<string>();
  const storages: StorageSummary[] = [];
  nodeNames.forEach((n, i) => {
    for (const s of storageLists[i]) {
      const name = str(s.storage);
      const total = num(s.total);
      const used = num(s.used);
      if (!name || !s.active || !total) continue;
      const key = `${name}|${total}:${used}`;
      if (seen.has(key)) continue;
      seen.add(key);
      storages.push({
        storage: name,
        node: n,
        type: str(s.type),
        pct: Math.round((used / total) * 100),
        used: `${(used / GIB).toFixed(1)} GB`,
        total: `${(total / GIB).toFixed(1)} GB`
      });
    }
  });
  storages.sort((a, b) => b.pct - a.pct);

  const startEpoch = Date.UTC(year, month - 1, 1, -7) / 1000;
  const endEpoch = Date.UTC(year, month, 1, -7) / 1000;
  const tasks = await client
    .get<Array<{ starttime?: number; status?: string; type?: string }>>('/cluster/tasks')
    .catch(() => []);
  const monthTasks = (tasks ?? []).filter(
    (t) => (t.starttime ?? 0) >= startEpoch && (t.starttime ?? 0) < endEpoch
  );
  const failedTasks = monthTasks
    .filter((t) => t.status && !String(t.status).toUpperCase().includes('OK'))
    .slice(0, 8)
    .map((t) => ({
      date: new Date((t.starttime ?? 0) * 1000).toLocaleDateString('id-ID'),
      type: str(t.type) || 'proses',
      status: str(t.status)
    }));

  const auditMonth = (await readAudit(2000)).filter((a) =>
    a.ts.startsWith(`${year}-${String(month).padStart(2, '0')}`)
  );
  const perAction = new Map<string, number>();
  for (const a of auditMonth) perAction.set(a.action, (perAction.get(a.action) ?? 0) + 1);
  const auditTop = [...perAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const nodeSeries: Record<string, ChartRow[]> = {};
  await Promise.all(
    nodeNames.map(async (n) => {
      const raw = await client
        .get<Array<Record<string, unknown>>>(`/nodes/${encodeURIComponent(n)}/rrddata`, {
          timeframe: 'month',
          cf: 'AVERAGE'
        })
        .catch(() => []);
      nodeSeries[n] = (raw ?? []).map((e) => ({
        t: num(e.time) * 1000,
        cpu: typeof e.cpu === 'number' && isFinite(e.cpu) ? e.cpu * 100 : null,
        memG: typeof e.memused === 'number' && isFinite(e.memused) ? e.memused / GIB : null,
        memTotG: typeof e.memtotal === 'number' && isFinite(e.memtotal) ? e.memtotal / GIB : null,
        netin: typeof e.netin === 'number' && isFinite(e.netin) ? e.netin : null,
        netout: typeof e.netout === 'number' && isFinite(e.netout) ? e.netout : null
      }));
    })
  );

  return {
    cluster,
    year,
    month,
    nodes,
    guests,
    storages,
    failedTasks,
    taskTotal: monthTasks.length,
    auditCount: auditMonth.length,
    auditTop,
    nodeSeries
  };
}
