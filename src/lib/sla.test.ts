import { describe, expect, it } from 'vitest';
import { clampTarget, computeAvailability, type SlaSample } from './sla';

const monthStart = Math.floor(Date.UTC(2026, 7, 1) / 1000); // 1 Agu 2026
const monthEnd = Math.floor(Date.UTC(2026, 8, 1) / 1000); // 1 Sep 2026
const DT = 300;

function series(from: number, to: number, skip?: (t: number) => boolean): SlaSample[] {
  const out: SlaSample[] = [];
  for (let t = from; t < to; t += DT) {
    if (skip && skip(t)) continue;
    out.push({ t, active: true });
  }
  return out;
}

describe('computeAvailability', () => {
  it('sampel penuh tanpa gap → 100%', () => {
    const end = monthStart + 3600;
    const rows = series(monthStart, end);
    const r = computeAvailability(rows, monthStart, monthEnd, end, true);
    expect(r).not.toBeNull();
    expect(r!.actualPct).toBe(100);
    expect(r!.downtimeSec).toBe(0);
  });

  it('gap di tengah window dihitung sebagai downtime', () => {
    const end = monthStart + 3600;
    // down ~15 menit di tengah jam (3 sampel hilang)
    const rows = series(monthStart, end, (t) => t >= monthStart + 900 && t < monthStart + 1800);
    const r = computeAvailability(rows, monthStart, monthEnd, end, true)!;
    expect(r.actualPct).toBeGreaterThan(70);
    expect(r.actualPct).toBeLessThan(100);
    expect(r.downtimeSec).toBeGreaterThan(0);
  });

  it('baris tanpa metrik (grid penuh) dihitung downtime', () => {
    const end = monthStart + 3600;
    const rows: SlaSample[] = [];
    for (let t = monthStart; t < end; t += DT) {
      rows.push({ t, active: !(t >= monthStart + 900 && t < monthStart + 1800) });
    }
    const r = computeAvailability(rows, monthStart, monthEnd, end, true)!;
    expect(r.actualPct).toBeGreaterThan(70);
    expect(r.actualPct).toBeLessThan(100);
  });

  it('tanpa sampel → null', () => {
    expect(computeAvailability([], monthStart, monthEnd, monthStart + 3600, true)).toBeNull();
  });

  it('semua sampel tidak aktif → null', () => {
    const rows = series(monthStart, monthStart + 3600).map((r) => ({ ...r, active: false }));
    expect(computeAvailability(rows, monthStart, monthEnd, monthStart + 3600, false)).toBeNull();
  });

  it('satu sampel aktif → null (tidak cukup data)', () => {
    expect(
      computeAvailability([{ t: monthStart, active: true }], monthStart, monthEnd, monthStart + 3600, true)
    ).toBeNull();
  });

  it('window tidak mundur ke sebelum awal bulan', () => {
    const rows = series(monthStart - 86400, monthStart + 86400);
    const r = computeAvailability(rows, monthStart, monthEnd, monthEnd, false)!;
    // window: [monthStart, sampel aktif terakhir + dt] → sekitar 1 hari
    expect(r.windowSec).toBeLessThanOrEqual(86400 + 2 * DT);
    expect(r.windowSec).toBeGreaterThanOrEqual(86400);
  });

  it('entitas mati: window berhenti di sampel aktif terakhir (ekor grid tidak dihukum)', () => {
    const stopAt = monthStart + 7200;
    const rows: SlaSample[] = [];
    for (let t = monthStart; t < monthStart + 28800; t += DT) {
      rows.push({ t, active: t < stopAt });
    }
    const r = computeAvailability(rows, monthStart, monthEnd, monthEnd, false)!;
    expect(r.actualPct).toBe(100);
    expect(r.windowSec).toBeLessThanOrEqual(7200 + 2 * DT);
  });

  it('satu gap → satu episode dengan rentang waktu', () => {
    const end = monthStart + 3600;
    const rows: SlaSample[] = [];
    for (let t = monthStart; t < end; t += DT) {
      rows.push({ t, active: !(t >= monthStart + 900 && t < monthStart + 1800) });
    }
    const r = computeAvailability(rows, monthStart, monthEnd, end, true)!;
    expect(r.episodes).toHaveLength(1);
    expect(r.episodes[0].start).toBe(monthStart + 900);
    expect(r.episodes[0].end).toBe(monthStart + 1800);
  });

  it('dua gap terpisah → dua episode berurut', () => {
    const end = monthStart + 3600;
    const downA = (t: number) => t >= monthStart + 300 && t < monthStart + 600;
    const downB = (t: number) => t >= monthStart + 1500 && t < monthStart + 1800;
    const rows: SlaSample[] = [];
    for (let t = monthStart; t < end; t += DT) rows.push({ t, active: !(downA(t) || downB(t)) });
    const r = computeAvailability(rows, monthStart, monthEnd, end, true)!;
    expect(r.episodes).toHaveLength(2);
    expect(r.episodes[0].start).toBe(monthStart + 300);
    expect(r.episodes[1].start).toBe(monthStart + 1500);
  });

  it('downtime di dalam jendela maintenance dikecualikan dari SLA', () => {
    const end = monthStart + 3600;
    const rows: SlaSample[] = [];
    for (let t = monthStart; t < end; t += DT) {
      rows.push({ t, active: !(t >= monthStart + 900 && t < monthStart + 1800) });
    }
    const noMaint = computeAvailability(rows, monthStart, monthEnd, end, true)!;
    const excludes = [{ start: monthStart + 900, end: monthStart + 1800 }];
    const withMaint = computeAvailability(rows, monthStart, monthEnd, end, true, excludes)!;
    expect(noMaint.downtimeSec).toBeGreaterThan(0);
    expect(withMaint.actualPct).toBe(100);
    expect(withMaint.downtimeSec).toBe(0);
    expect(withMaint.episodes).toHaveLength(0);
    expect(withMaint.maintenanceSec).toBe(900); // 3 slot × 300 s
  });

  it('bulan di masa depan → null', () => {
    const rows = series(monthStart, monthStart + 86400);
    expect(computeAvailability(rows, monthEnd, monthEnd + 86400, monthEnd, true)).toBeNull();
  });
});

describe('clampTarget', () => {
  it('menerima nilai valid dan membulatkan ke 3 desimal', () => {
    expect(clampTarget(99.9)).toBe(99.9);
    expect(clampTarget(99.99999)).toBe(100);
    expect(clampTarget('95.5')).toBe(95.5);
  });

  it('menolak nilai di luar rentang / tidak valid', () => {
    expect(clampTarget(101)).toBeNull();
    expect(clampTarget(10)).toBeNull();
    expect(clampTarget('abc')).toBeNull();
    expect(clampTarget(undefined)).toBeNull();
  });
});
