import type { APIRoute } from 'astro';
import { query, one } from '../../../../lib/server/db';
import { MAX_UPLOAD_BYTES, publicMedia, storeUpload, UploadError } from '../../../../lib/server/media';
import { logActivity } from '../../../../lib/server/activity';
import { rateLimit } from '../../../../lib/server/security';
import { clientIp, fail, guard, handleError, isResponse, json } from '../../../../lib/server/http';

/** Lists the media library: ?q=search&kind=image|document&missingAlt=1&page=1 */
export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'media', 'view');
  if (isResponse(g)) return g;
  try {
    const sp = ctx.url.searchParams;
    const where: string[] = [];
    const args: unknown[] = [];
    const q = (sp.get('q') ?? '').trim().slice(0, 100);
    if (q) {
      args.push(`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
      where.push(`(filename ILIKE $${args.length} OR alt ILIKE $${args.length})`);
    }
    const kind = sp.get('kind');
    if (kind === 'image' || kind === 'document') {
      args.push(kind);
      where.push(`kind = $${args.length}`);
    }
    if (sp.get('missingAlt')) where.push(`kind = 'image' AND alt = ''`);
    const perPage = Math.min(Number(sp.get('perPage') || 48), 120);
    const page = Math.max(Number(sp.get('page') || 1), 1);
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      query(`SELECT * FROM media ${w} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, args),
      one<{ n: number }>(`SELECT count(*)::int AS n FROM media ${w}`, args),
    ]);
    return json({ items: rows.map((r) => ({ ...publicMedia(r), created_at: r.created_at })), total: count?.n ?? 0, page, perPage, maxBytes: MAX_UPLOAD_BYTES });
  } catch (err) {
    return handleError(err);
  }
};

/** Uploads one file (multipart field "file", optional "alt"). */
export const POST: APIRoute = async (ctx) => {
  const g = guard(ctx, 'media', 'create');
  if (isResponse(g)) return g;
  try {
    const limit = await rateLimit(`upload:${g.admin.id}`, 120, 600);
    if (!limit.allowed) return fail('Too many uploads in a short time. Please wait a few minutes.', 429);
    const length = Number(ctx.request.headers.get('content-length') || 0);
    if (length > MAX_UPLOAD_BYTES + 64 * 1024) return fail(`The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, 413);
    const form = await ctx.request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Choose a file to upload.', 400);
    const buffer = Buffer.from(await file.arrayBuffer());
    const record = await storeUpload({ buffer, filename: file.name || 'upload', alt: String(form.get('alt') ?? '').trim(), createdBy: g.admin.id });
    await logActivity(g.admin, { action: 'upload', entityType: 'media', entityId: record.id, entityLabel: record.filename, ip: clientIp(ctx) });
    return json({ ok: true, item: { ...publicMedia(record), created_at: record.created_at } }, 201);
  } catch (err) {
    if (err instanceof UploadError) return fail(err.message, 400);
    return handleError(err);
  }
};
