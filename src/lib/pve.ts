import https from 'https';
import { randomUUID } from 'crypto';
import { getStoredCluster } from './store';
import { decryptString } from './crypto-store';

export class PveError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'PveError';
    this.status = status;
  }
}

interface RequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  rawBody?: Buffer;
  rawContentType?: string;
  insecure?: boolean;
  timeoutMs?: number;
}

interface HttpResult {
  status: number;
  data: unknown;
}

function httpRequest(host: string, port: number, opts: RequestOptions): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers ?? {}) };
    let body: string | Buffer | undefined;
    if (opts.form) {
      body = new URLSearchParams(opts.form).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['Content-Type'] = 'application/json';
    } else if (opts.rawBody) {
      body = opts.rawBody;
      headers['Content-Type'] = opts.rawContentType ?? 'application/octet-stream';
    }
    if (body) headers['Content-Length'] = String(Buffer.byteLength(body));

    const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: !opts.insecure });
    const req = https.request(
      {
        host,
        port,
        path: opts.path,
        method: opts.method,
        headers,
        agent,
        timeout: opts.timeoutMs ?? 15000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = raw;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, data: parsed });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`timeout menghubungi ${host}:${port}`)));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const errs = obj.errors;
    if (errs && typeof errs === 'object') {
      const msgs = Object.values(errs as Record<string, unknown>)
        .flat()
        .map(String);
      if (msgs.length) return msgs.join('; ');
    }
    if (typeof obj.message === 'string' && obj.message) return obj.message;
  }
  if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 300);
  return fallback;
}

interface TicketInfo {
  ticket: string;
  csrf: string;
  at: number;
}

const TICKET_TTL_MS = 90 * 60 * 1000;
const ticketCache = new Map<string, TicketInfo>();

export interface PveConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  insecure: boolean;
  authMode: 'ticket' | 'token';
  password?: string;
  token?: string;
}

export class PveClient {
  constructor(private conn: PveConnection) {}

  private cacheKey(): string {
    return `${this.conn.id}|${this.conn.username}`;
  }

  private async login(): Promise<TicketInfo> {
    let res: HttpResult;
    try {
      res = await httpRequest(this.conn.host, this.conn.port, {
        method: 'POST',
        path: '/api2/json/access/ticket',
        form: { username: this.conn.username, password: this.conn.password ?? '' },
        insecure: this.conn.insecure
      });
    } catch (e) {
      throw new PveError(`Tidak dapat menghubungi ${this.conn.host}:${this.conn.port} — ${(e as Error).message}`, 504);
    }
    const d = res.data as { data?: { ticket?: string; CSRFPreventionToken?: string } } | null;
    if (res.status !== 200 || !d?.data?.ticket) {
      throw new PveError(
        extractErrorMessage(
          d,
          res.status === 401
            ? 'Autentikasi Proxmox ditolak — periksa username/password.'
            : `Login gagal ke ${this.conn.host}:${this.conn.port} (HTTP ${res.status}).`
        ),
        res.status || 504
      );
    }
    return { ticket: d.data.ticket!, csrf: d.data.CSRFPreventionToken ?? '', at: Date.now() };
  }

  async ticket(force = false): Promise<TicketInfo> {
    const key = this.cacheKey();
    const existing = ticketCache.get(key);
    if (!force && existing && Date.now() - existing.at < TICKET_TTL_MS) return existing;
    const fresh = await this.login();
    ticketCache.set(key, fresh);
    return fresh;
  }

  invalidate(): void {
    ticketCache.delete(this.cacheKey());
  }

