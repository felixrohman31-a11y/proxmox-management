// Rate limiting per IP + per cluster untuk route proxy PVE (/api/pve/[id]/[...path]).
// Klaim CHANGELOG 1.2.0: default 60 req/menit untuk endpoint mutasi (POST/PUT/DELETE)
// dan 120 req/menit untuk GET, dengan header X-RateLimit-Limit / X-RateLimit-Remaining
// / Retry-After. Dapat dimatikan dengan env RATE_LIMIT_ENABLED=false.

const WINDOW_MS = 60 * 1000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function isEnabled(): boolean {
  return (process.env.RATE_LIMIT_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function limitFor(mutating: boolean): number {
  const raw = mutating ? process.env.RATE_LIMIT_MUTATE : process.env.RATE_LIMIT_GET;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : mutating ? 60 : 120;
}

function pruneExpired(now: number): void {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number; // detik
}

export function checkRateLimit(ip: string, clusterId: string, mutating: boolean): RateLimitResult {
  const limit = limitFor(mutating);
  if (!isEnabled()) {
    return { allowed: true, limit, remaining: limit };
  }
  const now = Date.now();
  const key = `${ip}|${clusterId}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  pruneExpired(now);
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfter = allowed ? undefined : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { allowed, limit, remaining, retryAfter };
}
