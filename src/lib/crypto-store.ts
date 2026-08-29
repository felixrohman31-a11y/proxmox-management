import crypto from 'crypto';
import { getFileSecret } from './secrets';

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 'v2';

function deriveKey(secret: Buffer, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function encryptString(plain: string): string {
  const secret = getFileSecret();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: salt + iv + tag + encrypted
  const payload = Buffer.concat([salt, iv, tag, enc]);
  return VERSION + '.' + payload.toString('base64');
}

export function decryptString(payload: string): string {
  // Support legacy v1 format (static salt, scrypt)
  if (payload.startsWith('v1.')) {
    return decryptLegacyV1(payload);
  }
  if (!payload.startsWith(VERSION + '.')) {
    throw new Error('Format enkripsi tidak dikenal');
  }
  try {
    const raw = Buffer.from(payload.slice(VERSION.length + 1), 'base64');
    if (raw.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new Error('Payload terlalu pendek');
    }
    const salt = raw.subarray(0, SALT_LENGTH);
    const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = raw.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const data = raw.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const secret = getFileSecret();
    const key = deriveKey(secret, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Gagal mendekripsi kredensial cluster. Kemungkinan file data/.secret berubah atau rusak.');
  }
}

function decryptLegacyV1(payload: string): string {
  // Legacy format: static salt 'proxcenter.enc.v1', scrypt, v1.{iv+tag+enc}
  const LEGACY_SALT = 'proxcenter.enc.v1';
  try {
    const raw = Buffer.from(payload.slice(3), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const secret = getFileSecret();
    const key = crypto.scryptSync(secret, LEGACY_SALT, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Gagal mendekripsi kredensial cluster (legacy). Kemungkinan file data/.secret berubah atau rusak.');
  }
}

export function reEncryptIfNeeded(payload: string): string {
  if (payload.startsWith(VERSION + '.')) {
    return payload; // Already using v2
  }
  // Decrypt legacy and re-encrypt with v2
  const plain = decryptString(payload);
  return encryptString(plain);
}