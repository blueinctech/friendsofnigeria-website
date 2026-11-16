/**
 * Administrator accounts, sessions, sign-in protection and password resets.
 */
import { one, query } from './db.ts';
import { logActivity } from './activity.ts';
import {
  dummyVerify,
  hashPassword,
  passwordProblem,
  randomToken,
  rateLimit,
  rateLimitClear,
  rateLimitCount,
  sha256,
  verifyPassword,
} from './security.ts';
import type { Role } from '../cms/permissions.ts';

/** A session ends after this long without activity... */
export const SESSION_IDLE_MINUTES = Number(process.env.ADMIN_SESSION_IDLE_MINUTES || 120);
/** ...and in any case this long after sign-in. */
export const SESSION_MAX_HOURS = Number(process.env.ADMIN_SESSION_MAX_HOURS || 12);

const LOGIN_MAX_FAILURES = 5; // per email address
const LOGIN_WINDOW = 15 * 60; // seconds
const LOGIN_MAX_PER_IP = 30;

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: Role;
  modules: string[];
  active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface Session {
  id: string;
  csrf: string;
  expiresAt: Date;
}

const ADMIN_COLUMNS = 'id, email, name, role, modules, active, last_login_at, created_at';

export const normaliseEmail = (email: unknown) => String(email ?? '').trim().toLowerCase();
export const isEmail = (s: unknown) => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function countAdmins() {
  const row = await one<{ n: number }>('SELECT count(*)::int AS n FROM admins');
  return row?.n ?? 0;
}

export async function getAdmin(id: string) {
  return one<Admin>(`SELECT ${ADMIN_COLUMNS} FROM admins WHERE id = $1`, [id]);
}

export async function createAdmin(input: { email: string; name: string; role: Role; password: string; modules?: string[] }) {
  const problem = passwordProblem(input.password, input);
  if (problem) throw new Error(problem);
  const hash = await hashPassword(input.password);
  return one<Admin>(
    `INSERT INTO admins (email, name, role, modules, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING ${ADMIN_COLUMNS}`,
    [normaliseEmail(input.email), input.name.trim(), input.role, input.modules ?? [], hash],
  );
}

// ------------------------------------------------------------------ Sessions

