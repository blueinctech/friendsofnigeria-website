/**
 * Media library: upload validation, image optimisation and storage.
 *
 * Storage driver:
 * - An S3-compatible bucket when S3_BUCKET is set (AWS S3, Neon object storage,
 *   Cloudflare R2...). Files are served from /media/... by the website, so the
 *   bucket can stay private. Use this on Hostinger or any non-Vercel host.
 * - Vercel Blob when BLOB_READ_WRITE_TOKEN is set.
 * - Otherwise the files are stored in Postgres (table media_blobs) and served
 *   from /media/... with long-lived cache headers, so the CMS works with only a
 *   database.
 *
 * Images are auto-rotated, stripped of metadata and converted to WebP in
 * several widths for responsive srcset, plus a 1200x630 JPEG for social sharing.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { one, query, transaction, type Row } from './db.ts';

export const MAX_UPLOAD_BYTES = Number(process.env.MEDIA_MAX_UPLOAD_MB || 4) * 1024 * 1024;
export const VARIANT_WIDTHS = [480, 960, 1600];
const FULL_MAX = 2000;

export interface Variant {
  w: number;
  h: number;
  url: string;
  key: string;
  size: number;
}

export interface MediaRecord {
  id: string;
  kind: 'image' | 'document';
  filename: string;
  original_name: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string;
  storage: 'db' | 'blob' | 's3';
  url: string;
  variants: Variant[];
  og_url: string | null;
  source_key: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export class UploadError extends Error {
  status = 400;
}

export const storageDriver = (): 'db' | 'blob' | 's3' =>
  process.env.S3_BUCKET ? 's3' : process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'db';

// ------------------------------------------------------------------ File type detection

type Detected = { mime: string; ext: string; kind: 'image' | 'document' };

const DOC_TYPES: Record<string, Detected> = {
  pdf: { mime: 'application/pdf', ext: 'pdf', kind: 'document' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', kind: 'document' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', kind: 'document' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx', kind: 'document' },
  doc: { mime: 'application/msword', ext: 'doc', kind: 'document' },
  xls: { mime: 'application/vnd.ms-excel', ext: 'xls', kind: 'document' },
  ppt: { mime: 'application/vnd.ms-powerpoint', ext: 'ppt', kind: 'document' },
  txt: { mime: 'text/plain; charset=utf-8', ext: 'txt', kind: 'document' },
  csv: { mime: 'text/csv; charset=utf-8', ext: 'csv', kind: 'document' },
};

export const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', ...Object.keys(DOC_TYPES)];

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

/** Identifies a file from its first bytes (never trusts the browser's type) and its extension. */
export function detectType(buf: Buffer, filename: string): Detected | null {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return ext === 'pdf' ? DOC_TYPES.pdf : null;
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return ['docx', 'xlsx', 'pptx'].includes(ext) ? DOC_TYPES[ext] : null;
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) return ['doc', 'xls', 'ppt'].includes(ext) ? DOC_TYPES[ext] : null;
  // Text formats: must be valid UTF-8 without NUL bytes.
  if (buf.includes(0)) return null;
  const text = buf.toString('utf8');
  if (text.includes('�')) return null;
  if (ext === 'svg' && /<svg[\s>]/i.test(text.slice(0, 4096))) return { mime: 'image/svg+xml', ext: 'svg', kind: 'image' };
  if (ext === 'txt' || ext === 'csv') return DOC_TYPES[ext];
  return null;
}

/** SVGs can carry scripts. Only plain drawings are accepted. */
export function svgProblem(text: string): string | null {
  const bad = [
    /<script/i,
    /\son[a-z]+\s*=/i,
    /javascript:/i,
    /<foreignObject/i,
    /<(iframe|embed|object|audio|video|link|meta|style[^>]*>[^<]*@import)/i,
    /<!ENTITY/i,
    /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i,
  ];
  return bad.some((re) => re.test(text)) ? 'This SVG contains scripts, links or embedded content and cannot be used. Export it again as a plain SVG or upload a PNG.' : null;
}

