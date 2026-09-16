/**
 * Fan-out konkurensi terbatas, mempertahankan urutan hasil.
 *
 * Perhitungan SLA/Report memanggil /rrddata untuk SETIAP node & guest. Pada
 * cluster besar (puluhan VM) `Promise.all` membombardir Proxmox sekaligus —
 * memberatkan server, terutama PVE ≤4.x. `mapLimit` membatasi berapa request
 * yang berjalan bersamaan.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const ret = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length || 1));
  async function worker(): Promise<void> {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: size }, () => worker()));
  return ret;
}
