import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';
import { getPveClient, PveError } from './pve';
import { fetchResources } from './resources';
import { listMaintenanceSync, resolveIntervals, type Interval, type MaintenanceWindow } from './maintenance';
import { mapLimit } from './concurrency';
import { cacheGet, cacheSet, cacheClear } from './disk-cache';
import type { PublicCluster } from '@/types';

/**
 * SLA (Service Level Agreement) module.
 *
 * Konsep:
 * - Setiap guest (VM/CT) dan node fisik bisa punya target ketersediaan (default 99.9%).
 * - Aktual dihitung dari rrddata Proxmox (timeframe=month). Proxmox selalu
 *   mengembalikan grid baris untuk seluruh window, tapi baris TANPA metrik
 *   berarti entitas tidak hidup pada titik itu → dihitung downtime.
 * - Window: [max(awal bulan, sampel aktif pertama), min(akhir bulan, sekarang)].
 *   Guest/node yang saat ini tidak aktif dihitung hanya sampai sampel aktif
 *   terakhir (pemadaman setelahnya diasumsikan pematian yang disengaja).
 * - Catatan: rrddata timeframe "month" hanya menyimpan ~30 hari terakhir,
 *   jadi bulan-bulan lampau yang di luar jangkauan akan berstatus "no-data".
 */

export interface SlaEpisode {
  start: number; // epoch detik (awal jendela down)
  end: number; // epoch detik (akhir jendela down)
}

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
  coveragePct: number | null; // % jendela waktu yang punya sampel (akurasi data)
  budgetRemainingMin: number | null; // untuk periode berjalan: sisa menit downtime sebelum target meleset (null bila negatif→lihat atRisk)
  atRisk: boolean; // periode berjalan & downtime sudah melewati anggaran full-period
  episodes: SlaEpisode[]; // jendela downtime terukur (waktu WIB ditentukan di UI)
  maintenanceMin: number | null; // menit downtime di dalam jendela maintenance (dikecualikan dari SLA)
  status: 'ok' | 'breach' | 'no-data';
}

export interface SlaSummary {
  tracked: number;
  noData: number;
  compliant: number;
  breach: number;
  atRisk: number;
  avgPct: number | null;
  totalDowntimeMin: number;
  maintenanceMin: number; // total menit dikecualikan karena maintenance
}

export interface ClusterSla {
  clusterId: string;
  year: number;
  month: number;
  rangeStart?: number; // epoch detik (akhir jika tidak diisi = periode bulanan)
  rangeEnd?: number;
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
  clearSlaCache(); // target default berubah → status ok/breach bisa berubah
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
  clearSlaCache(); // target per entitas berubah → invalidate cache
  return cfg;
}

function targetFor(cfg: SlaConfig, clusterId: string, key: string): number {
  return cfg.targets[`${clusterId}|${key}`] ?? cfg.defaultTarget;
}

// ---------- availability math (pure, unit-testable) ----------

export interface SlaSample {
  t: number; // epoch detik
  active: boolean; // true bila baris rrddata mengandung metrik (entitas hidup)
}

export interface AvailabilityResult {
  actualPct: number;
  downtimeSec: number;
  windowSec: number;
  coveragePct: number;
  maintenanceSec: number;
  episodes: SlaEpisode[];
}

function inInterval(t: number, ivs: Interval[]): boolean {
  for (const iv of ivs) {
    if (t >= iv.start && t < iv.end) return true;
  }
  return false;
}

/**
 * Hitung ketersediaan dari sampel rrddata.
 * - Baris rrddata Proxmox hadir untuk seluruh grid waktu, tapi TANPA metrik
 *   saat entitas tidak hidup — jadi "aktif" = baris punya metrik.
 * - `monthStart`/`monthEnd`: batas periode (epoch detik, eksklusif di end).
 * - `nowSec`: epoch sekarang (membatasi bulan berjalan).
 * - `activeNow`: entitas sedang hidup → window sampai sekarang; bila tidak,
 *   window berhenti di sampel aktif terakhir (ekor tidak dihukum).
 * Return null bila tidak ada sampel aktif (tidak bisa dihitung).
 */