export function safeFilename(name: string) {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\.[^.]+$/, '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return slug || 'file';
}

// ------------------------------------------------------------------ Storage

async function blobPut(key: string, body: Buffer, contentType: string) {
  const { put } = await import('@vercel/blob');
  const res = await put(`media/${key}`, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 31536000,
  } as any);
  return res.url;
}

async function blobDelete(urls: string[]) {
  if (!urls.length) return;
  const { del } = await import('@vercel/blob');
  await del(urls);
}

// S3-compatible bucket. Objects live under "media/<key>"; the site serves them at /media/<key>.
let s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
async function s3() {
  const sdk = await import('@aws-sdk/client-s3');
  s3Client ??= new sdk.S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    // S3-compatible stores (Neon, R2) don't all accept the SDK's default checksums.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return { sdk, client: s3Client, bucket: process.env.S3_BUCKET! };
}

export async function s3Put(key: string, body: Buffer, contentType: string) {
  const { sdk, client, bucket } = await s3();
  await client.send(
    new sdk.PutObjectCommand({
      Bucket: bucket,
      Key: `media/${key}`,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

async function s3Delete(keys: string[]) {
  if (!keys.length) return;
  const { sdk, client, bucket } = await s3();
  for (const key of keys) await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: `media/${key}` }));
}

async function s3Get(key: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!process.env.S3_BUCKET) return null;
  const { sdk, client, bucket } = await s3();
  try {
    const res = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: `media/${key}` }));
    if (!res.Body) return null;
    return { mime: res.ContentType || 'application/octet-stream', data: Buffer.from(await res.Body.transformToByteArray()) };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as Error).name === 'NoSuchKey') return null;
    throw err;
  }
}

interface PendingObject {
  key: string;
  body: Buffer;
  mime: string;
}

// ------------------------------------------------------------------ Processing

interface Processed {
  kind: 'image' | 'document';
  mime: string;
  width: number | null;
  height: number | null;
  main: PendingObject;
  variants: (PendingObject & { w: number; h: number })[];
  og: PendingObject | null;
}

async function processFile(id: string, buf: Buffer, type: Detected, name: string): Promise<Processed> {
  const stem = safeFilename(name);
  if (type.kind === 'document') {
    return { kind: 'document', mime: type.mime, width: null, height: null, main: { key: `${id}/${stem}.${type.ext}`, body: buf, mime: type.mime }, variants: [], og: null };
  }
  if (type.mime === 'image/svg+xml') {
    const text = buf.toString('utf8');
    const problem = svgProblem(text);
    if (problem) throw new UploadError(problem);
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buf).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      /* dimensions are optional for SVG */
    }
    return { kind: 'image', mime: type.mime, width, height, main: { key: `${id}/${stem}.svg`, body: buf, mime: type.mime }, variants: [], og: null };
  }

  let image: ReturnType<typeof sharp>;
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    image = sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000, animated: type.mime === 'image/gif' });
    meta = await image.metadata();
  } catch {
    throw new UploadError('This image could not be read. It may be damaged; try exporting it again.');
  }
  // EXIF orientation 5-8 swaps width and height.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  if (!width || !height) throw new UploadError('This image has no dimensions.');

  if (type.mime === 'image/gif' && (meta.pages ?? 1) > 1) {
    // Keep animated GIFs as they are.
    return { kind: 'image', mime: type.mime, width, height, main: { key: `${id}/${stem}.gif`, body: buf, mime: type.mime }, variants: [], og: null };
  }

  const widths = [...new Set([...VARIANT_WIDTHS.filter((w) => w < width), Math.min(width, FULL_MAX)])].sort((a, b) => a - b);
  const variants = [];
  for (const w of widths) {
    const { data, info } = await sharp(buf, { failOn: 'error', limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4, alphaQuality: 90 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ key: `${id}/${stem}-${w}.webp`, body: data, mime: 'image/webp', w: info.width, h: info.height });
  }
  let og: PendingObject | null = null;
  if (width >= 600) {
    const data = await sharp(buf).rotate().resize(1200, 630, { fit: 'cover', position: 'attention' }).flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    og = { key: `${id}/${stem}-og.jpg`, body: data, mime: 'image/jpeg' };
  }
  const largest = variants[variants.length - 1];
  return { kind: 'image', mime: 'image/webp', width: largest.w, height: largest.h, main: largest, variants, og };
}

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  alt?: string;
  createdBy?: string | null;
  sourceKey?: string | null;
}

