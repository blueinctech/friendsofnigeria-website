import type { APIRoute } from 'astro';
import { one, query } from '../../../../lib/server/db';
import { ENQUIRY_STATUSES, ENQUIRY_TYPE_LABELS, getEnquiry } from '../../../../lib/server/enquiries';
import { cleanText } from '../../../../lib/server/sanitize';
import { logActivity } from '../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../lib/server/http';

export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'enquiries', 'view');
  if (isResponse(g)) return g;
  try {
    const item = await getEnquiry(ctx.params.id!);
    return item ? json({ item }) : fail('Not found.', 404);
  } catch (err) {
    return handleError(err);
  }
};

/** Update status (pending, contacted, resolved) and internal notes. */
export const PATCH: APIRoute = async (ctx) => {
  const g = guard(ctx, 'enquiries', 'edit');
  if (isResponse(g)) return g;
  try {
    const item = await getEnquiry(ctx.params.id!);
    if (!item) return fail('Not found.', 404);
    const body = await readJson(ctx.request);
    const status = body.status === undefined ? item.status : String(body.status);
    if (!ENQUIRY_STATUSES.includes(status)) return fail('Choose pending, contacted or resolved.', 422);
    const notes = body.notes === undefined ? item.notes : cleanText(body.notes, true).slice(0, 5000);
    await query('UPDATE enquiries SET status = $2, notes = $3, handled_by = $4, updated_at = now() WHERE id = $1', [item.id, status, notes || null, g.admin.id]);
    if (status !== item.status) {
      await logActivity(g.admin, {
        action: 'status',
        entityType: 'enquiry',
        entityId: item.id,
        entityLabel: `${ENQUIRY_TYPE_LABELS[item.type]} from ${item.name || item.email}`,
        details: { from: item.status, to: status },
        ip: clientIp(ctx),
      });
    }
    return json({ ok: true, item: await getEnquiry(item.id) });
  } catch (err) {
    return handleError(err);
  }
};

export const DELETE: APIRoute = async (ctx) => {
  const g = guard(ctx, 'enquiries', 'delete');
  if (isResponse(g)) return g;
  try {
    const item = await one('SELECT id, type, name, email FROM enquiries WHERE id = $1::uuid', [ctx.params.id]).catch(() => null);
    if (!item) return fail('Not found.', 404);
    await query('DELETE FROM enquiries WHERE id = $1', [item.id]);
    await logActivity(g.admin, { action: 'delete', entityType: 'enquiry', entityId: item.id, entityLabel: `${ENQUIRY_TYPE_LABELS[item.type]} from ${item.name || item.email}`, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
