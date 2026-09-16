import { describe, it, expect } from 'vitest';
import { mapLimit } from './concurrency';

describe('mapLimit', () => {
  it('preserves input order', async () => {
    const items = [5, 1, 4, 2, 3];
    const out = await mapLimit(items, 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 2;
    });
    expect(out).toEqual([10, 2, 8, 4, 6]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles empty input', async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([]);
  });

  it('propagates errors', async () => {
    await expect(
      mapLimit([1, 2, 3], 1, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      })
    ).rejects.toThrow('boom');
  });
});
