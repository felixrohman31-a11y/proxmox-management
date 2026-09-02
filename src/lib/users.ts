import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { ensureDataDir } from './secrets';

// ---------------------------------------------------------------------------
// Penyimpanan user panel (multi-user + peran + status aktif).
// File: data/users.json  (hash password scrypt; TIDAK menyimpan plaintext)
// Akun admin pertama di-seed otomatis dari env ADMIN_USER/ADMIN_PASSWORD agar
// login lama (versi single-admin) tetap berfungsi setelah upgrade.
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'viewer';

export interface StoredUser {
  id: string;
  username: string;
  role: UserRole;
  enabled: boolean;
  pwdVersion: number; // naik setiap password diubah → sesi lama invalid
  salt: string; // hex
  hash: string; // hex scrypt(password, salt)
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UserInput {
  username: string;
  password?: string;
  role: UserRole;
  enabled?: boolean;
}

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

const MIN_PASSWORD = 6;
const MIN_USERNAME = 3;

function usersFile(): string {
  return path.join(ensureDataDir(), 'users.json');
}

function hashPassword(password: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }).toString('hex');
}

// Diekspor hanya untuk unit test (roundtrip hash/verify tanpa menyentuh disk).
export function hashPasswordForTest(password: string, saltHex: string): string {
  return hashPassword(password, saltHex);
}

function makeSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function toPublic(u: StoredUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    enabled: u.enabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

export function readUsersSync(): StoredUser[] {
  const fp = usersFile();
  if (!fs.existsSync(fp)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return (parsed as StoredUser[]).map((u) => ({
      ...u,
      role: u.role === 'admin' ? 'admin' : 'viewer',
      pwdVersion: typeof u.pwdVersion === 'number' ? u.pwdVersion : 0
    }));
  } catch {
    return [];
  }
}

async function writeUsers(list: StoredUser[]): Promise<void> {
  const fp = usersFile();
  const tmp = `${fp}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsp.rename(tmp, fp);
}

function normalizeUsername(raw: string): string {
  return String(raw ?? '').trim().toLowerCase();
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]+$/.test(username) && username.length >= MIN_USERNAME && username.length <= 32;
}

function validateInput(input: UserInput): string | null {
  const username = normalizeUsername(input.username);
  if (!username) return 'Username wajib diisi.';
  if (!isValidUsername(username)) {
    return `Username hanya boleh huruf/angka/._- (${MIN_USERNAME}–32 karakter).`;
  }
  if (readUsersSync().some((u) => u.username === username)) return 'Username sudah dipakai.';
  if (input.password !== undefined && input.password.length < MIN_PASSWORD) {
    return `Password minimal ${MIN_PASSWORD} karakter.`;
  }
  return null;
}

// Seed admin pertama dari env saat modul di-load pertama kali. Idempotent:
// hanya membuat bila file belum ada ATAU belum ada satupun user admin.
// Sinkron (bukan async) agar pembaca sync berikutnya langsung melihat hasilnya.
export function seedAdminUser(): void {
  try {
    const existing = readUsersSync();
    if (existing.some((u) => u.role === 'admin')) return;
    const list = [...existing];
    const adminName = (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const salt = makeSalt();
    list.push({
      id: crypto.randomUUID(),
      username: adminName,
      role: 'admin',
      enabled: true,
      pwdVersion: 1,
      salt,
      hash: hashPassword(adminPass, salt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const fp = usersFile();
    const tmp = `${fp}.${process.pid}.seed.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, fp);
  } catch {
    // seed gagal (mis. disk) — login akan memakai fallback env di route login
  }
}

export function listUsers(): PublicUser[] {
  seedAdminUser();
  return readUsersSync().map(toPublic);
}

export function findUser(username: string): StoredUser | undefined {
  seedAdminUser();
  const needle = normalizeUsername(username);
  return readUsersSync().find((u) => u.username === needle);
}

