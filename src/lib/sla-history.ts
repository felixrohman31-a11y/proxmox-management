import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';
import type { ClusterSla } from './sla';

/**
 * Histori SLA per periode (bulan kalender).
 *
 * rrddata Proxmox hanya menyimpan ~30 hari terakhir, jadi tren jangka panjang
 * harus disimpan secara lokal. Setiap siklus monitor SLA menuliskan snapshot
 * bulan berjalan (dan sekali menambal bulan sebelumnya yang masih dalam
 * retensi). Angka disimpan permanen sehingga tetap bisa dibaca setelah data
 * mentahnya hilang — memungkinkan grafik kepatuhan antar-bulan + delta MoM.
 */

export interface SlaSnapshotEntity {
  key: string;
  kind: 'guest' | 'node';
  name: string;
  node: string;
  vmid?: number;
  type?: 'qemu' | 'lxc';
  target: number;
  actualPct: number | null;
  status: 'ok' | 'breach' | 'no-data';
}

export interface SlaSnapshot {
  clusterId: string;
  clusterName: string;
  period: string; // "YYYY-MM"
  year: number;
  month: number;
  capturedAt: string;
  final: boolean; // periode sudah lewat saat snapshot diambil
  defaultTarget: number;
  avgPct: number | null;
  compliant: number;
  breach: number;
  tracked: number;
  noData: number;
  totalDowntimeMin: number;
  maintenanceMin: number;
  entities: SlaSnapshotEntity[];
}

interface HistoryFile {
  snapshots: Record<string, SlaSnapshot>; // key `${clusterId}|${period}`
}

const KEEP_PER_CLUSTER = 24; // bulan terakhir yang disimpan

function filePath(): string {
  return path.join(ensureDataDir(), 'sla-history.json');
}

export function periodKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

/** Akhir bulan (awal bulan berikutnya) dalam epoch detik, basis WIB. */
export function periodEndSec(y: number, m: number): number {
  return Math.floor(Date.UTC(y, m, 1, -7) / 1000);
}

/** Periode sudah lewat (final) terhadap nowSec? */
export function isClosedPeriod(y: number, m: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return periodEndSec(y, m) <= nowSec;
}

/** Bulan kalender sebelumnya. */
export function previousPeriod(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

function normalize(v: unknown): HistoryFile {
  const raw = (v ?? {}) as Partial<HistoryFile>;
  const out: HistoryFile = { snapshots: {} };
  if (raw.snapshots && typeof raw.snapshots === 'object') {
    for (const [k, s] of Object.entries(raw.snapshots)) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Partial<SlaSnapshot>;
      if (typeof rec.clusterId !== 'string' || typeof rec.period !== 'string') continue;
      out.snapshots[k] = {
        clusterId: rec.clusterId,
        clusterName: typeof rec.clusterName === 'string' ? rec.clusterName : '',
        period: rec.period,
        year: Number(rec.year) || 0,
        month: Number(rec.month) || 0,
        capturedAt: typeof rec.capturedAt === 'string' ? rec.capturedAt : '',
        final: Boolean(rec.final),
        defaultTarget: Number(rec.defaultTarget) || 0,
        avgPct: typeof rec.avgPct === 'number' ? rec.avgPct : null,
        compliant: Number(rec.compliant) || 0,
        breach: Number(rec.breach) || 0,
        tracked: Number(rec.tracked) || 0,
        noData: Number(rec.noData) || 0,
        totalDowntimeMin: Number(rec.totalDowntimeMin) || 0,
        maintenanceMin: Number(rec.maintenanceMin) || 0,
        entities: Array.isArray(rec.entities) ? (rec.entities as SlaSnapshotEntity[]) : []
      };
    }
  }
  return out;
}

export function readHistory(): HistoryFile {
  const fp = filePath();
  if (!fs.existsSync(fp)) return { snapshots: {} };
  try {
    return normalize(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch {
    return { snapshots: {} };
  }
}

async function writeHistory(h: HistoryFile): Promise<void> {
  const fp = filePath();
  const tmp = `${fp}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(h, null, 2), 'utf8');
  await fsp.rename(tmp, fp);
}

function prune(h: HistoryFile): void {
  // simpan hanya N periode terbaru per cluster
  const byCluster = new Map<string, SlaSnapshot[]>();
  for (const s of Object.values(h.snapshots)) {
    const arr = byCluster.get(s.clusterId) ?? [];
    arr.push(s);
    byCluster.set(s.clusterId, arr);
  }
  const keep = new Set<string>();
  for (const arr of byCluster.values()) {
    arr.sort((a, b) => (a.year - b.year) || (a.month - b.month));
    for (const s of arr.slice(Math.max(0, arr.length - KEEP_PER_CLUSTER))) {
      keep.add(`${s.clusterId}|${s.period}`);
    }
  }
  for (const k of Object.keys(h.snapshots)) {
    if (!keep.has(k)) delete h.snapshots[k];
  }
}

export function buildSnapshot(
  sla: ClusterSla,
  clusterName: string,
  y: number,
  m: number,
  final: boolean
): SlaSnapshot {
  return {
    clusterId: sla.clusterId,
    clusterName,
    period: periodKey(y, m),
    year: y,
    month: m,
    capturedAt: new Date().toISOString(),
    final,
    defaultTarget: sla.defaultTarget,
    avgPct: sla.summary.avgPct,
    compliant: sla.summary.compliant,
    breach: sla.summary.breach,
    tracked: sla.summary.tracked,
    noData: sla.summary.noData,
    totalDowntimeMin: sla.summary.totalDowntimeMin,
    maintenanceMin: sla.summary.maintenanceMin,
    entities: [...sla.nodes, ...sla.guests].map((r) => ({
      key: r.key,
      kind: r.kind,
      name: r.name,
      node: r.node,
      vmid: r.vmid,
      type: r.type,
      target: r.target,
      actualPct: r.actualPct,
      status: r.status
    }))
  };
}

export function hasSnapshot(clusterId: string, period: string): boolean {
  return Boolean(readHistory().snapshots[`${clusterId}|${period}`]);
}

/** Simpan/patch satu snapshot. `tracked === 0` dilewati (hindari mencatat bulan kosong). */
export async function upsertSnapshot(
  snap: SlaSnapshot,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  if (snap.tracked === 0 && !opts.force) return false;
  const h = readHistory();
  h.snapshots[`${snap.clusterId}|${snap.period}`] = snap;
  prune(h);
  await writeHistory(h);
  return true;
}

/** Simpan banyak snapshot sekaligus (satu tulis disk). Return berapa yang ditulis. */
export async function upsertMany(snaps: SlaSnapshot[]): Promise<number> {
  const valid = snaps.filter((s) => s.tracked > 0);
  if (!valid.length) return 0;
  const h = readHistory();
  for (const s of valid) h.snapshots[`${s.clusterId}|${s.period}`] = s;
  prune(h);
  await writeHistory(h);
  return valid.length;
}

export function listHistory(clusterId: string): SlaSnapshot[] {
  return Object.values(readHistory().snapshots)
    .filter((s) => s.clusterId === clusterId)
    .sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

export async function deleteSnapshot(clusterId: string, period: string): Promise<boolean> {
  const h = readHistory();
  const k = `${clusterId}|${period}`;
  if (!h.snapshots[k]) return false;
  delete h.snapshots[k];
  await writeHistory(h);
  return true;
}