/** Validates, optimises and stores a file. Returns the media record. */
export async function storeUpload(input: UploadInput): Promise<MediaRecord> {
  const { buffer, filename } = input;
  if (!buffer.length) throw new UploadError('The file is empty.');
  if (buffer.length > MAX_UPLOAD_BYTES && !input.sourceKey) {
    throw new UploadError(`The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  }
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new UploadError('This file type is not supported. Upload JPG, PNG, WebP, GIF or SVG images, or PDF, Word, Excel, PowerPoint, TXT or CSV documents.');
  }
  const type = detectType(buffer, filename);
  if (!type) throw new UploadError('The file content does not match its extension, or the format is not supported.');

  const id = randomUUID();
  const processed = await processFile(id, buffer, type, filename);
  const objects: PendingObject[] = processed.variants.length ? [...processed.variants] : [processed.main];
  if (processed.og) objects.push(processed.og);
  const driver = storageDriver();
  const display = filename.replace(/[\u0000-\u001f]/g, '').slice(0, 200);
  const totalSize = processed.variants.length ? processed.main.body.length : buffer.length;

  const urlFor = new Map<string, string>();
  if (driver === 'blob') {
    try {
      for (const o of objects) urlFor.set(o.key, await blobPut(o.key, o.body, o.mime));
    } catch (err) {
      await blobDelete([...urlFor.values()]).catch(() => {});
      throw err;
    }
  } else if (driver === 's3') {
    try {
      for (const o of objects) {
        await s3Put(o.key, o.body, o.mime);
        urlFor.set(o.key, `/media/${o.key}`);
      }
    } catch (err) {
      await s3Delete([...urlFor.keys()]).catch(() => {});
      throw err;
    }
  } else {
    for (const o of objects) urlFor.set(o.key, `/media/${o.key}`);
  }

  const variants: Variant[] = processed.variants.map((v) => ({ w: v.w, h: v.h, key: v.key, url: urlFor.get(v.key)!, size: v.body.length }));
  const mainUrl = urlFor.get(processed.main.key)!;
  const ogUrl = processed.og ? urlFor.get(processed.og.key)! : null;

  return transaction(async (tx) => {
    const [row] = await tx.query<MediaRecord>(
      `INSERT INTO media (id, kind, filename, original_name, mime, size, width, height, alt, storage, url, variants, og_url, source_key, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        id,
        processed.kind,
        display,
        display,
        processed.mime,
        totalSize,
        processed.width,
        processed.height,
        (input.alt ?? '').slice(0, 500),
        driver,
        mainUrl,
        JSON.stringify(variants),
        ogUrl,
        input.sourceKey ?? null,
        input.createdBy ?? null,
      ],
    );
    if (driver === 'db') {
      for (const o of objects) {
        await tx.query('INSERT INTO media_blobs (key, media_id, mime, data) VALUES ($1, $2, $3, $4)', [o.key, id, o.mime, o.body]);
      }
    }
    return row;
  });
}

