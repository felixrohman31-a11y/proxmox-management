import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';
import { getPveClient, PveError } from './pve';
import type { PublicCluster } from '@/types';

/**
 * SLA (Service Level Agreement) module.
 *
 * Konsep:
 * - Setiap guest (VM/CT) dan node fisik bisa punya target ketersediaan (default 99.9%).
 * - Aktual dihitung dari rrddata Proxmox (timeframe=month): gap antar sampel
 *   di dalam window dianggap downtime (guest/node tidak melapor).
 * - Window: [max(awal bulan, sampel pertama - dt), min(akhir bulan, sekarang)].
 *   Guest/node yang saat ini tidak aktif dihitung hanya sampai sampel terakhirnya
 *   (pemadaman setelahnya diasumsikan pematian yang disengaja).
 * - Catatan: rrddata timeframe "month" hanya menyimpan ~30 hari terakhir,
 *   jadi bulan-bulan lampau yang di luar jangkauan akan berstatus "no-data".
 */

export interface SlaRow {
  key: string; // "qemu/100@pve1" | "lxc/105@pve2" | "node/pve1"
  kind: 'guest' | 'node';
  name: string;
  node: string;
  vmid?: number;
  type?: 'qemu' | 'lxc';
  statusNow: string;
  target: number; // %, 3 desimal
  actualPct: number | null;
  downtimeMin: number | null;
  windowHours: number | null;
  status: 'ok' | 'breach' | 'no-data';
  note?: string;
}

export interface SlaSummary {
  tracked: number;
  noData: number;
  compliant: number;
  breach: number;
  avgPct: number | null;
  totalDowntimeMin: number;
}

export interface ClusterSla {
  clusterId: string;
  year: number;
  month: number;
  defaultTarget: number;
  customTargets: Record<string, number>;
  summary: SlaSummary;
  nodes: SlaRow[];
  guests: SlaRow[];
}

export interface SlaConfig {
  defaultTarget: number;
  targets: Record<string, number>; // `${clusterId}|${key}` -> target
}

export const SLA_MIN = 50;
export const SLA_MAX = 100;
export const SLA_DEFAULT = 99.9;

// ---------- config store (data/sla.json) ----------

function filePath(): string {
  return path.join(ensureDataDir(), 'sla.json');
}

export function clampTarget(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!isFinite(n)) return null;
  const r = Math.round(n * 1000) / 1000;
  if (r < SLA_MIN || r > SLA_MAX) return null;
  return r;
}

function normalize(v: unknown): SlaConfig {
  const raw = (v ?? {}) as Partial<SlaConfig>;
  const cfg: SlaConfig = { defaultTarget: SLA_DEFAULT, targets: {} };
  const dt = clampTarget(raw.defaultTarget);
  if (dt !== null) cfg.defaultTarget = dt;
  if (raw.targets && typeof raw.targets === 'object') {
    for (const [k, val] of Object.entries(raw.targets)) {
      if (!k) continue;
      const t = clampTarget(val);
      if (t !== null) cfg.targets[k] = t;
    }
  }
  return cfg;
}

