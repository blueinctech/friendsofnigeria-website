import type { APIRoute } from 'astro';
import { resourceFor } from '../../../../lib/cms/resources';
import { referenceOptions } from '../../../../lib/server/crud';
import { fail, guard, handleError, isResponse, json } from '../../../../lib/server/http';

/** Options for "choose a category / board / event" fields. Any signed-in administrator may read labels. */
export const GET: APIRoute = async (ctx) => {
  const r = resourceFor(ctx.params.resource!);
  if (!r) return fail('Not found.', 404);
  const g = guard(ctx, 'dashboard', 'view');
  if (isResponse(g)) return g;
  try {
    return json({ options: await referenceOptions(r.key) });
  } catch (err) {
    return handleError(err);
  }
};
