import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let cachedFileSecret: Buffer | null = null;

export function ensureDataDir(): string {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getFileSecret(): Buffer {
  if (cachedFileSecret) return cachedFileSecret;
  const file = path.join(ensureDataDir(), '.secret');
  if (fs.existsSync(file)) {
    cachedFileSecret = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  } else {
    cachedFileSecret = crypto.randomBytes(32);
    fs.writeFileSync(file, cachedFileSecret.toString('hex'), { encoding: 'utf8' });
  }
  if (cachedFileSecret.length !== 32) {
    cachedFileSecret = crypto.createHash('sha256').update(cachedFileSecret).digest();
  }
  return cachedFileSecret;
}

export function getSessionSecret(): string {
  const env = process.env.APP_SECRET;
  if (env && env.trim().length >= 16) return env.trim();
  return getFileSecret().toString('hex');
}
