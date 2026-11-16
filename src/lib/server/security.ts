/**
 * Password hashing, tokens and rate limiting.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { one, query } from './db.ts';

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

// scrypt, N=2^15, r=8, p=1, 64-byte key, random 16-byte salt per password.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const maxmem = (n: number, r: number) => 256 * n * r;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: maxmem(Number(n), Number(r)),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Compare against a throwaway hash when no account exists, so response time does not reveal valid emails. */
let dummyHash: string | null = null;
export async function dummyVerify(password: string) {
  dummyHash ??= await hashPassword('not-a-real-password-' + randomBytes(8).toString('hex'));
  await verifyPassword(password, dummyHash);
}

const COMMON = ['password', '123456', 'qwerty', 'letmein', 'welcome', 'admin', 'nigeria', 'friendsofnigeria', 'iloveyou', 'abc123'];

/** Returns a reason the password is not acceptable, or null when it is fine. */
export function passwordProblem(password: unknown, context: { email?: string; name?: string } = {}): string | null {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  const lower = password.toLowerCase();
  if (/^(.)\1+$/.test(password)) return 'Do not repeat a single character.';
  const compact = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON.some((w) => compact.startsWith(w) && compact.length < w.length + 6)) return 'This password is too easy to guess.';
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Do not include your email address in your password.';
  return null;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Fixed-window rate limit stored in Postgres, so it holds across serverless
 * instances. Counts this hit and says whether it is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const row = await one<{ count: number; window_start: Date }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count, window_start`,
    [key, windowSeconds],
  );
  if (Math.random() < 0.02) {
    query(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`).catch(() => {});
  }
  const count = row?.count ?? 1;
  const resetAt = new Date((row?.window_start ?? new Date()).valueOf() + windowSeconds * 1000);
  return { allowed: count <= limit, count, retryAfter: Math.max(1, Math.ceil((resetAt.valueOf() - Date.now()) / 1000)) };
}

/** Reads a counter without counting a hit. */
export async function rateLimitCount(key: string, windowSeconds: number) {
  const row = await one<{ count: number }>(
    `SELECT count FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)`,
    [key, windowSeconds],
  );
  return row?.count ?? 0;
}

export async function rateLimitClear(key: string) {
  await query('DELETE FROM rate_limits WHERE key = $1', [key]);
}