export async function deleteMediaFiles(media: MediaRecord) {
  if (media.storage === 'blob') {
    const urls = [media.url, media.og_url, ...(media.variants ?? []).map((v) => v.url)].filter(Boolean) as string[];
    await blobDelete([...new Set(urls)]);
  }
  if (media.storage === 's3') {
    const keys = [media.url, media.og_url, ...(media.variants ?? []).map((v) => v.url)]
      .filter((u): u is string => Boolean(u && u.startsWith('/media/')))
      .map((u) => u.slice('/media/'.length));
    await s3Delete([...new Set(keys)]);
  }
  await query('DELETE FROM media WHERE id = $1', [media.id]);
}

/** A stored file by key: from Postgres (storage "db") or the S3 bucket (storage "s3"). */
export async function readStoredFile(key: string) {
  const fromDb = await one<{ mime: string; data: Buffer }>('SELECT mime, data FROM media_blobs WHERE key = $1', [key]);
  return fromDb ?? (await s3Get(key));
}

// ------------------------------------------------------------------ Usage

export interface Usage {
  type: string;
  label: string;
  href: string;
}

/** Where a file is used across the website, so unused files can be deleted safely. */
export async function findMediaUsage(id: string): Promise<Usage[]> {
  const like = `%${id}%`;
  const rows = await query<{ type: string; id: string; label: string }>(
    `SELECT 'pages' AS type, id::text, title AS label FROM pages WHERE hero_image = $1 OR og_image = $1 OR content::text LIKE $2 OR body LIKE $2
     UNION ALL SELECT 'news', id::text, title FROM news WHERE image = $1 OR og_image = $1 OR body LIKE $2
     UNION ALL SELECT 'events', id::text, title FROM events WHERE image = $1 OR og_image = $1 OR body LIKE $2
              OR id IN (SELECT event_id FROM event_gallery WHERE media_id = $1)
     UNION ALL SELECT 'team', id::text, name FROM team_members WHERE photo = $1 OR bio LIKE $2
     UNION ALL SELECT 'programmes', id::text, title FROM programmes WHERE image = $1 OR og_image = $1 OR body LIKE $2
     UNION ALL SELECT 'albums', id::text, title FROM albums WHERE cover = $1 OR id IN (SELECT album_id FROM album_photos WHERE media_id = $1)
     UNION ALL SELECT 'partners', id::text, name FROM partners WHERE logo = $1
     UNION ALL SELECT 'settings', key, key FROM settings WHERE value::text LIKE $2`,
    [id, like],
  );
  const settingsHref: Record<string, string> = { home: '/admin/homepage/', site: '/admin/settings/', seo: '/admin/seo/' };
  const settingsLabel: Record<string, string> = { home: 'Homepage', site: 'General settings', seo: 'SEO settings' };
  return rows.map((r) =>
    r.type === 'settings'
      ? { type: 'settings', label: settingsLabel[r.id] ?? r.id, href: settingsHref[r.id] ?? '/admin/settings/' }
      : { type: r.type, label: r.label, href: `/admin/${r.type}/${r.id}/` },
  );
}

/** Loads media records by id, keyed by id. */
export async function mediaByIds(ids: (string | null | undefined)[]): Promise<Record<string, MediaRecord>> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))];
  if (!unique.length) return {};
  const rows = await query<MediaRecord>('SELECT * FROM media WHERE id = ANY($1::uuid[])', [unique]);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

export function publicMedia(m: Row | null | undefined) {
  if (!m) return null;
  return {
    id: m.id as string,
    kind: m.kind as string,
    url: m.url as string,
    mime: m.mime as string,
    width: (m.width as number) ?? null,
    height: (m.height as number) ?? null,
    alt: (m.alt as string) ?? '',
    filename: m.filename as string,
    size: m.size as number,
    variants: ((m.variants as Variant[]) ?? []).map((v) => ({ w: v.w, h: v.h, url: v.url })),
    og_url: (m.og_url as string) ?? null,
  };
}
export type PublicMedia = NonNullable<ReturnType<typeof publicMedia>>;
