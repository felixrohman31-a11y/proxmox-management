import { describe, it, expect } from 'vitest';
import { periodKey, periodEndSec, isClosedPeriod, previousPeriod, buildSnapshot } from './sla-history';
import type { ClusterSla } from './sla';

function fakeSla(over: Partial<ClusterSla> = {}): ClusterSla {
  const base = {
    clusterId: 'c-1',
    clusterName: 'pve1',
    defaultTarget: 99.9,
    period: '2026-09',
    summary: {
      tracked: 3,
      compliant: 2,
      breach: 1,
      noData: 1,
      avgPct: 99.4,
      totalDowntimeMin: 45,
      atRisk: 1,
      maintenanceMin: 10
    },
    nodes: [],
    guests: []
  } as unknown as ClusterSla;
  return { ...base, ...over } as ClusterSla;
}

describe('sla-history period helpers', () => {
  it('formats period key with padded month', () => {
    expect(periodKey(2026, 9)).toBe('2026-09');
    expect(periodKey(2026, 12)).toBe('2026-12');
  });

  it('previousPeriod rolls year back from January', () => {
    expect(previousPeriod(2026, 1)).toEqual({ y: 2025, m: 12 });
    expect(previousPeriod(2026, 5)).toEqual({ y: 2026, m: 4 });
  });

  it('periodEndSec is start of next month in WIB', () => {
    expect(periodEndSec(2026, 9)).toBe(Math.floor(Date.UTC(2026, 9, 1, -7) / 1000));
    expect(periodEndSec(2026, 12)).toBe(Math.floor(Date.UTC(2027, 0, 1, -7) / 1000));
  });

  it('isClosedPeriod true only after month end', () => {
    const end = periodEndSec(2026, 9);
    expect(isClosedPeriod(2026, 9, end)).toBe(true);
    expect(isClosedPeriod(2026, 9, end - 1)).toBe(false);
  });
});

describe('buildSnapshot', () => {
  it('maps summary and combines node + guest rows', () => {
    const sla = fakeSla({
      nodes: [{ key: 'node:pve1', kind: 'node', name: 'pve1', node: 'pve1', target: 99.9, actualPct: 100, status: 'ok' }],
      guests: [
        { key: 'qemu:6', kind: 'guest', type: 'qemu', vmid: 6, name: 'web', node: 'pve1', target: 99.9, actualPct: 93.5, status: 'breach' }
      ]
    } as unknown as Partial<ClusterSla>) as ClusterSla;

    const snap = buildSnapshot(sla, 'PVE1', 2026, 8, true);
    expect(snap.period).toBe('2026-08');
    expect(snap.year).toBe(2026);
    expect(snap.month).toBe(8);
    expect(snap.final).toBe(true);
    expect(snap.clusterName).toBe('PVE1');
    expect(snap.avgPct).toBe(99.4);
    expect(snap.breach).toBe(1);
    expect(snap.entities).toHaveLength(2);
    expect(snap.entities.map((e) => e.key).sort()).toEqual(['node:pve1', 'qemu:6']);
    const guest = snap.entities.find((e) => e.vmid === 6)!;
    expect(guest.status).toBe('breach');
    expect(guest.target).toBe(99.9);
  });

  it('captures null availability as null', () => {
    const sla = fakeSla({ summary: { ...fakeSla().summary, avgPct: null } } as unknown as Partial<ClusterSla>) as ClusterSla;
    expect(buildSnapshot(sla, 'x', 2026, 9, false).avgPct).toBeNull();
  });
});
