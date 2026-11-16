import type { APIRoute } from 'astro';
import { one } from '../../../../lib/server/db';
import { deleteMediaFiles, findMediaUsage, publicMedia, type MediaRecord } from '../../../../lib/server/media';
import { cleanText } from '../../../../lib/server/sanitize';
import { isUuid } from '../../../../lib/server/validate';
import { logActivity } from '../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../lib/server/http';

const load = (id: string) => (isUuid(id) ? one<MediaRecord>('SELECT * FROM media WHERE id = $1', [id]) : Promise.resolve(null));

export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'media', 'view');
  if (isResponse(g)) return g;
  try {
    const m = await load(ctx.params.id!);
    if (!m) return fail('Not found.', 404);
    const uploader = m.created_by ? await one('SELECT name FROM admins WHERE id = $1', [m.created_by]) : null;
    return json({ item: { ...publicMedia(m), created_at: m.created_at, uploaded_by: uploader?.name ?? null, original_name: m.original_name }, usage: await findMediaUsage(m.id) });
  } catch (err) {
    return handleError(err);
  }
};

/** Rename a file or change its alt text. */
export const PATCH: APIRoute = async (ctx) => {
  const g = guard(ctx, 'media', 'edit');
  if (isResponse(g)) return g;
  try {
    const m = await load(ctx.params.id!);
    if (!m) return fail('Not found.', 404);
    const body = await readJson(ctx.request);
    const filename = body.filename !== undefined ? cleanText(body.filename) : m.filename;
    const alt = body.alt !== undefined ? cleanText(body.alt) : m.alt;
    if (!filename) return fail('The file name cannot be empty.', 422, { errors: { filename: 'Enter a name.' } });
    if (filename.length > 200 || alt.length > 500) return fail('The name or description is too long.', 422);
    const updated = await one<MediaRecord>('UPDATE media SET filename = $2, alt = $3, updated_at = now() WHERE id = $1 RETURNING *', [m.id, filename, alt]);
    await logActivity(g.admin, { action: 'update', entityType: 'media', entityId: m.id, entityLabel: filename, ip: clientIp(ctx) });
    return json({ ok: true, item: { ...publicMedia(updated), created_at: updated!.created_at } });
  } catch (err) {
    return handleError(err);
  }
};

/** Deletes a file that is not used anywhere on the website. */
export const DELETE: APIRoute = async (ctx) => {
  const g = guard(ctx, 'media', 'delete');
  if (isResponse(g)) return g;
  try {
    const m = await load(ctx.params.id!);
    if (!m) return fail('Not found.', 404);
    const usage = await findMediaUsage(m.id);
    if (usage.length) return fail('This file is still used on the website. Replace it in the places listed before deleting it.', 409, { usage });
    await deleteMediaFiles(m);
    await logActivity(g.admin, { action: 'delete', entityType: 'media', entityId: m.id, entityLabel: m.filename, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