export async function createSession(adminId: string, ip: string | null, userAgent: string | null) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expiresAt = new Date(Date.now() + SESSION_MAX_HOURS * 3600_000);
  await query(
    `INSERT INTO admin_sessions (id, admin_id, csrf_token, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [sha256(token), adminId, csrf, ip, userAgent?.slice(0, 300) ?? null, expiresAt],
  );
  return { token, csrf, expiresAt };
}

/** Looks up a session token. Returns null when it is unknown, expired, idle too long or the account is disabled. */
export async function readSession(token: string | undefined | null): Promise<{ admin: Admin; session: Session } | null> {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const row = await one(
    `SELECT s.id AS sid, s.csrf_token, s.expires_at, s.last_seen_at, a.id, a.email, a.name, a.role, a.modules, a.active, a.last_login_at, a.created_at
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.id = $1`,
    [id],
  );
  if (!row) return null;
  const now = Date.now();
  const idleExpired = new Date(row.last_seen_at).valueOf() + SESSION_IDLE_MINUTES * 60_000 < now;
  if (!row.active || new Date(row.expires_at).valueOf() < now || idleExpired) {
    await query('DELETE FROM admin_sessions WHERE id = $1', [id]);
    return null;
  }
  // Slide the idle timer, at most once a minute.
  if (now - new Date(row.last_seen_at).valueOf() > 60_000) {
    query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [id]).catch(() => {});
  }
  const admin: Admin = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    modules: row.modules ?? [],
    active: row.active,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
  };
  return { admin, session: { id, csrf: row.csrf_token, expiresAt: new Date(row.expires_at) } };
}

export async function destroySession(token: string | undefined | null) {
  if (token) await query('DELETE FROM admin_sessions WHERE id = $1', [sha256(token)]);
}

export async function destroyAllSessions(adminId: string, exceptSessionId?: string) {
  await query('DELETE FROM admin_sessions WHERE admin_id = $1 AND id IS DISTINCT FROM $2', [adminId, exceptSessionId ?? null]);
}

// ------------------------------------------------------------------ Sign-in

export type LoginResult =
  | { ok: true; admin: Admin; token: string; csrf: string; expiresAt: Date }
  | { ok: false; error: string; status: number; retryAfter?: number };

const GENERIC_FAILURE = 'The email address or password is incorrect.';
const LOCKED = 'Too many unsuccessful attempts. For your security, sign-in is paused for 15 minutes. You can also reset your password.';

export async function login(emailInput: unknown, password: unknown, ip: string | null, userAgent: string | null): Promise<LoginResult> {
  const email = normaliseEmail(emailInput);
  if (!isEmail(email) || typeof password !== 'string' || !password || password.length > 200) {
    return { ok: false, error: GENERIC_FAILURE, status: 400 };
  }
  const ipLimit = await rateLimit(`login-ip:${ip ?? 'unknown'}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW);
  if (!ipLimit.allowed) return { ok: false, error: LOCKED, status: 429, retryAfter: ipLimit.retryAfter };

  const emailKey = `login-email:${sha256(email)}`;
  if ((await rateLimitCount(emailKey, LOGIN_WINDOW)) >= LOGIN_MAX_FAILURES) {
    return { ok: false, error: LOCKED, status: 429, retryAfter: LOGIN_WINDOW };
  }

  const row = await one<Admin & { password_hash: string }>(`SELECT ${ADMIN_COLUMNS}, password_hash FROM admins WHERE lower(email) = $1`, [email]);
  const valid = row ? await verifyPassword(password, row.password_hash) : (await dummyVerify(password), false);

  if (!row || !valid || !row.active) {
    await rateLimit(emailKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW);
    if (row) await query('UPDATE admins SET failed_logins = failed_logins + 1 WHERE id = $1', [row.id]);
    await logActivity(row ? { id: row.id, name: row.name } : null, {
      action: 'login_failed',
      entityType: 'admin',
      entityLabel: email,
      details: { reason: !row ? 'unknown email' : !row.active ? 'account disabled' : 'wrong password' },
      ip,
    });
    return { ok: false, error: GENERIC_FAILURE, status: 401 };
  }

  await rateLimitClear(emailKey);
  await query('UPDATE admins SET failed_logins = 0, last_login_at = now() WHERE id = $1', [row.id]);
  const { password_hash: _ignored, ...admin } = row;
  const session = await createSession(admin.id, ip, userAgent);
  await logActivity({ id: admin.id, name: admin.name }, { action: 'login', entityType: 'admin', entityId: admin.id, entityLabel: admin.email, ip });
  return { ok: true, admin, ...session };
}

// ------------------------------------------------------------------ Passwords

export async function setPassword(adminId: string, password: string) {
  const hash = await hashPassword(password);
  await query('UPDATE admins SET password_hash = $2, password_changed_at = now(), failed_logins = 0, updated_at = now() WHERE id = $1', [adminId, hash]);
}

export async function checkCurrentPassword(adminId: string, password: string) {
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM admins WHERE id = $1', [adminId]);
  return row ? verifyPassword(password, row.password_hash) : false;
}

/** Creates a single-use reset link token. Only its hash is stored. */
export async function createResetToken(adminId: string, hours: number, createdBy: string | null = null) {
  const token = randomToken(32);
  await query(`UPDATE password_resets SET used_at = now() WHERE admin_id = $1 AND used_at IS NULL`, [adminId]);
  await query(
    `INSERT INTO password_resets (id, admin_id, created_by, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [sha256(token), adminId, createdBy, hours],
  );
  return token;
}

export async function findResetToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  return one<{ id: string; admin_id: string; email: string; name: string }>(
    `SELECT r.id, r.admin_id, a.email, a.name FROM password_resets r JOIN admins a ON a.id = r.admin_id
      WHERE r.id = $1 AND r.used_at IS NULL AND r.expires_at > now() AND a.active`,
    [sha256(token)],
  );
}

export async function consumeResetToken(token: string, password: string) {
  const reset = await findResetToken(token);
  if (!reset) return { ok: false as const, error: 'This link has expired or has already been used. Please request a new one.' };
  const problem = passwordProblem(password, { email: reset.email, name: reset.name });
  if (problem) return { ok: false as const, error: problem };
  await setPassword(reset.admin_id, password);
  await query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
  await destroyAllSessions(reset.admin_id);
  return { ok: true as const, adminId: reset.admin_id, name: reset.name, email: reset.email };
}
