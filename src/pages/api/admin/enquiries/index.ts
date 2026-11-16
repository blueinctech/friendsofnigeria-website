import type { APIRoute } from 'astro';
import { listEnquiries } from '../../../../lib/server/enquiries';
import { guard, handleError, isResponse, json } from '../../../../lib/server/http';

/** ?group=membership|contact|newsletter&q=&status=&from=&to=&page= */
export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'enquiries', 'view');
  if (isResponse(g)) return g;
  try {
    const sp = ctx.url.searchParams;
    return json(
      await listEnquiries(
        { group: sp.get('group') ?? 'contact', q: sp.get('q') ?? '', status: sp.get('status') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', type: sp.get('type') ?? '' },
        Number(sp.get('page') || 1),
        Number(sp.get('perPage') || 25),
      ),
    );
  } catch (err) {
    return handleError(err);
  }
};
