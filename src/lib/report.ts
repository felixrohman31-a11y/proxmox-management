import { getPveClient, PveError } from './pve';
import { readAudit } from './audit';
import { getReportStrings } from './report-strings';
import { slaForCluster, fmtDowntime, type ClusterSla } from './sla';
type ReportStrings = ReturnType<typeof getReportStrings>;
import type { PublicCluster } from '@/types';

interface Res {
  type?: string;
  node?: string;
  name?: string;
  vmid?: number;
  status?: string;
  template?: number | boolean;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  uptime?: number;
}

interface StorageRow {
  storage?: string;
  type?: string;
  active?: number | boolean;
  total?: number;
  used?: number;
}

const GIB = 1024 ** 3;

function fmtGiB(bytes?: number | null): string {
  if (bytes == null || !isFinite(bytes)) return '-';
  return `${(bytes / GIB).toFixed(1)} GB`;
}

function fmtPct(part?: number | null, total?: number | null): string {
  if (!part && part !== 0) return '-';
  if (!total) return '-';
  return `${Math.round((part / total) * 100)}%`;
}

function kategori(pct: number, R: ReportStrings): string {
  if (pct >= 85) return R.critical;
  if (pct >= 70) return R.warning;
  return R.safe;
}

function daysFromSec(sec: number | undefined, en: boolean): string {
  if (!sec || sec < 86400) return en ? '< 1 day' : '< 1 hari';
  const d = Math.floor(sec / 86400);
  return en ? `${d} days` : `${d} hari`;
}

