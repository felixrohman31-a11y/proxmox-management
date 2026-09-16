import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ensureDataDir } from './secrets';

/**
 * Jendela pemeliharaan (maintenance / planned downtime).
 *
 * Downtime yang terjadi di dalam jendela yang berlaku untuk sebuah entitas
 * DIKECUALIKAN dari perhitungan SLA — tidak dihitung sebagai downtime maupun
 * sebagai bagian dari total window (numerator & denominator dikurangi). Ini
 * membedakan "turun terjadwal" dari "turun tidak terjadwal".
 *
 * Cakupan (kind):
 *  - "cluster": semua node + guest di cluster tersebut
 *  - "node": satu node fisik
 *  - "guest": satu VM/CT (vmid) pada node tertentu
 */

export type MaintenanceKind = 'cluster' | 'node' | 'guest';

export interface MaintenanceWindow {
  id: string;
  clusterId: string;
  kind: MaintenanceKind;
  node?: string;
  vmid?: number;
  type?: 'qemu' | 'lxc';
  startSec: number; // epoch detik, inklusif
  endSec: number; // epoch detik, eksklusif
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface Interval {
  start: number;
  end: number;
}

interface RowRef {
  kind: 'guest' | 'node';
  node: string;
  vmid?: number;
  type?: 'qemu' | 'lxc';
}

function filePath(): string {
  return path.join(ensureDataDir(), 'maintenance.json');
}

function normalize(v: unknown): MaintenanceWindow[] {
  const arr = Array.isArray(v) ? v : [];
  const out: MaintenanceWindow[] = [];
  for (const raw of arr) {
    const r = raw as Partial<MaintenanceWindow>;
    if (!r || typeof r.clusterId !== 'string') continue;
    const s = Math.floor(Number(r.startSec));
    const e = Math.floor(Number(r.endSec));
    if (!isFinite(s) || !isFinite(e) || e <= s) continue;
    const kind: MaintenanceKind = r.kind === 'node' || r.kind === 'guest' ? r.kind : 'cluster';
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
      clusterId: r.clusterId,
      kind,
      node: typeof r.node === 'string' && r.node ? r.node : undefined,
      vmid: typeof r.vmid === 'number' && isFinite(r.vmid) ? r.vmid : undefined,
      type: r.type === 'qemu' || r.type === 'lxc' ? r.type : undefined,
      startSec: s,
      endSec: e,
      reason: typeof r.reason === 'string' ? r.reason : '',
      createdBy: typeof r.createdBy === 'string' ? r.createdBy : '',
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString()
    });
  }
  // terbaru dulu untuk tampilan daftar
  out.sort((a, b) => b.startSec - a.startSec);
  return out;
}

function readSync(): MaintenanceWindow[] {
  const fp = filePath();
  if (!fs.existsSync(fp)) return [];
  try {
    return normalize(JSON.parse(fs.readFileSync(fp, 'utf8')));
  } catch {
    return [];
  }
}

async function writeAll(list: MaintenanceWindow[]): Promise<void> {
  const fp = filePath();
  const tmp = `${fp}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsp.rename(tmp, fp);
}

export function listMaintenanceSync(clusterId?: string): MaintenanceWindow[] {
  const all = readSync();
  return clusterId ? all.filter((m) => m.clusterId === clusterId) : all;
}

export async function addMaintenance(
  input: Omit<MaintenanceWindow, 'id' | 'createdAt'>
): Promise<MaintenanceWindow> {
  const s = Math.floor(Number(input.startSec));
  const e = Math.floor(Number(input.endSec));
  if (!input.clusterId) throw new Error('Cluster wajib dipilih.');
  if (!isFinite(s) || !isFinite(e) || e <= s) {
    throw new Error('Rentang waktu tidak valid — akhir harus setelah awal.');
  }
  const rec: MaintenanceWindow = {
    ...input,
    startSec: s,
    endSec: e,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  const list = readSync();
  list.push(rec);
  await writeAll(list);
  return rec;
}

export async function deleteMaintenance(id: string): Promise<boolean> {
  const list = readSync();
  const next = list.filter((m) => m.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}

// Apakah sebuah jendela berlaku untuk entitas tertentu?
function appliesTo(m: MaintenanceWindow, row: RowRef): boolean {
  if (m.kind === 'cluster') return true;
  if (m.node !== row.node) return false;
  if (m.kind === 'node') return row.kind === 'node';
  return row.kind === 'guest' && m.vmid === row.vmid && (m.type ? m.type === row.type : true);
}

/**
 * Interval (sudah di-merge) dari jendela maintenance yang berlaku untuk `row`
 * dan beririsan dengan rentang [from, to). Pure — agar SLA bisa memuat daftar
 * jendela sekali lalu menghitung per baris.
 */
export function resolveIntervals(
  windows: MaintenanceWindow[],
  row: RowRef,
  from: number,
  to: number
): Interval[] {
  const clipped: Interval[] = [];
  for (const m of windows) {
    if (!appliesTo(m, row)) continue;
    const s = Math.max(m.startSec, from);
    const e = Math.min(m.endSec, to);
    if (e > s) clipped.push({ start: s, end: e });
  }
  clipped.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of clipped) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}
