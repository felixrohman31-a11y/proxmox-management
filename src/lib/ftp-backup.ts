import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { Client } from 'basic-ftp';
import { ensureDataDir } from './secrets';
import { decryptString, encryptString } from './crypto-store';
import { appendAudit } from './audit';

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

interface BackupState {
  lastAttempt?: string;
  lastSuccess?: string;
  lastFile?: string;
  lastError?: string;
  lastAutoDay?: string;
}

const SETTINGS_FILE = 'settings.json';
const STATE_FILE = 'backup-state.json';

function settingsPath(): string {
  return path.join(ensureDataDir(), SETTINGS_FILE);
}

function statePath(): string {
  return path.join(ensureDataDir(), STATE_FILE);
}

export function getFtpSettings(): (Omit<FtpSettings, never> & { configured: boolean }) | null {
  const fp = settingsPath();
  if (!fsSync.existsSync(fp)) return null;
  try {
    const s = JSON.parse(fsSync.readFileSync(fp, 'utf8')) as StoredFtp;
    return {
      host: s.host,
      port: s.port,
      username: s.username,
      directory: s.directory,
      passive: s.passive,
      autoDaily: s.autoDaily,
      configured: Boolean(s.encPassword)
    };
  } catch {
    return null;
  }
}

export async function saveFtpSettings(input: FtpSettings & { password?: string }): Promise<void> {
  const fp = settingsPath();
  let prev: StoredFtp | null = null;
  if (fsSync.existsSync(fp)) {
    try {
      prev = JSON.parse(await fs.readFile(fp, 'utf8'));
    } catch {
      prev = null;
    }
  }
  const next: StoredFtp = {
    host: input.host,
    port: input.port,
    username: input.username,
    directory: input.directory,
    passive: input.passive,
    autoDaily: input.autoDaily,
    encPassword: input.password ? encryptString(input.password) : (prev?.encPassword ?? '')
  };
  await fs.writeFile(fp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
}

async function loadPassword(): Promise<string> {
  const fp = settingsPath();
  const s = JSON.parse(await fs.readFile(fp, 'utf8')) as StoredFtp;
  return s.encPassword ? decryptString(s.encPassword) : '';
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
  const st = getFtpSettings();
  if (!st?.configured) return { ok: false, message: 'Pengaturan FTP belum lengkap.' };
  const client = new Client();
  try {
    await client.access({
      host: st.host,
      port: st.port,
      user: st.username,
      password: await loadPassword(),
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
  const st = getFtpSettings();
  const state = await readState();
  state.lastAttempt = new Date().toISOString();

  if (!st?.configured) {
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
    note: 'File berisi clusters.json (kredensial terenkripsi) dan .secret (kunci). Simpan keduanya dengan aman.',
    files: {
      'clusters.json': await fs.readFile(path.join(dataDir, 'clusters.json'), 'utf8').catch(() => ''),
      '.secret': await fs.readFile(path.join(dataDir, '.secret'), 'utf8').catch(() => ''),
      'settings.json': await fs.readFile(settingsPath(), 'utf8').catch(() => '')
    }
  };
  const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');

  const client = new Client();
  try {
    await client.access({
      host: st.host,
      port: st.port,
      user: st.username,
      password: await loadPassword(),
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

let schedulerStarted = false;

export function ensureScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  setInterval(
    async () => {
      try {
        const st = getFtpSettings();
        if (!st?.configured || !st.autoDaily) return;
        const state = await readState();
        const today = new Date().toISOString().slice(0, 10);
        if (state.lastAutoDay === today && !state.lastError) return;
        const hourNow = new Date().getUTCHours();
        if (hourNow < 17) return; // jalankan setelah pukul 00.00 WIB (17 UTC)
        await runFtpBackup('otomatis');
      } catch {
        // abaikan kesalahan scheduler
      }
    },
    30 * 60 * 1000
  ).unref?.();
}