export function computeAvailability(
  samples: SlaSample[],
  monthStart: number,
  monthEnd: number,
  nowSec: number,
  activeNow: boolean,
  excludes: Interval[] = []
): AvailabilityResult | null {
  const rows = (samples ?? [])
    .map((r) => ({ t: Number(r?.t), active: Boolean(r?.active) }))
    .filter((r) => isFinite(r.t) && r.t > 0)
    .sort((a, b) => a.t - b.t);

  const activeTimes = rows.filter((r) => r.active).map((r) => r.t);
  if (!activeTimes.length) return null;

  const diffs: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i].t - rows[i - 1].t;
    if (d > 0) diffs.push(d);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  const dt = diffs[Math.floor(diffs.length / 2)] || 300;

  const firstActive = activeTimes[0];
  const lastActive = activeTimes[activeTimes.length - 1];
  const endCap = Math.min(monthEnd, nowSec);
  const ws = Math.max(monthStart, firstActive);
  const we = activeNow ? endCap : Math.min(endCap, lastActive + dt);
  if (we <= ws) return null;

  const MAX_SLOTS = 20000;
  const MAX_EPISODES = 250;
  let scanned = 0;
  let total = 0;
  let up = 0;
  let covered = 0;
  let maintSlots = 0;
  let idx = 0;
  const episodes: SlaEpisode[] = [];
  let openEp: SlaEpisode | null = null;
  for (let t = ws; t < we && scanned < MAX_SLOTS; t += dt) {
    scanned++;
    // Slot dalam jendela pemeliharaan: tidak dihitung sama sekali (bukan up,
    // bukan down, bukan denominator) dan memutus episode yang sedang terbuka.
    if (inInterval(t, excludes)) {
      if (openEp) {
        if (episodes.length < MAX_EPISODES) episodes.push(openEp);
        openEp = null;
      }
      maintSlots++;
      continue;
    }
    total++;
    while (idx < rows.length && rows[idx].t < t - dt / 2) idx++;
    let hit = false;
    let exists = false;
    for (let j = idx; j < rows.length && rows[j].t <= t + dt / 2; j++) {
      exists = true;
      if (rows[j].active) {
        hit = true;
        break;
      }
    }
    if (exists) covered++;
    if (hit) up++;
    // Lacak run "down" menjadi satu episode berdurasi.
    if (!hit) {
      if (!openEp) openEp = { start: t, end: t + dt };
      else openEp.end = t + dt;
    } else if (openEp) {
      if (episodes.length < MAX_EPISODES) episodes.push(openEp);
      openEp = null;
    }
  }
  if (openEp) {
    openEp.end = we; // masih down hingga akhir window terukur
    if (episodes.length < MAX_EPISODES) episodes.push(openEp);
  }
  if (!total) return null;

  const actualPct = Math.min(100, (up / total) * 100);
  return {
    actualPct: Math.round(actualPct * 1000) / 1000,
    downtimeSec: (total - up) * dt,
    windowSec: total * dt,
    coveragePct: Math.round((covered / total) * 1000) / 10,
    maintenanceSec: maintSlots * dt,
    episodes
  };
}

