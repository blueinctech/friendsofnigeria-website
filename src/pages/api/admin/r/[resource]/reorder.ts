import type { APIRoute } from 'astro';
import { resourceFor } from '../../../../../lib/cms/resources';
import { reorderRecords } from '../../../../../lib/server/crud';
import { logActivity } from '../../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../../lib/server/http';

/** Saves a new order: { ids: [...] } in display order. */
export const POST: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'edit');
  if (isResponse(g)) return g;
  try {
    const body = await readJson<{ ids: unknown }>(ctx.request);
    await reorderRecords(r, body.ids);
    await logActivity(g.admin, { action: 'reorder', entityType: r.key, entityLabel: r.label, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