  private static buildHeaders(t: TicketInfo, mutating: boolean): Record<string, string> {
    const h: Record<string, string> = { Cookie: `PVEAuthCookie=${t.ticket}` };
    if (mutating && t.csrf) h['CSRFPreventionToken'] = decodeURIComponent(t.csrf);
    return h;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { query?: Record<string, unknown>; body?: unknown; retry?: boolean } = {}
  ): Promise<T> {
    let qs = '';
    if (options.query) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
      }
      qs = sp.toString();
    }
    const fullPath = `/api2/json${path}${qs ? `?${qs}` : ''}`;
    const mutating = method !== 'GET';
    const usingToken = this.conn.authMode === 'token';

    let headers: Record<string, string>;
    if (usingToken) {
      headers = { Authorization: `PVEAPIToken=${this.conn.token ?? ''}` };
    } else {
      const t = await this.ticket();
      headers = PveClient.buildHeaders(t, mutating);
    }

    let res: HttpResult;
    try {
      res = await httpRequest(this.conn.host, this.conn.port, {
        method,
        path: fullPath,
        headers,
        json: options.body,
        insecure: this.conn.insecure
      });
    } catch (e) {
      throw new PveError(`Koneksi ke ${this.conn.host}:${this.conn.port} gagal — ${(e as Error).message}`, 504);
    }

    if (!usingToken && res.status === 401 && options.retry !== false) {
      const t2 = await this.ticket(true);
      try {
        res = await httpRequest(this.conn.host, this.conn.port, {
          method,
          path: fullPath,
          headers: PveClient.buildHeaders(t2, mutating),
          json: options.body,
          insecure: this.conn.insecure
        });
      } catch (e) {
        throw new PveError(`Koneksi ke ${this.conn.host}:${this.conn.port} gagal — ${(e as Error).message}`, 504);
      }
    }

    if (res.status >= 200 && res.status < 300) {
      const d = res.data as { data?: unknown } | null;
      return (d && typeof d === 'object' && 'data' in d ? d.data : res.data) as T;
    }
    throw new PveError(extractErrorMessage(res.data, `Permintaan ke Proxmox gagal (HTTP ${res.status}).`), res.status || 502);
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body: body ?? {} });
  }

  async uploadFile(
    node: string,
    storageName: string,
    filename: string,
    contentType: 'iso',
    fileBuffer: Buffer
  ): Promise<unknown> {
    // Multipart/form-data native (tanpa binary curl) — lihat CHANGELOG 1.2.0.
    const boundary = `----ProxCenter${randomUUID().replace(/-/g, '')}`;
    const headerBlock = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="content"\r\n\r\n${contentType}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="filename"; filename="${filename.replace(/"/g, '')}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      'utf8'
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([headerBlock, fileBuffer, footer]);

    const usingToken = this.conn.authMode === 'token';
    const headers: Record<string, string> = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
    if (usingToken) {
      headers.Authorization = `PVEAPIToken=${this.conn.token ?? ''}`;
    } else {
      const t = await this.ticket();
      headers.Cookie = `PVEAuthCookie=${t.ticket}`;
      if (t.csrf) headers.CSRFPreventionToken = decodeURIComponent(t.csrf);
    }

    const uploadPath =
      `/api2/json/nodes/${encodeURIComponent(node)}/storage/` +
      `${encodeURIComponent(storageName)}/upload`;

    let res: HttpResult;
    try {
      res = await httpRequest(this.conn.host, this.conn.port, {
        method: 'POST',
        path: uploadPath,
        headers,
        rawBody: body,
        rawContentType: headers['Content-Type'],
        insecure: this.conn.insecure,
        timeoutMs: 600000
      });
    } catch (e) {
      throw new PveError(`Upload gagal: ${(e as Error).message}`, 502);
    }
    if (res.status >= 200 && res.status < 300) {
      const d = res.data as { data?: unknown } | null;
      return (d && typeof d === 'object' && 'data' in d ? d.data : res.data) ?? {};
    }
    throw new PveError(extractErrorMessage(res.data, `Upload gagal (HTTP ${res.status}).`), res.status >= 400 ? res.status : 502);
  }
}

export function getPveClient(clusterId: string): PveClient | null {
  const stored = getStoredCluster(clusterId);
  if (!stored) return null;
  const isToken = stored.authMethod === 'token';
  return new PveClient({
    id: stored.id,
    host: stored.host,
    port: stored.port,
    username: stored.username,
    insecure: stored.insecure,
    authMode: isToken ? 'token' : 'ticket',
    password: isToken ? undefined : decryptString(stored.encPassword),
    token: isToken ? (stored.encToken ? decryptString(stored.encToken) : '') : undefined
  });
}