export function getUserById(id: string): StoredUser | undefined {
  seedAdminUser();
  return readUsersSync().find((u) => u.id === id);
}

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!user.enabled) return false;
  const derived = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function createUser(input: UserInput): Promise<PublicUser> {
  seedAdminUser();
  const err = validateInput(input);
  if (err) throw new Error(err);
  const username = normalizeUsername(input.username);
  const salt = makeSalt();
  const rec: StoredUser = {
    id: crypto.randomUUID(),
    username,
    role: input.role === 'admin' ? 'admin' : 'viewer',
    enabled: input.enabled !== false,
    pwdVersion: 1,
    salt,
    hash: hashPassword(input.password ?? '', salt),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const list = readUsersSync();
  list.push(rec);
  await writeUsers(list);
  return toPublic(rec);
}

// Patch role/status/username. Password tidak diubah lewat sini (lihat resetPassword).
export async function updateUser(
  id: string,
  patch: { role?: UserRole; enabled?: boolean; username?: string }
): Promise<PublicUser | null> {
  seedAdminUser();
  const list = readUsersSync();
  const idx = list.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const cur = list[idx];
  const isLastAdmin =
    cur.role === 'admin' && list.filter((u) => u.role === 'admin' && u.enabled).length === 1;

  const nextRole: UserRole =
    patch.role === 'admin' || patch.role === 'viewer' ? patch.role : cur.role;
  const nextEnabled = patch.enabled !== undefined ? Boolean(patch.enabled) : cur.enabled;

  if (isLastAdmin && (nextRole !== 'admin' || !nextEnabled)) {
    throw new Error('Tidak dapat menurunkan/menonaktifkan admin terakhir.');
  }

  let nextUsername = cur.username;
  if (patch.username !== undefined && patch.username !== cur.username) {
    const uname = normalizeUsername(patch.username);
    if (!isValidUsername(uname)) {
      throw new Error(`Username hanya boleh huruf/angka/._- (${MIN_USERNAME}–32 karakter).`);
    }
    if (list.some((u) => u.username === uname)) throw new Error('Username sudah dipakai.');
    nextUsername = uname;
  }

  const next: StoredUser = { ...cur, username: nextUsername, role: nextRole, enabled: nextEnabled, updatedAt: new Date().toISOString() };
  list[idx] = next;
  await writeUsers(list);
  return toPublic(next);
}

export async function deleteUser(id: string): Promise<boolean> {
  seedAdminUser();
  const list = readUsersSync();
  const target = list.find((u) => u.id === id);
  if (!target) return false;
  const isLastAdmin =
    target.role === 'admin' && list.filter((u) => u.role === 'admin' && u.enabled).length === 1;
  if (isLastAdmin) throw new Error('Tidak dapat menghapus admin terakhir.');
  const next = list.filter((u) => u.id !== id);
  await writeUsers(next);
  return true;
}

export async function resetPassword(id: string, newPassword: string): Promise<boolean> {
  seedAdminUser();
  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    throw new Error(`Password minimal ${MIN_PASSWORD} karakter.`);
  }
  const list = readUsersSync();
  const idx = list.findIndex((u) => u.id === id);
  if (idx === -1) return false;
  const salt = makeSalt();
  list[idx] = {
    ...list[idx],
    salt,
    hash: hashPassword(newPassword, salt),
    pwdVersion: (list[idx].pwdVersion || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  await writeUsers(list);
  return true;
}

// Ganti password oleh user itu sendiri (wajib password lama benar).
export async function changeOwnPassword(
  id: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  seedAdminUser();
  const user = getUserById(id);
  if (!user) throw new Error('User tidak ditemukan.');
  if (!verifyPassword(user, oldPassword)) throw new Error('Password lama salah.');
  if (!newPassword || newPassword.length < MIN_PASSWORD) {
    throw new Error(`Password baru minimal ${MIN_PASSWORD} karakter.`);
  }
  if (newPassword === oldPassword) {
    throw new Error('Password baru harus berbeda dari password lama.');
  }
  await resetPassword(id, newPassword);
}

export function getLastAdminCount(): number {
  seedAdminUser();
  return readUsersSync().filter((u) => u.role === 'admin' && u.enabled).length;
}
