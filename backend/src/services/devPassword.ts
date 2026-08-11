import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Dev-mode temp passwords (no AWS Cognito).
 *
 * scrypt-hashed with a random salt — the hash is stored on `User.devPasswordHash`
 * and the plaintext is shown to the admin exactly once, at invite time.
 * Format: `scrypt$<salt-hex>$<hash-hex>` (N=16384, r=8, p=1, keylen=64).
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/** Generates a temp password that satisfies typical complexity rules. */
export function generateTempPassword(): string {
  // 6 base64url chars ≈ 36 bits of entropy, plus the fixed "Temp!" prefix.
  return `Temp!${randomBytes(6).toString('base64url')}`;
}

export function hashDevPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyDevPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