function readConfigSync(): SlaConfig {
  const fp = filePath();
  if (!fs.existsSync(fp)) return { defaultTarget: SLA_DEFAULT, targets: {} };
  try {
    return normalize(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch {
    return { defaultTarget: SLA_DEFAULT, targets: {} };
  }
}

async function writeConfig(cfg: SlaConfig): Promise<void> {
  const fp = filePath();
  const tmp = `${fp}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(cfg, null, 2), 'utf8');
  await fsp.rename(tmp, fp);
}

export function getSlaConfigSync(): SlaConfig {
  return readConfigSync();
}

export async function setSlaDefaultTarget(target: number): Promise<SlaConfig> {
  const t = clampTarget(target);
  if (t === null) throw new Error(`Target SLA harus angka antara ${SLA_MIN} dan ${SLA_MAX}.`);
  const cfg = readConfigSync();
  cfg.defaultTarget = t;
  await writeConfig(cfg);
  return cfg;
}

export async function setSlaTarget(
  clusterId: string,
  key: string,
  target: number | null
): Promise<SlaConfig> {
  if (!clusterId || !key) throw new Error('Parameter clusterId/key tidak lengkap.');
  const cfg = readConfigSync();
  const fullKey = `${clusterId}|${key}`;
  if (target === null) {
    delete cfg.targets[fullKey];
  } else {
    const t = clampTarget(target);
    if (t === null) throw new Error(`Target SLA harus angka antara ${SLA_MIN} dan ${SLA_MAX}.`);
    cfg.targets[fullKey] = t;
  }
  await writeConfig(cfg);
  return cfg;
}

function targetFor(cfg: SlaConfig, clusterId: string, key: string): number {
  return cfg.targets[`${clusterId}|${key}`] ?? cfg.defaultTarget;
}

// ---------- availability math (pure, unit-testable) ----------

export interface RrdRow {
  t: number;
}

export interface AvailabilityResult {
  actualPct: number;
  downtimeSec: number;
  windowSec: number;
}

/**
 * Hitung ketersediaan dari daftar timestamp sampel rrddata.
 * - `monthStart`/`monthEnd`: batas periode (epoch detik, eksklusif di end).
 * - `nowSec`: epoch sekarang (untuk membatasi bulan berjalan).
 * - Window: [max(monthStart, sampel pertama), min(monthEnd, nowSec, sampel terakhir + dt)].
 *   Gap antar sampel di dalam window = downtime; interval sebelum sampel pertama
 *   dan setelah sampel terakhir tidak dihukum (charitable).
 * Return null bila data tidak cukup untuk dihitung.
 */
export function computeAvailability(
  rows: RrdRow[],
  monthStart: number,
  monthEnd: number,
  nowSec: number
): AvailabilityResult | null {
  const times = (rows ?? [])
    .map((r) => r.t)
    .filter((t) => typeof t === 'number' && isFinite(t) && t > 0)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;

  const diffs: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const dt = diffs[Math.floor(diffs.length / 2)] || 300;

  const first = times[0];
  const last = times[times.length - 1];
  const ws = Math.max(monthStart, first);
  const we = Math.min(monthEnd, nowSec, last + dt);
  if (we <= ws) return null;

  const MAX_SLOTS = 20000;
  let total = 0;
  let up = 0;
  let idx = 0;
  for (let t = ws; t < we && total < MAX_SLOTS; t += dt) {
    total++;
    while (idx < times.length && times[idx] < t - dt / 2) idx++;
    if (idx < times.length && Math.abs(times[idx] - t) <= dt / 2) up++;
  }
  if (!total) return null;

  const actualPct = Math.min(100, (up / total) * 100);
  return {
    actualPct: Math.round(actualPct * 1000) / 1000,
    downtimeSec: (total - up) * dt,
    windowSec: total * dt
  };
}

function summarize(rows: SlaRow[]): SlaSummary {
  const withData = rows.filter((r) => r.status !== 'no-data' && r.actualPct !== null);
  const out: SlaSummary = {
    tracked: withData.length,
    noData: rows.length - withData.length,
    compliant: withData.filter((r) => r.status === 'ok').length,
    breach: withData.filter((r) => r.status === 'breach').length,
    avgPct: null,
    totalDowntimeMin: 0
  };
  if (withData.length) {
    const sum = withData.reduce((s, r) => s + (r.actualPct ?? 0), 0);
    out.avgPct = Math.round((sum / withData.length) * 100) / 100;
    out.totalDowntimeMin = Math.round(withData.reduce((s, r) => s + (r.downtimeMin ?? 0), 0));
  }
  return out;
}

export function fmtDowntime(min: number | null, en: boolean): string {
  if (min === null || !isFinite(min)) return '-';
  if (min < 1) return en ? '< 1 min' : '< 1 menit';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return en ? `${m} min` : `${m} menit`;
  return en ? `${h} h ${m} min` : `${h} jam ${m} menit`;
}

// ---------- per-cluster computation (cached) ----------

interface ResourceRow {
  type?: string;
  node?: string;
  name?: string;
  vmid?: number;
  status?: string;
  template?: number | boolean;
}

interface CacheEntry {
  at: number;
  data: ClusterSla;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 120_000;

type PveClient = ReturnType<typeof getPveClient>;

function makeRow(
  cfg: SlaConfig,
  clusterId: string,
  base: Omit<SlaRow, 'target' | 'actualPct' | 'downtimeMin' | 'windowHours' | 'status'>,
  rows: RrdRow[] | null,
  monthStart: number,
  monthEnd: number,
  nowSec: number
): SlaRow {
  const target = targetFor(cfg, clusterId, base.key);
  const avail = rows ? computeAvailability(rows, monthStart, monthEnd, nowSec) : null;
  if (!avail) {
    return {
      ...base,
      target,
      actualPct: null,
      downtimeMin: null,
      windowHours: null,
      status: 'no-data'
    };
  }
  return {
    ...base,
    target,
    actualPct: avail.actualPct,
    downtimeMin: Math.round((avail.downtimeSec / 60) * 10) / 10,
    windowHours: Math.round((avail.windowSec / 3600) * 10) / 10,
    status: avail.actualPct >= target ? 'ok' : 'breach'
  };
}

export async function slaForCluster(
  cluster: PublicCluster,
  year: number,
  month: number
): Promise<ClusterSla> {
  const cacheKey = `${cluster.id}:${year}-${month}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const client = getPveClient(cluster.id);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);

  const cfg = readConfigSync();
  const monthStart = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const monthEnd = Math.floor(Date.UTC(year, month, 1) / 1000);
  const nowSec = Math.floor(Date.now() / 1000);

  const res = await client.get<ResourceRow[]>('/cluster/resources');
  const nodesRaw = (res ?? []).filter((r) => r.type === 'node');
  const guestsRaw = (res ?? []).filter(
    (r) => (r.type === 'qemu' || r.type === 'lxc') && !r.template
  );

  const query = { timeframe: 'month', cf: 'AVERAGE' } as const;

  const nodeSeries = await Promise.all(
    nodesRaw.map((n) =>
      client
        .get<RrdRow[]>(`/nodes/${encodeURIComponent(String(n.node))}/rrddata`, query)
        .catch(() => null)
    )
  );

  const guestSeries = await Promise.all(
    guestsRaw.map((g) =>
      client
        .get<RrdRow[]>(
          `/nodes/${encodeURIComponent(String(g.node))}/${String(g.type)}/${Number(g.vmid)}/rrddata`,
          query
        )
        .catch(() => null)
    )
  );

  const nodeRows: SlaRow[] = nodesRaw.map((n, i) => {
    const name = String(n.node ?? '-');
    const statusNow = String(n.status ?? 'unknown');
    return makeRow(
      cfg,
      cluster.id,
      {
        key: `node/${name}`,
        kind: 'node',
        name,
        node: name,
        statusNow
      },
      nodeSeries[i],
      monthStart,
      monthEnd,
      nowSec
    );
  });

  const guestRows: SlaRow[] = guestsRaw.map((g, i) => {
    const vmid = Number(g.vmid ?? 0);
    const node = String(g.node ?? '-');
    const type = g.type === 'lxc' ? 'lxc' : 'qemu';
    const statusNow = String(g.status ?? 'unknown');
    return makeRow(
      cfg,
      cluster.id,
      {
        key: `${type}/${vmid}@${node}`,
        kind: 'guest',
        name: String(g.name ?? `VM ${vmid}`),
        node,
        vmid,
        type,
        statusNow
      },
      guestSeries[i],
      monthStart,
      monthEnd,
      nowSec
    );
  });

  guestRows.sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0));
  nodeRows.sort((a, b) => a.name.localeCompare(b.name));

  const customTargets: Record<string, number> = {};
  for (const [k, v] of Object.entries(cfg.targets)) {
    if (k.startsWith(`${cluster.id}|`)) customTargets[k.slice(cluster.id.length + 1)] = v;
  }

  const all = [...nodeRows, ...guestRows];
  const data: ClusterSla = {
    clusterId: cluster.id,
    year,
    month,
    defaultTarget: cfg.defaultTarget,
    customTargets,
    summary: summarize(all),
    nodes: nodeRows,
    guests: guestRows
  };

  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

export function clearSlaCache(): void {
  cache.clear();
}