function summarize(rows: SlaRow[]): SlaSummary {
  const withData = rows.filter((r) => r.status !== 'no-data' && r.actualPct !== null);
  const out: SlaSummary = {
    tracked: withData.length,
    noData: rows.length - withData.length,
    compliant: withData.filter((r) => r.status === 'ok').length,
    breach: withData.filter((r) => r.status === 'breach').length,
    atRisk: withData.filter((r) => r.atRisk).length,
    avgPct: null,
    totalDowntimeMin: 0,
    maintenanceMin: Math.round(rows.reduce((s, r) => s + (r.maintenanceMin ?? 0), 0))
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

// L1 (memori) cepat untuk periode berjalan; L2 (disk) tahan-restart untuk
// periode historis yang datanya tak berubah lagi.
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 120_000; // periode berjalan: 2 menit
const CLOSED_TTL_MS = 12 * 3600_000; // periode tertutup: 12 jam (juga di disk)
const RRD_CONCURRENCY = 5; // batas /rrddata paralel per cluster

// Kapabilitas rrddata per cluster: beberapa server PVE lama (mis. 4.x) menolak
// parameter `start`/`end` pada /rrddata (hanya menerima `timeframe`). Kami coba
// range eksplisit lebih dulu, lalu fallback ke timeframe dan cache hasilnya.
const rrdModeCache = new Map<string, 'range' | 'timeframe'>();

function timeframeFor(startEpoch: number, endEpoch: number): string {
  const d = Math.max(0, endEpoch - startEpoch);
  if (d <= 3600) return 'hour';
  if (d <= 2 * 86400) return 'day';
  if (d <= 8 * 86400) return 'week';
  if (d <= 40 * 86400) return 'month';
  return 'year';
}

export async function getRrdData(
  clusterId: string,
  client: import('./pve').PveClient,
  path: string,
  startEpoch: number,
  endEpoch: number
): Promise<Array<Record<string, unknown>> | null> {
  const known = rrdModeCache.get(clusterId);
  if (known === 'timeframe') {
    return client
      .get<Array<Record<string, unknown>>>(path, { timeframe: timeframeFor(startEpoch, endEpoch), cf: 'AVERAGE' })
      .catch(() => null);
  }
  try {
    const data = await client.get<Array<Record<string, unknown>>>(path, { start: startEpoch, end: endEpoch, cf: 'AVERAGE' });
    if (!known) rrdModeCache.set(clusterId, 'range');
    return data;
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (/schema|not defined|not optional/i.test(msg)) {
      rrdModeCache.set(clusterId, 'timeframe');
      return client
        .get<Array<Record<string, unknown>>>(path, { timeframe: timeframeFor(startEpoch, endEpoch), cf: 'AVERAGE' })
        .catch(() => null);
    }
    return null;
  }
}

function makeRow(
  cfg: SlaConfig,
  clusterId: string,
  base: Omit<
    SlaRow,
    | 'target'
    | 'actualPct'
    | 'downtimeMin'
    | 'windowHours'
    | 'status'
    | 'coveragePct'
    | 'budgetRemainingMin'
    | 'atRisk'
    | 'episodes'
    | 'maintenanceMin'
  >,
  samples: SlaSample[] | null,
  monthStart: number,
  monthEnd: number,
  nowSec: number,
  activeNow: boolean,
  mWindows: MaintenanceWindow[]
): SlaRow {
  const target = targetFor(cfg, clusterId, base.key);
  const excludes = resolveIntervals(
    mWindows,
    { kind: base.kind, node: base.node, vmid: base.vmid, type: base.type },
    monthStart,
    monthEnd
  );
  const maintMin = Math.round((excludes.reduce((a, iv) => a + (iv.end - iv.start), 0) / 60) * 10) / 10;
  const maintenanceMin = maintMin > 0 ? maintMin : null;
  const avail = samples
    ? computeAvailability(samples, monthStart, monthEnd, nowSec, activeNow, excludes)
    : null;
  if (!avail) {
    return {
      ...base,
      target,
      actualPct: null,
      downtimeMin: null,
      windowHours: null,
      coveragePct: null,
      budgetRemainingMin: null,
      atRisk: false,
      episodes: [],
      maintenanceMin,
      status: 'no-data'
    };
  }
  // Untuk periode berjalan (selesai di masa depan), hitung anggaran downtime
  // target pada full-periode (dikurangi jendela maintenance) dan sisa yang
  // masih boleh dipakai.
  const open = monthEnd > nowSec;
  let budgetRemainingMin: number | null = null;
  let atRisk = false;
  if (open) {
    const fullMin = (monthEnd - monthStart) / 60 - maintMin;
    const allowedMin = fullMin * (1 - target / 100);
    const usedMin = avail.downtimeSec / 60;
    budgetRemainingMin = Math.round((allowedMin - usedMin) * 10) / 10;
    atRisk = usedMin > allowedMin;
  }
  return {
    ...base,
    target,
    actualPct: avail.actualPct,
    downtimeMin: Math.round((avail.downtimeSec / 60) * 10) / 10,
    windowHours: Math.round((avail.windowSec / 3600) * 10) / 10,
    coveragePct: avail.coveragePct,
    budgetRemainingMin,
    atRisk,
    episodes: avail.episodes,
    maintenanceMin,
    status: avail.actualPct >= target ? 'ok' : 'breach'
  };
}

export async function slaForRange(
  cluster: PublicCluster,
  startEpoch: number,
  endEpoch: number
): Promise<ClusterSla> {
  const nowSec = Math.floor(Date.now() / 1000);
  const closed = endEpoch <= nowSec; // periode sudah lewat → hasil tidak berubah lagi
  const cacheKey = `sla:${cluster.id}:${startEpoch}-${endEpoch}`;

  // L1: memori (semua periode). L2: disk (hanya periode tertutup).
  const l1 = cache.get(cacheKey);
  if (l1 && nowSec * 1000 - l1.at < (closed ? CLOSED_TTL_MS : CACHE_TTL_MS)) return l1.data;
  if (closed) {
    const fromDisk = cacheGet<ClusterSla>(cacheKey);
    if (fromDisk) {
      cache.set(cacheKey, { at: nowSec * 1000, data: fromDisk });
      return fromDisk;
    }
  }

  const client = getPveClient(cluster.id);
  if (!client) throw new PveError('Cluster tidak ditemukan.', 404);

  const cfg = readConfigSync();
  const monthStart = startEpoch;
  const monthEnd = endEpoch;

  // fetchResources sudah mengakomodasi PVE ≤4.x (mis. pve3 / Proxmox 4.4) lewat
  // fallback /status, sehingga status node/guest tetap akurat untuk SLA.
  const { nodes: nodesRaw, guests: guestsRawAll } = await fetchResources(cluster.id);
  const guestsRaw = guestsRawAll.filter((g) => !g.template);
  const mWindows = listMaintenanceSync(cluster.id);

  const toSamples = (
    arr: Array<Record<string, unknown>> | null | undefined
  ): SlaSample[] | null => {
    if (!arr || !arr.length) return null;
    const out = arr
      .map((e) => ({
        t: Number(e.time),
        active:
          (typeof e.cpu === 'number' && isFinite(e.cpu)) ||
          (typeof e.memused === 'number' && isFinite(e.memused))
      }))
      .filter((r) => isFinite(r.t) && r.t > 0);
    return out.length ? out : null;
  };

  const nodeSeries = await mapLimit(nodesRaw, RRD_CONCURRENCY, (n) =>
    getRrdData(
      cluster.id,
      client,
      `/nodes/${encodeURIComponent(String(n.node))}/rrddata`,
      startEpoch,
      endEpoch
    ).then(toSamples)
  );

  const guestSeries = await mapLimit(guestsRaw, RRD_CONCURRENCY, (g) =>
    getRrdData(
      cluster.id,
      client,
      `/nodes/${encodeURIComponent(String(g.node))}/${String(g.type)}/${Number(g.vmid)}/rrddata`,
      startEpoch,
      endEpoch
    ).then(toSamples)
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
      nowSec,
      statusNow === 'online',
      mWindows
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
      nowSec,
      statusNow === 'running',
      mWindows
    );
  });

  guestRows.sort((a, b) => (a.vmid ?? 0) - (b.vmid ?? 0));
  nodeRows.sort((a, b) => a.name.localeCompare(b.name));

  const customTargets: Record<string, number> = {};
  for (const [k, v] of Object.entries(cfg.targets)) {
    if (k.startsWith(`${cluster.id}|`)) customTargets[k.slice(cluster.id.length + 1)] = v;
  }

  const d0 = new Date(startEpoch * 1000);
  const all = [...nodeRows, ...guestRows];
  const data: ClusterSla = {
    clusterId: cluster.id,
    year: d0.getUTCFullYear(),
    month: d0.getUTCMonth() + 1,
    rangeStart: startEpoch,
    rangeEnd: endEpoch,
    defaultTarget: cfg.defaultTarget,
    customTargets,
    summary: summarize(all),
    nodes: nodeRows,
    guests: guestRows
  };

  cache.set(cacheKey, { at: nowSec * 1000, data });
  if (closed) cacheSet(cacheKey, data, CLOSED_TTL_MS);
  return data;
}

export async function slaForCluster(
  cluster: PublicCluster,
  year: number,
  month: number
): Promise<ClusterSla> {
  const start = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
  const end = Math.floor(Date.UTC(year, month, 1) / 1000);
  return slaForRange(cluster, start, end);
}

export function clearSlaCache(): void {
  cache.clear();
  cacheClear();
}
