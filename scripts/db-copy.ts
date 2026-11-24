/**
 * One-time move to a new database and S3 bucket: copies all content from
 * OLD_DATABASE_URL into DATABASE_URL, and every media file (stored in the old
 * database or in Vercel Blob) into the S3 bucket. Media records are rewritten to
 * storage "s3" with /media/<key> URLs, and old Blob URLs inside content are
 * replaced too.
 *
 * The new database must already be migrated (npm run db:migrate). Its content
 * tables are emptied first, so any seeded content is replaced. Sign-in sessions,
 * password links and rate limits are not copied: everyone signs in again.
 * Safe to run again: files already in the bucket are skipped.
 *
 *   node --env-file=<new .env> --env-file=<file with OLD_DATABASE_URL> \
 *     --experimental-strip-types scripts/db-copy.ts --yes
 */
import pg from 'pg';

pg.types.setTypeParser(1082, (v: string) => v);

const SKIP = new Set(['schema_migrations', 'admin_sessions', 'password_resets', 'rate_limits', 'media_blobs']);

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

interface Variant { w: number; h: number; url: string; key: string; size: number }

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('This empties the content tables of DATABASE_URL and copies OLD_DATABASE_URL into it. Re-run with --yes.');
    process.exit(1);
  }
  const oldUrl = env('OLD_DATABASE_URL');
  const newUrl = env('DATABASE_URL');
  if (oldUrl === newUrl) throw new Error('OLD_DATABASE_URL and DATABASE_URL are the same database');
  const bucket = env('S3_BUCKET');

  const src = new pg.Client({ connectionString: oldUrl });
  const dst = new pg.Client({ connectionString: newUrl });
  await src.connect();
  await dst.connect();

  const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials: { accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY') },
  });
  const inBucket = async (key: string) => {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: `media/${key}` }));
      return true;
    } catch {
      return false;
    }
  };

  const migrated = await dst.query(`SELECT 1 FROM schema_migrations WHERE version = '002_media_s3.sql'`).catch(() => ({ rowCount: 0 }));
  if (!migrated.rowCount) throw new Error('The new database is not migrated yet. Run npm run db:migrate against it first.');

  // ---------------------------------------------------------------- media files
  const keyOf = (url: string) => {
    const path = url.startsWith('/') ? url : new URL(url).pathname;
    const m = path.match(/^\/media\/(.+)$/);
    if (!m) throw new Error(`Unexpected media URL: ${url}`);
    return decodeURIComponent(m[1]);
  };
  const urlMap = new Map<string, string>(); // old absolute Blob URL -> /media/<key>
  const media = (await src.query('SELECT * FROM media ORDER BY created_at')).rows;
  let uploaded = 0;
  let skipped = 0;
  for (const m of media) {
    const objects: { url: string; key: string }[] = [{ url: m.url, key: keyOf(m.url) }];
    for (const v of (m.variants ?? []) as Variant[]) objects.push({ url: v.url, key: v.key ?? keyOf(v.url) });
    if (m.og_url) objects.push({ url: m.og_url, key: keyOf(m.og_url) });

    for (const o of objects) {
      if (o.url.startsWith('http')) urlMap.set(o.url, `/media/${o.key}`);
      if (await inBucket(o.key)) {
        skipped++;
        continue;
      }
      let body: Buffer;
      let mime: string;
      if (m.storage === 'db') {
        const r = await src.query('SELECT mime, data FROM media_blobs WHERE key = $1', [o.key]);
        if (!r.rowCount) throw new Error(`File ${o.key} is missing from media_blobs`);
        ({ mime } = r.rows[0]);
        body = r.rows[0].data;
      } else {
        const res = await fetch(o.url);
        if (!res.ok) throw new Error(`Download failed (${res.status}): ${o.url}`);
        mime = res.headers.get('content-type') || m.mime;
        body = Buffer.from(await res.arrayBuffer());
      }
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `media/${o.key}`,
          Body: body,
          ContentType: mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      uploaded++;
    }
    m.storage = 's3';
    m.url = `/media/${objects[0].key}`;
    m.variants = ((m.variants ?? []) as Variant[]).map((v) => ({ ...v, url: `/media/${v.key ?? keyOf(v.url)}` }));
    if (m.og_url) m.og_url = `/media/${keyOf(m.og_url)}`;
  }
  console.log(`✔ media files: ${uploaded} uploaded, ${skipped} already in the bucket (${media.length} media records)`);

  // ---------------------------------------------------------------- tables
  const tablesOf = async (c: pg.Client) =>
    (await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`)).rows.map(
      (r) => r.table_name as string,
    );
  const newTables = new Set(await tablesOf(dst));
  const tables = (await tablesOf(src)).filter((t) => !SKIP.has(t) && newTables.has(t));
  const missing = (await tablesOf(src)).filter((t) => !SKIP.has(t) && !newTables.has(t));
  if (missing.length) console.warn(`⚠ not in the new database, skipped: ${missing.join(', ')}`);

  // Order so that referenced tables come first.
  const fks = (
    await dst.query(
      `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    )
  ).rows as { child: string; parent: string }[];
  const ordered: string[] = [];
  const visit = (t: string, seen = new Set<string>()) => {
    if (ordered.includes(t) || seen.has(t)) return;
    seen.add(t);
    for (const fk of fks) if (fk.child === t && fk.parent !== t && tables.includes(fk.parent)) visit(fk.parent, seen);
    ordered.push(t);
  };
  for (const t of tables) visit(t);

  const replaceUrls = (s: string) => {
    for (const [from, to] of urlMap) if (s.includes(from)) s = s.split(from).join(to);
    return s;
  };

  await dst.query('BEGIN');
  try {
    await dst.query(`TRUNCATE ${[...ordered, 'media_blobs'].map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    for (const table of ordered) {
      const cols = (
        await dst.query(
          `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'`,
          [table],
        )
      ).rows as { column_name: string; data_type: string }[];
      let rows = table === 'media' ? media : (await src.query(`SELECT * FROM "${table}"`)).rows;
      if (!rows.length) continue;
      const use = cols.filter((c) => c.column_name in rows[0]);
      // A table that references itself (nav_items.parent_id): parents first.
      if (fks.some((fk) => fk.child === table && fk.parent === table) && 'parent_id' in rows[0]) {
        const sorted: any[] = [];
        const ids = new Set<string>();
        let pending = rows;
        while (pending.length) {
          const ready = pending.filter((r) => !r.parent_id || ids.has(r.parent_id));
          if (!ready.length) throw new Error(`${table}: rows with missing parents`);
          for (const r of ready) ids.add(r.id);
          sorted.push(...ready);
          pending = pending.filter((r) => !ready.includes(r));
        }
        rows = sorted;
      }
      const names = use.map((c) => `"${c.column_name}"`).join(', ');
      const params = use.map((_, i) => `$${i + 1}`).join(', ');
      for (const row of rows) {
        const values = use.map(({ column_name, data_type }) => {
          const v = row[column_name];
          if (v == null) return v;
          if (data_type === 'jsonb' || data_type === 'json') return replaceUrls(JSON.stringify(v));
          if (typeof v === 'string') return replaceUrls(v);
          return v;
        });
        await dst.query(`INSERT INTO "${table}" (${names}) VALUES (${params})`, values);
      }
      // Keep serial ids (activity_log) counting on from the copied rows.
      for (const c of use) {
        const seq = (await dst.query('SELECT pg_get_serial_sequence($1, $2) AS s', [`"${table}"`, c.column_name])).rows[0]?.s;
        if (seq) await dst.query(`SELECT setval($1, COALESCE((SELECT MAX("${c.column_name}") FROM "${table}"), 1))`, [seq]);
      }
      console.log(`✔ ${table}: ${rows.length}`);
    }
    await dst.query('COMMIT');
  } catch (err) {
    await dst.query('ROLLBACK');
    throw err;
  }
  console.log('Done. The new database and bucket hold a full copy.');
  await src.end();
  await dst.end();
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});
