import type { APIRoute } from 'astro';
import { resourceFor } from '../../../../../lib/cms/resources';
import { listRecords, saveRecord } from '../../../../../lib/server/crud';
import { logActivity } from '../../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../../lib/server/http';

/** List records with search, filters, sorting and pagination. */
export const GET: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'view');
  if (isResponse(g)) return g;
  try {
    const sp = ctx.url.searchParams;
    const filters: Record<string, string> = {};
    for (const f of r.filters ?? []) if (sp.get(f.name)) filters[f.name] = sp.get(f.name)!;
    return json(
      await listRecords(r, { q: sp.get('q') ?? '', filters, page: Number(sp.get('page') || 1), perPage: Number(sp.get('perPage') || 25), sort: sp.get('sort') ?? '' }),
    );
  } catch (err) {
    return handleError(err);
  }
};

/** Create a record. */
export const POST: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, r.module, 'create');
  if (isResponse(g)) return g;
  try {
    const body = await readJson(ctx.request, 3_000_000);
    const { row, label } = await saveRecord(r, null, body, { actorId: g.admin.id, confirmSeoClear: body._confirmSeoClear === true });
    const ip = clientIp(ctx);
    await logActivity(g.admin, { action: 'create', entityType: r.key, entityId: row.id, entityLabel: label, ip });
    if (row.status === 'published') await logActivity(g.admin, { action: 'publish', entityType: r.key, entityId: row.id, entityLabel: label, ip });
    return json({ ok: true, item: row }, 201);
  } catch (err) {
    return handleError(err);
  }
};
