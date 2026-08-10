import { randomBytes } from 'node:crypto';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Cryptographically random alphanumeric string (no ambiguous chars). */
export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHANUMERIC[bytes[i]! % ALPHANUMERIC.length];
  }
  return out;
}

/** Human-friendly unique customer code, e.g. CUS-7F2K9Q */
export function generateCustomerCode(): string {
  return `CUS-${randomCode(6)}`;
}

/** Human-friendly unique challan number, e.g. CH-20260810-4K2Q */
export function generateChallanNumber(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `CH-${y}${m}${d}-${randomCode(4)}`;
}