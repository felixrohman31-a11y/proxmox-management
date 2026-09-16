import { describe, it, expect } from 'vitest';
import { aggregateFleet, type FleetCluster } from './sla-overview';

function cl(over: Partial<FleetCluster>): FleetCluster {
  return {
    clusterId: 'x',
    name: 'x',
    host: '',
    reachable: true,
    avgPct: null,
    tracked: 0,
    compliant: 0,
    breach: 0,
    noData: 0,
    atRisk: 0,
    totalDowntimeMin: 0,
    maintenanceMin: 0,
    worst: null,
    ...over
  };
}

describe('aggregateFleet', () => {
  it('weights average availability by tracked count and ignores unreachable', () => {
    const t = aggregateFleet([
      cl({ clusterId: '1', name: 'a', avgPct: 99.8, tracked: 33, compliant: 32, breach: 1, noData: 3 }),
      cl({ clusterId: '2', name: 'b', avgPct: 100, tracked: 10, compliant: 10 }),
      cl({ clusterId: '3', name: 'c', reachable: false })
    ]);
    expect(t.clusters).toBe(3);
    expect(t.reachable).toBe(2);
    expect(t.tracked).toBe(43);
    expect(t.compliant).toBe(42);
    expect(t.breach).toBe(1);
    // (99.8*33 + 100*10) / 43 = 99.85 (pembulatan 2 desimal)
    expect(t.avgPct).toBe(99.85);
  });

  it('nulls average when nothing tracked', () => {
    expect(aggregateFleet([cl({})]).avgPct).toBeNull();
  });

  it('does not let an unreachable cluster with null avg pull the average', () => {
    const t = aggregateFleet([
      cl({ avgPct: 99, tracked: 1 }),
      cl({ reachable: false, avgPct: null, tracked: 0 })
    ]);
    expect(t.avgPct).toBe(99);
  });
});
