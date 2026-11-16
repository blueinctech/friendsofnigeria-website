/**
 * Postgres connection shared by the website, the admin dashboard and the
 * maintenance scripts. Works with Neon (Vercel Marketplace), Vercel Postgres,
 * Supabase or any Postgres 14+ server.
 *
 * Every query in the project goes through `query()` with $1-style parameters,
 * so values are never concatenated into SQL.
 */
import pg from 'pg';

export type Row = Record<string, any>;

declare global {
  // Reuse one pool per server instance (and across dev reloads).
  var __fonPool: pg.Pool | undefined;
}

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not set. See docs/admin-cms.md for setup instructions.');
    this.name = 'DatabaseNotConfiguredError';
  }
}

export function pool(): pg.Pool {
  if (globalThis.__fonPool) return globalThis.__fonPool;
  const connectionString = databaseUrl();
  if (!connectionString) throw new DatabaseNotConfiguredError();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const p = new pg.Pool({
    connectionString,
    // Serverless functions run many small instances: keep each pool small.
    max: Number(process.env.DATABASE_POOL_MAX || 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    ssl: local || /sslmode=disable/.test(connectionString) ? undefined : { rejectUnauthorized: !process.env.DATABASE_SSL_NO_VERIFY },
  });
  p.on('error', (err) => console.error('[db] idle client error', err.message));
  globalThis.__fonPool = p;
  return p;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query(text, params as any[]);
  return res.rows as T[];
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export type Tx = { query: <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]> };

/** Runs `fn` in a transaction; rolls back if it throws. */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const tx: Tx = {
      query: async (text, params = []) => (await client.query(text, params as any[])).rows as any,
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalThis.__fonPool) {
    await globalThis.__fonPool.end();
    globalThis.__fonPool = undefined;
  }
}

/** Postgres error code for unique violations. */
export const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === '23505';
export const isForeignKeyViolation = (err: unknown) => (err as { code?: string })?.code === '23503';
