import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { hashPasswordForTest, verifyPassword, type StoredUser } from './users';

function fakeUser(password: string, enabled = true): StoredUser {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    id: crypto.randomUUID(),
    username: 'test',
    role: 'admin',
    enabled,
    pwdVersion: 1,
    salt,
    hash: hashPasswordForTest(password, salt),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe('users password hashing', () => {
  it('verifyPassword true untuk password yang benar', () => {
    const u = fakeUser('rahasia123');
    expect(verifyPassword(u, 'rahasia123')).toBe(true);
  });

  it('verifyPassword false untuk password salah', () => {
    const u = fakeUser('rahasia123');
    expect(verifyPassword(u, 'salah')).toBe(false);
  });

  it('hash sama untuk salt sama, beda untuk salt beda', () => {
    const h1 = hashPasswordForTest('pw', 'aa');
    const h2 = hashPasswordForTest('pw', 'aa');
    const h3 = hashPasswordForTest('pw', 'bb');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('akun dinonaktifkan selalu ditolak walau password benar', () => {
    const u = fakeUser('rahasia123', false);
    expect(verifyPassword(u, 'rahasia123')).toBe(false);
  });

  it('panjang hash 128 hex (64 byte scrypt)', () => {
    const h = hashPasswordForTest('x', crypto.randomBytes(16).toString('hex'));
    expect(h).toHaveLength(128);
  });
});
