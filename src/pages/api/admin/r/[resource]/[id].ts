import type { APIRoute } from 'astro';
import { resourceFor } from '../../../../../lib/cms/resources';
import { deleteRecord, getRecord, mediaForRecord, saveRecord } from '../../../../../lib/server/crud';
import { logActivity } from '../../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../../lib/server/http';

export const GET: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'view');
  if (isResponse(g)) return g;
  try {
    const row = await getRecord(r, ctx.params.id!);
    if (!row) return fail('Not found.', 404);
    return json({ item: row, media: await mediaForRecord(r, row), publicPath: r.publicPath?.(row) ?? null });
  } catch (err) {
    return handleError(err);
  }
};

export const PUT: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'edit');
  if (isResponse(g)) return g;
  try {
    const body = await readJson(ctx.request, 3_000_000);
    const { row, action, label } = await saveRecord(r, ctx.params.id!, body, { actorId: g.admin.id, confirmSeoClear: body._confirmSeoClear === true });
    await logActivity(g.admin, { action, entityType: r.key, entityId: row.id, entityLabel: label, ip: clientIp(ctx) });
    return json({ ok: true, item: row, media: await mediaForRecord(r, row), publicPath: r.publicPath?.(row) ?? null });
  } catch (err) {
    return handleError(err);
  }
};

export const DELETE: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'delete');
  if (isResponse(g)) return g;
  try {
    const { label } = await deleteRecord(r, ctx.params.id!);
    await logActivity(g.admin, { action: 'delete', entityType: r.key, entityId: ctx.params.id, entityLabel: label, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
