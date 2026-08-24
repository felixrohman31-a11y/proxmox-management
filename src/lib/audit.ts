import fs from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';

export interface AuditEntry {
  ts: string;
  user: string;
  action: string;
  target: string;
  detail?: string;
  ip?: string;
}

function filePath(): string {
  return path.join(ensureDataDir(), 'audit.log');
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  try {
    await fs.appendFile(filePath(), JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // logging tidak boleh mematahkan request
  }
}

export async function readAudit(limit = 200): Promise<AuditEntry[]> {
  try {
    const raw = await fs.readFile(filePath(), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    const out: AuditEntry[] = [];
    for (const line of lines.slice(-limit)) {
      try {
        out.push(JSON.parse(line) as AuditEntry);
      } catch {
        // lewati baris rusak
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}
