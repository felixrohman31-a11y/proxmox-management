import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { Client } from 'basic-ftp';
import { ensureDataDir } from './secrets';
import { decryptString, encryptString } from './crypto-store';
import { appendAudit } from './audit';
import { getPveClient } from './pve';
import { listClustersSync } from './store';

export interface FtpSettings {
  host: string;
  port: number;
  username: string;
  directory: string;
  passive: boolean;
  autoDaily: boolean;
}

interface StoredFtp extends FtpSettings {
  encPassword: string;
}

interface StoredWa {
  phone: string;
  encApikey: string;
}

interface SettingsFile {
  ftp?: StoredFtp;
  wa?: StoredWa;
}

export interface WaConfigView {
  phone: string;
  configured: boolean;
}

export interface BackupState {
  lastAttempt?: string;
  lastSuccess?: string;
  lastFile?: string;
  lastError?: string;
  lastAutoDay?: string;
}

const SETTINGS_FILE = 'settings.json';
const STATE_FILE = 'backup-state.json';
const MONITOR_FILE = 'monitor-state.json';

function settingsPath(): string {
  return path.join(ensureDataDir(), SETTINGS_FILE);
}
function statePath(): string {
  return path.join(ensureDataDir(), STATE_FILE);
}
function monitorPath(): string {
  return path.join(ensureDataDir(), MONITOR_FILE);
}

function migrate(parsed: SettingsFile & Partial<StoredFtp>): SettingsFile {
  if (!parsed.ftp && typeof parsed.host === 'string') {
    return {
      ftp: {
        host: parsed.host,
        port: typeof parsed.port === 'number' ? parsed.port : 21,
        username: typeof parsed.username === 'string' ? parsed.username : '',
        directory: typeof parsed.directory === 'string' ? parsed.directory : '',
        passive: parsed.passive !== false,
        autoDaily: Boolean(parsed.autoDaily),
        encPassword: typeof parsed.encPassword === 'string' ? parsed.encPassword : ''
      }
    };
  }
  return parsed;
}

async function readSettings(): Promise<SettingsFile> {
  const fp = settingsPath();
  if (!fsSync.existsSync(fp)) return {};
  try {
    return migrate(JSON.parse(await fs.readFile(fp, 'utf8')));
  } catch {
    return {};
  }
}

function readSettingsSync(): SettingsFile {
  const fp = settingsPath();
  if (!fsSync.existsSync(fp)) return {};
  try {
    return migrate(JSON.parse(fsSync.readFileSync(fp, 'utf8')));
  } catch {
    return {};
  }
}

async function writeSettings(s: SettingsFile): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function getFtpSettings(): (FtpSettings & { configured: boolean }) | null {
  const s = readSettingsSync().ftp;
  if (!s) return null;
  return {
    host: s.host,
    port: s.port,
    username: s.username,
    directory: s.directory,
    passive: s.passive,
    autoDaily: s.autoDaily,
    configured: Boolean(s.encPassword)
  };
}

export async function saveFtpSettings(input: FtpSettings & { password?: string }): Promise<void> {
  const all = await readSettings();
  all.ftp = {
    host: input.host,
    port: input.port,
    username: input.username,
    directory: input.directory,
    passive: input.passive,
    autoDaily: input.autoDaily,
    encPassword: input.password ? encryptString(input.password) : (all.ftp?.encPassword ?? '')
  };
  await writeSettings(all);
}

async function ftpPassword(s: StoredFtp): Promise<string> {
  return s.encPassword ? decryptString(s.encPassword) : '';
}

export async function getWaConfig(): Promise<WaConfigView> {
  const s = await readSettings();
  return { phone: s.wa?.phone ?? '', configured: Boolean(s.wa?.encApikey) };
}

export async function saveWaConfig(input: { phone: string; apikey?: string }): Promise<void> {
  const all = await readSettings();
  all.wa = {
    phone: input.phone,
    encApikey: input.apikey ? encryptString(input.apikey) : (all.wa?.encApikey ?? '')
  };
  await writeSettings(all);
}

