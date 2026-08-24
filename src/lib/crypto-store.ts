import crypto from 'crypto';
import { getFileSecret } from './secrets';

const SALT = 'proxcenter.enc.v1';

function deriveKey(): Buffer {
  return crypto.scryptSync(getFileSecret(), SALT, 32);
}

export function encryptString(plain: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v1.' + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(payload: string): string {
  if (!payload.startsWith('v1.')) return payload;
  try {
    const raw = Buffer.from(payload.slice(3), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Gagal mendekripsi kredensial cluster. Kemungkinan file data/.secret berubah atau rusak.');
  }
}
