import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { ensureDataDir } from './secrets';

/**
 * Cache dua tingkat (L1 memori + L2 disk) dengan TTL per entri.
 *
 * Cache SLA sebelumnya hanya berupa `Map` di memori sehingga hilang setiap
 * restart — membuat hasil perhitungan ulang (fan-out /rrddata) terulang dari
 * nol. Untuk periode yang sudah lewat (data historis tak berubah) hasilnya bisa
 * disimpan tahan-lama di disk, sehingga laporan bulan lalu tidak membebani
 * Proxmox lagi meski server sudah di-restart. Periode berjalan tetap ber-TTL
 * pendek di memori agar angka live selalu segar.
 */

const L1 = new Map<string, { exp: number; v: unknown }>();

function cacheDir(): string {
  return path.join(ensureDataDir(), 'cache');
}
function fileFor(key: string): string {
  const h = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(cacheDir(), `${h}.json`);
}

/** Ambil nilai bila belum kedaluwarsa; sekaligus buang entri basi. */
export function cacheGet<T>(key: string): T | null {
  const now = Date.now();
  const l1 = L1.get(key);
  if (l1) {
    if (l1.exp > now) return l1.v as T;
    L1.delete(key);
  }
  const fp = fileFor(key);
  try {
    if (!fs.existsSync(fp)) return null;
    const obj = JSON.parse(fs.readFileSync(fp, 'utf8')) as { exp: number; v: T };
    if (!obj || typeof obj.exp !== 'number') return null;
    if (obj.exp <= now) {
      fs.unlink(fp, () => {});
      return null;
    }
    L1.set(key, { exp: obj.exp, v: obj.v });
    return obj.v;
  } catch {
    return null;
  }
}

/** Simpan nilai dengan TTL (ms). Sinkron ke memori, async ke disk. */
export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const exp = Date.now() + ttlMs;
  L1.set(key, { exp, v: value });
  // tulis disk non-blocking; kegagalan diabaikan (L1 tetap melayani)
  const fp = fileFor(key);
  fsp
    .mkdir(cacheDir(), { recursive: true })
    .then(() => fsp.writeFile(`${fp}.${process.pid}.tmp`, JSON.stringify({ exp, v: value }), 'utf8'))
    .then((r) => {
      void r;
      return fsp.rename(`${fp}.${process.pid}.tmp`, fp);
    })
    .catch(() => {});
}

export function cacheDelete(key: string): void {
  L1.delete(key);
  fs.unlink(fileFor(key), () => {});
}

/** Bersihkan seluruh cache (memori + disk). */
export function cacheClear(): void {
  L1.clear();
  const dir = cacheDir();
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.json') || f.endsWith('.tmp')) fs.unlinkSync(path.join(dir, f));
      }
    }
  } catch {
    /* abaikan */
  }
}
