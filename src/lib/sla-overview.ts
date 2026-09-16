import { listClustersSync } from './store';
import { slaForRange } from './sla';
import type { ClusterSla } from './sla';
import { mapLimit } from './concurrency';
import type { PublicCluster } from '@/types';

/**
 * Ringkasan SLA lintas-cluster (fleet). Mengagregasi hasil slaForRange per
 * cluster untuk satu periode menjadi angka gabungan + tabel per-cluster +
 * daftar pelanggaran terburuk di seluruh infrastruktur.
 */

export interface FleetCluster {
  clusterId: string;
  name: string;
  host: string;
  reachable: boolean;
  avgPct: number | null;
  tracked: number;
  compliant: number;
  breach: number;
  noData: number;
  atRisk: number;
  totalDowntimeMin: number;
  maintenanceMin: number;
  worst: { name: string; node: string; pct: number | null } | null;
}

export interface FleetTotals {
  clusters: number;
  reachable: number;
  tracked: number;
  compliant: number;
  breach: number;
  noData: number;
  atRisk: number;
  avgPct: number | null; // rata-rata tertimbang (bobot = tracked)
  totalDowntimeMin: number;
  maintenanceMin: number;
}

export interface FleetBreach {
  cluster: string;
  name: string;
  node: string;
  kind: 'guest' | 'node';
  target: number;
  actualPct: number | null;
  downtimeMin: number | null;
}

export interface FleetOverview {
  rangeStart: number;
  rangeEnd: number;
  clusters: FleetCluster[];
  totals: FleetTotals;
  topBreaches: FleetBreach[];
}

const FLEET_CONCURRENCY = 3; // cluster dihitung paralel (fan-out rrddata per cluster sudah dibatasi)

/** Rata-rata fleet tertimbang jumlah entitas terpantau (murni, teruji). */
export function aggregateFleet(rows: FleetCluster[]): FleetTotals {
  const t: FleetTotals = {
    clusters: rows.length,
    reachable: rows.filter((r) => r.reachable).length,
    tracked: 0,
    compliant: 0,
    breach: 0,
    noData: 0,
    atRisk: 0,
    avgPct: null,
    totalDowntimeMin: 0,
    maintenanceMin: 0
  };
  let weighted = 0;
  let weightSum = 0;
  for (const r of rows) {
    t.tracked += r.tracked;
    t.compliant += r.compliant;
    t.breach += r.breach;
    t.noData += r.noData;
    t.atRisk += r.atRisk;
    t.totalDowntimeMin += r.totalDowntimeMin;
    t.maintenanceMin += r.maintenanceMin;
    if (r.reachable && r.avgPct != null && r.tracked > 0) {
      weighted += r.avgPct * r.tracked;
      weightSum += r.tracked;
    }
  }
  t.avgPct = weightSum > 0 ? Math.round((weighted / weightSum) * 100) / 100 : null;
  return t;
}

function toFleetCluster(cluster: PublicCluster, sla: ClusterSla): FleetCluster {
  const all = [...sla.nodes, ...sla.guests];
  const tracked = all.filter((r) => r.actualPct != null);
  let worst: FleetCluster['worst'] = null;
  for (const r of tracked) {
    if (!worst || (r.actualPct as number) < (worst.pct as number)) {
      worst = { name: r.name, node: r.node, pct: r.actualPct };
    }
  }
  return {
    clusterId: cluster.id,
    name: cluster.name,
    host: cluster.host,
    reachable: true,
    avgPct: sla.summary.avgPct,
    tracked: sla.summary.tracked,
    compliant: sla.summary.compliant,
    breach: sla.summary.breach,
    noData: sla.summary.noData,
    atRisk: sla.summary.atRisk,
    totalDowntimeMin: sla.summary.totalDowntimeMin,
    maintenanceMin: sla.summary.maintenanceMin,
    worst
  };
}

function unreachable(cluster: PublicCluster): FleetCluster {
  return {
    clusterId: cluster.id,
    name: cluster.name,
    host: cluster.host,
    reachable: false,
    avgPct: null,
    tracked: 0,
    compliant: 0,
    breach: 0,
    noData: 0,
    atRisk: 0,
    totalDowntimeMin: 0,
    maintenanceMin: 0,
    worst: null
  };
}

export async function fleetSla(startEpoch: number, endEpoch: number): Promise<FleetOverview> {
  const clusters = listClustersSync();
  const breaches: FleetBreach[] = [];
  const rows = await mapLimit(clusters, FLEET_CONCURRENCY, async (cluster): Promise<FleetCluster> => {
    try {
      const sla = await slaForRange(cluster, startEpoch, endEpoch);
      for (const r of [...sla.nodes, ...sla.guests]) {
        if (r.status === 'breach') {
          breaches.push({
            cluster: cluster.name,
            name: r.name,
            node: r.node,
            kind: r.kind,
            target: r.target,
            actualPct: r.actualPct,
            downtimeMin: r.downtimeMin
          });
        }
      }
      return toFleetCluster(cluster, sla);
    } catch {
      return unreachable(cluster);
    }
  });

  // urutkan: availability terendah dulu, lalu downtime terbesar
  breaches.sort((a, b) => {
    const av = a.actualPct ?? 0;
    const bv = b.actualPct ?? 0;
    if (av !== bv) return av - bv;
    return (b.downtimeMin ?? 0) - (a.downtimeMin ?? 0);
  });

  return {
    rangeStart: startEpoch,
    rangeEnd: endEpoch,
    clusters: rows.sort((a, b) => a.name.localeCompare(b.name)),
    totals: aggregateFleet(rows),
    topBreaches: breaches.slice(0, 20)
  };
}