export async function sendWhatsApp(text: string): Promise<{ ok: boolean; message: string }> {
  const s = await readSettings();
  if (!s.wa?.phone || !s.wa.encApikey) {
    return { ok: false, message: 'WhatsApp belum dikonfigurasi.' };
  }
  let apikey: string;
  try {
    apikey = decryptString(s.wa.encApikey);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(s.wa.phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    if (r.ok && /message/i.test(body)) return { ok: true, message: 'Pesan WhatsApp terkirim.' };
    return { ok: false, message: `CallMeBot HTTP ${r.status}: ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, message: `Gagal menghubungi CallMeBot: ${(e as Error).message}` };
  }
}

async function readState(): Promise<BackupState> {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8'));
  } catch {
    return {};
  }
}

async function writeState(st: BackupState): Promise<void> {
  await fs.writeFile(statePath(), JSON.stringify(st, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export async function getBackupState(): Promise<BackupState> {
  return readState();
}

export async function testFtp(): Promise<{ ok: boolean; message: string }> {
  const st = readSettingsSync().ftp;
  if (!st?.encPassword) return { ok: false, message: 'Pengaturan FTP belum lengkap.' };
  const client = new Client();
  try {
    await client.access({
      host: st.host,
      port: st.port,
      user: st.username,
      password: await ftpPassword(st),
      secure: false
    });
    return { ok: true, message: `Koneksi ke ${st.host}:${st.port} berhasil.` };
  } catch (e) {
    return { ok: false, message: `Gagal: ${(e as Error).message}` };
  } finally {
    client.close();
  }
}

export async function runFtpBackup(reason: 'manual' | 'otomatis'): Promise<{ ok: boolean; message: string }> {
  const st = readSettingsSync().ftp;
  const state = await readState();
  state.lastAttempt = new Date().toISOString();

  if (!st?.encPassword) {
    state.lastError = 'Pengaturan belum lengkap.';
    await writeState(state);
    return { ok: false, message: state.lastError };
  }

  const dataDir = ensureDataDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `proxcenter-config-${ts}.json`;

  const payload = {
    app: 'ProxCenter',
    kind: 'config-backup',
    createdAt: new Date().toISOString(),
    note: 'Berisi clusters.json (kredensial terenkripsi), .secret (kunci), settings.json. Simpan aman.',
    files: {
      'clusters.json': await fs.readFile(path.join(dataDir, 'clusters.json'), 'utf8').catch(() => ''),
      '.secret': await fs.readFile(path.join(dataDir, '.secret'), 'utf8').catch(() => ''),
      [SETTINGS_FILE]: await fs.readFile(settingsPath(), 'utf8').catch(() => '')
    }
  };
  const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');

  const client = new Client();
  try {
    await client.access({
      host: st.host,
      port: st.port,
      user: st.username,
      password: await ftpPassword(st),
      secure: false
    });
    if (st.directory) await client.ensureDir(st.directory);
    await client.uploadFrom(Readable.from(buffer), filename);

    state.lastSuccess = new Date().toISOString();
    state.lastFile = filename;
    state.lastError = undefined;
    if (reason === 'otomatis') state.lastAutoDay = new Date().toISOString().slice(0, 10);
    await writeState(state);
    await appendAudit({
      ts: new Date().toISOString(),
      user: reason === 'manual' ? 'admin' : 'scheduler',
      action: 'ftp.backup',
      target: filename,
      detail: `${reason} → ${st.host}:${st.port}/${st.directory}`
    });
    return { ok: true, message: `Backup terkirim: ${filename} (${buffer.length} bytes)` };
  } catch (e) {
    state.lastError = (e as Error).message;
    await writeState(state);
    return { ok: false, message: `Gagal upload: ${(e as Error).message}` };
  } finally {
    client.close();
  }
}

let jobsStarted = false;

export function ensureScheduler(): void {
  if (jobsStarted) return;
  jobsStarted = true;

  setInterval(
    async () => {
      try {
        const st = readSettingsSync().ftp;
        if (!st?.encPassword || !st.autoDaily) return;
        const state = await readState();
        const today = new Date().toISOString().slice(0, 10);
        if (state.lastAutoDay === today && !state.lastError) return;
        if (new Date().getUTCHours() < 17) return;
        await runFtpBackup('otomatis');
      } catch {
        // abaikan
      }
    },
    30 * 60 * 1000
  ).unref?.();

  setInterval(() => {
    void monitorCycle().catch(() => {});
  }, 5 * 60 * 1000).unref?.();

  void monitorCycle().catch(() => {});
}

interface MonitorState {
  [clusterId: string]: Record<string, string>;
}

async function monitorCycle(): Promise<void> {
  const wa = await getWaConfig();
  if (!wa.configured) return;

  let mon: MonitorState = {};
  try {
    mon = JSON.parse(await fs.readFile(monitorPath(), 'utf8'));
  } catch {
    mon = {};
  }

  for (const cluster of listClustersSync()) {
    try {
      const client = getPveClient(cluster.id);
      if (!client) continue;
      const res =
        ((await client.get<Array<Record<string, unknown>>>('/cluster/resources').catch(() => [])) ??
          []) as Array<Record<string, unknown>>;
      const running: Record<string, string> = {};
      for (const r of res) {
        if (
          (r.type === 'qemu' || r.type === 'lxc') &&
          !r.template &&
          r.status === 'running' &&
          typeof r.vmid === 'number'
        ) {
          running[`${r.type}-${r.vmid}-${r.node}`] =
            `${String(r.name ?? r.vmid)} (${r.type}/${r.vmid} @${r.node})`;
        }
      }

      const prev = mon[cluster.id];
      mon[cluster.id] = running;
      await fs.writeFile(monitorPath(), JSON.stringify(mon, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      });
      if (!prev) continue;

      const downed = Object.keys(prev).filter((k) => !(k in running)).slice(0, 3);
      for (const k of downed) {
        const msg = `⚠️ PROXCENTER\nGuest MATI terdeteksi:\n${prev[k]}\nCluster: ${cluster.name}\nWaktu: ${new Date().toLocaleString('id-ID', { hour12: false })} WIB`;
        const r = await sendWhatsApp(msg);
        await appendAudit({
          ts: new Date().toISOString(),
          user: 'monitor',
          action: r.ok ? 'notify.wa' : 'notify.wa.gagal',
          target: prev[k],
          detail: r.message
        });
      }
    } catch {
      // lanjut cluster berikutnya
    }
  }
}