export async function buildMonthlyReport(
  cluster: PublicCluster,
  year: number,
  month: number,
  locale: 'id' | 'en' = 'id'
): Promise<{ filename: string; content: string }> {
  const R = getReportStrings(locale);
  const en = locale === 'en';
  const client = getPveClient(cluster.id);
  if (!client) throw new PveError('Cluster not found.', 404);

  const res = ((await client.get<Res[]>('/cluster/resources').catch(() => [])) ?? []) as Res[];
  const nodes = res.filter((r) => r.type === 'node');
  const guests = res.filter((r) => r.type === 'qemu' || r.type === 'lxc');

  const nodeNames = Array.from(new Set(nodes.map((n) => n.node ?? ''))).filter(Boolean);
  const storageLists = await Promise.all(
    nodeNames.map((n) =>
      client.get<StorageRow[]>(`/nodes/${n}/storage`).catch(() => [] as StorageRow[])
    )
  );
  const seenStorage = new Set<string>();
  const storages: Array<StorageRow & { node: string }> = [];
  nodeNames.forEach((n, i) => {
    for (const s of storageLists[i]) {
      if (!s.storage || !s.active || !s.total) continue;
      const key = `${s.storage}|${[s.total, s.used].join(':')}`;
      if (seenStorage.has(key)) continue;
      seenStorage.add(key);
      storages.push({ ...s, node: n });
    }
  });

  const now = new Date();
  const startEpoch = Date.UTC(year, month - 1, 1, -7) / 1000;
  const endEpoch = Date.UTC(year, month, 1, -7) / 1000;

  const allTasks = ((await client
    .get<Array<{ starttime?: number; status?: string; type?: string }>>('/cluster/tasks')
    .catch(() => [])) ?? []) as Array<{ starttime?: number; status?: string; type?: string }>;
  const monthTasks = allTasks.filter((t) => (t.starttime ?? 0) >= startEpoch && (t.starttime ?? 0) < endEpoch);
  const failedTasks = monthTasks.filter((t) => t.status && !String(t.status).toUpperCase().includes('OK'));

  const auditMonth = (await readAudit(2000)).filter((a) => a.ts.startsWith(`${year}-${String(month).padStart(2, '0')}`));

  let sla: ClusterSla | null = null;
  try {
    sla = await slaForCluster(cluster, year, month);
  } catch {
    sla = null;
  }

  const onlineNodes = nodes.filter((n) => n.status === 'online');
  const runningGuests = guests.filter((g) => !g.template && g.status === 'running');
  const stoppedGuests = guests.filter((g) => !g.template && g.status !== 'running');

  const storagePcts = storages.map((s) => ({ s, pct: ((s.used ?? 0) / (s.total ?? 1)) * 100 }));
  const kritisStorage = storagePcts.filter((x) => x.pct >= 85);
  const waspadaStorage = storagePcts.filter((x) => x.pct >= 70 && x.pct < 85);

  const reasons: string[] = [];
  if (onlineNodes.length < nodes.length)
    reasons.push(en ? `${nodes.length - onlineNodes.length} physical servers offline` : `${nodes.length - onlineNodes.length} server fisik tidak aktif`);
  if (kritisStorage.length)
    reasons.push(en ? `${kritisStorage.length} storage at CRITICAL level (>85%)` : `${kritisStorage.length} penyimpanan berstatus KRITIS (>85%)`);
  if (waspadaStorage.length)
    reasons.push(en ? `${waspadaStorage.length} storage nearly full (70-85%)` : `${waspadaStorage.length} penyimpanan mulai penuh (70-85%)`);
  if (failedTasks.length)
    reasons.push(en ? `${failedTasks.length} technical processes failed this month` : `${failedTasks.length} proses teknis gagal di bulan ini`);
  if (stoppedGuests.length)
    reasons.push(en ? `${stoppedGuests.length} VMs/containers are powered off` : `${stoppedGuests.length} mesin virtual/container dalam keadaan mati`);

  const kondisi =
    reasons.length === 0 ? R.healthy : kritisStorage.length ? R.needsAction : R.generallyHealthy;

  const L: string[] = [];
  const garis = '='.repeat(64);
  L.push(garis);
  L.push(R.reportTitle);
  L.push(`${R.cluster}: ${cluster.name} (${cluster.host})`);
  L.push(`${R.period}: ${R.months[month]} ${year}`);
  L.push(`${R.generated}: ${now.toLocaleDateString(locale === 'en' ? 'en-US' : 'id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('en-US', { hour12: false })} — ${R.by}`);
  L.push(garis);
  L.push('');
  L.push(R.secA);
  L.push(`   ${R.condition}: ${kondisi}`);
  L.push(`   ${R.serversOnline}: ${onlineNodes.length} / ${nodes.length}`);
  L.push(`   ${R.guestsRunning}: ${runningGuests.length} / ${guests.length} (${stoppedGuests.length} ${R.guestsStopped})`);
  L.push(`   ${R.failedProcesses}: ${failedTasks.length} ${R.incidents}`);
  {
    const avg = sla?.summary.avgPct ?? null;
    const slaVal =
      avg === null
        ? R.slaNoDataShort
        : `${avg.toFixed(2)}% (${sla!.summary.compliant}/${sla!.summary.tracked} ${R.slaCompliant.toLowerCase()})`;
    L.push(`   ${R.slaIndicator}: ${slaVal}`);
  }
  if (reasons.length) {
    L.push(`   ${R.attention}`);
    for (const a of reasons) L.push(`     - ${a}`);
  }
  L.push('');

  L.push(R.secB);
  for (const n of nodes) {
    const memPct = fmtPct(n.mem, n.maxmem);
    const st = n.status === 'online' ? R.online : R.offline;
    L.push(`   - ${n.node}: ${st}, ${R.uptime} ${daysFromSec(n.uptime, en)}, ${R.load} ${Math.round((n.cpu ?? 0) * 100)}%, ${R.memUsed} ${memPct} (${fmtGiB(n.mem)} / ${fmtGiB(n.maxmem)})`);
  }
  L.push('');

  L.push(R.secC);
  const tplCount = guests.filter((g) => g.template).length;
  L.push(`   ${R.total}: ${guests.length} — ${runningGuests.length} ${R.runningLower}, ${stoppedGuests.length} ${R.stoppedLower}, ${tplCount} ${R.templateLower}`);
  const maxList = Math.min(guests.length, 25);
  const sorted = [...guests].sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0));
  for (const g of sorted.slice(0, maxList)) {
    const status = g.template ? R.templateLower.toUpperCase() : g.status === 'running' ? R.running : String(g.status ?? '?').toUpperCase();
    L.push(`   - [${status}] ${g.name ?? '-'} (ID ${g.vmid}, ${g.node}) — ${R.mem} ${fmtPct(g.mem, g.maxmem)}`);
  }
  if (guests.length > maxList)
    L.push(`   ... ${R.andOthers.replace('{n}', String(guests.length - maxList))}`);
  L.push('');

  L.push(R.secD);
  for (const { s, pct } of storagePcts.sort((a, b) => b.pct - a.pct)) {
    L.push(`   - ${s.storage} (${s.node}, ${s.type}): ${fmtPct(s.used, s.total)} ${R.used} (${fmtGiB(s.used)} / ${fmtGiB(s.total)}) — ${kategori(pct, R)}`);
  }
  if (!storages.length) L.push(`   ${R.noStorageData}`);
  L.push('');

  L.push(R.secE);
  if (!failedTasks.length) {
    L.push(`   ${R.noEvents}`);
  } else {
    L.push(`   ${R.eventCount.replace('{n}', String(failedTasks.length))}`);
    for (const t of failedTasks.slice(0, 5)) {
      L.push(`   - ${t.type ?? 'process'} ${new Date((t.starttime ?? 0) * 1000).toLocaleDateString(locale === 'en' ? 'en-US' : 'id-ID')} — ${t.status}`);
    }
    if (failedTasks.length > 5) L.push(`   ... ${R.moreEvents.replace('{n}', String(failedTasks.length - 5))}`);
  }
  L.push('');

  L.push(R.secF);
  let hasRec = false;
  for (const { s, pct } of kritisStorage) {
    L.push(`   - ${R.recStoreCritical.replace('{s}', s.storage ?? '').replace('{p}', String(Math.round(pct)))}`);
    hasRec = true;
  }
  for (const { s, pct } of waspadaStorage) {
    L.push(`   - ${R.recStoreWarning.replace('{s}', s.storage ?? '').replace('{p}', String(Math.round(pct)))}`);
    hasRec = true;
  }
  if (onlineNodes.length < nodes.length) {
    L.push(`   - ${R.recOfflineNode}`);
    hasRec = true;
  }
  if (failedTasks.length) {
    L.push(`   - ${R.recFailedTasks}`);
    hasRec = true;
  }
  if (stoppedGuests.length) {
    L.push(`   - ${R.recStoppedGuests.replace('{n}', String(stoppedGuests.length))}`);
    hasRec = true;
  }
  if (!hasRec) L.push(`   ${R.noRec}`);
  L.push('');

  L.push(R.secG);
  if (!sla || !sla.summary.tracked) {
    L.push(`   ${R.slaNone}`);
  } else {
    L.push(
      `   ${R.slaSummaryLine
        .replace('{avg}', sla.summary.avgPct === null ? '-' : sla.summary.avgPct.toFixed(2))
        .replace('{ok}', String(sla.summary.compliant))
        .replace('{n}', String(sla.summary.tracked))
        .replace('{breach}', String(sla.summary.breach))}`
    );
    L.push('');
    L.push(`   ${R.slaHtmlNodes}:`);
    for (const n of sla.nodes) {
      const actual = n.actualPct === null ? R.slaNoDataShort : `${n.actualPct.toFixed(2)}%`;
      L.push(
        `   ${R.slaNodeLine
          .replace('{name}', n.name)
          .replace('{target}', n.target.toFixed(2))
          .replace('{actual}', actual)
          .replace('{down}', fmtDowntime(n.downtimeMin, en))}`
      );
    }
    L.push('');
    L.push(`   ${R.slaWorstNote}`);
    const worst = [...sla.guests]
      .sort((a, b) => (a.actualPct ?? 999) - (b.actualPct ?? 999))
      .slice(0, 15);
    for (const g of worst) {
      const actual = g.actualPct === null ? R.slaNoDataShort : `${g.actualPct.toFixed(2)}%`;
      L.push(
        `   ${R.slaGuestLine
          .replace('{name}', g.name)
          .replace('{vmid}', String(g.vmid ?? '-'))
          .replace('{node}', g.node)
          .replace('{target}', g.target.toFixed(2))
          .replace('{actual}', actual)
          .replace('{down}', fmtDowntime(g.downtimeMin, en))}`
      );
    }
    const hidden = sla.guests.length - worst.length;
    if (hidden > 0) L.push(`   ... ${R.moreEvents.replace('{n}', String(hidden))}`);
  }
  L.push('');

  L.push(R.secH);
  L.push(`   ${R.auditActions.replace('{n}', String(auditMonth.length))}`);
  const perAction = new Map<string, number>();
  for (const a of auditMonth) perAction.set(a.action, (perAction.get(a.action) ?? 0) + 1);
  for (const [act, c] of [...perAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    L.push(`   - ${act}: ${c}`);
  }
  L.push('');
  L.push(garis);
  L.push(R.footer);
  L.push(garis);

  const slug = cluster.name.replace(/[^a-zA-Z0-9]+/g, '-');
  return {
    filename: `${locale === 'en' ? 'Report' : 'Laporan'}-Virtualization-${slug}-${year}-${String(month).padStart(2, '0')}.txt`,
    content: L.join('\r\n')
  };
}

// helper for "and others" pattern
declare module './report-strings' {
  interface ReportStrings {
    andOthers: string;
  }
}

