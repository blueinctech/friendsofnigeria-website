/**
 * Applies every SQL file in db/migrations that has not run yet, in name order,
 * each inside its own transaction. Safe to run on every deploy.
 *
 *   npm run db:migrate
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closePool, databaseUrl, query, transaction } from '../src/lib/server/db.ts';

const dir = join(import.meta.dirname, '..', 'db', 'migrations');

async function main() {
  if (!databaseUrl()) {
    if (process.env.VERCEL) {
      console.error('✖ DATABASE_URL is not set. Connect a Postgres database (e.g. Neon) to this Vercel project. See docs/admin-cms.md.');
      process.exit(1);
    }
    console.warn('⚠ DATABASE_URL is not set: skipping migrations.');
    return;
  }
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await query<{ version: string }>('SELECT version FROM schema_migrations')).map((r) => r.version));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    await transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    console.log(`✔ applied ${file}`);
    applied++;
  }
  console.log(applied ? `Database is up to date (${applied} migration${applied > 1 ? 's' : ''} applied).` : 'Database is up to date.');
}

main()
  .catch((err) => {
    console.error('✖ Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
