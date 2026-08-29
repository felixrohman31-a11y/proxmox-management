import crypto from 'crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptString, decryptString, reEncryptIfNeeded } from './crypto-store';
import { getFileSecret, ensureDataDir } from './secrets';

// Mock the secrets module
vi.mock('./secrets', () => ({
  getFileSecret: vi.fn(),
  ensureDataDir: vi.fn()
}));

describe('crypto-store', () => {
  const mockSecret = crypto.randomBytes(32);
  
  beforeEach(() => {
    vi.clearAllMocks();
    (getFileSecret as vi.Mock).mockReturnValue(mockSecret);
  });

  describe('encryptString / decryptString', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const plain = 'test-password-123';
      const encrypted = encryptString(plain);
      const decrypted = decryptString(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('should produce different ciphertext for same plaintext (unique salt)', () => {
      const plain = 'same-password';
      const encrypted1 = encryptString(plain);
      const encrypted2 = encryptString(plain);
      expect(encrypted1).not.toBe(encrypted2);
      expect(decryptString(encrypted1)).toBe(plain);
      expect(decryptString(encrypted2)).toBe(plain);
    });

    it('should produce v2 format with base64 payload', () => {
      const plain = 'test';
      const encrypted = encryptString(plain);
      expect(encrypted).toMatch(/^v2\./);
    });

    it('should handle empty string', () => {
      const encrypted = encryptString('');
      expect(decryptString(encrypted)).toBe('');
    });

    it('should handle unicode characters', () => {
      const plain = 'pässwörd-🔐-中文';
      const encrypted = encryptString(plain);
      expect(decryptString(encrypted)).toBe(plain);
    });

    it('should handle long strings', () => {
      const plain = 'a'.repeat(10000);
      const encrypted = encryptString(plain);
      expect(decryptString(encrypted)).toBe(plain);
    });
  });

  describe('legacy v1 decryption support', () => {
    it('should decrypt legacy v1 format', () => {
      // Create a legacy v1 encrypted string
      const LEGACY_SALT = 'proxcenter.enc.v1';
      const plain = 'legacy-password';
      const key = crypto.scryptSync(mockSecret, LEGACY_SALT, 32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacyPayload = 'v1.' + Buffer.concat([iv, tag, enc]).toString('base64');
      
      const decrypted = decryptString(legacyPayload);
      expect(decrypted).toBe(plain);
    });

    it('should throw on corrupted legacy payload', () => {
      const legacyPayload = 'v1.' + Buffer.from('corrupted').toString('base64');
      expect(() => decryptString(legacyPayload)).toThrow();
    });
  });

  describe('reEncryptIfNeeded', () => {
    it('should return v2 payload unchanged', () => {
      const plain = 'test';
      const encrypted = encryptString(plain);
      const result = reEncryptIfNeeded(encrypted);
      expect(result).toBe(encrypted);
    });

    it('should re-encrypt legacy v1 to v2', () => {
      const LEGACY_SALT = 'proxcenter.enc.v1';
      const plain = 'legacy-password';
      const key = crypto.scryptSync(mockSecret, LEGACY_SALT, 32);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const legacyPayload = 'v1.' + Buffer.concat([iv, tag, enc]).toString('base64');
      
      const result = reEncryptIfNeeded(legacyPayload);
      expect(result).toMatch(/^v2\./);
      expect(decryptString(result)).toBe(plain);
    });
  });

  describe('decryptString error handling', () => {
    it('should throw on unknown version', () => {
      expect(() => decryptString('v9.invalid')).toThrow('Format enkripsi tidak dikenal');
    });

    it('should throw on truncated payload', () => {
      expect(() => decryptString('v2.' + Buffer.from('short').toString('base64'))).toThrow();
    });

    it('should throw on wrong secret (auth tag mismatch)', () => {
      const plain = 'test';
      const encrypted = encryptString(plain);
      // Change the secret
      (getFileSecret as vi.Mock).mockReturnValue(crypto.randomBytes(32));
      expect(() => decryptString(encrypted)).toThrow();
    });
  });
});