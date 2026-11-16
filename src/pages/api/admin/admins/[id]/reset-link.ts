import type { APIRoute } from 'astro';
import { getAdmin } from '../../../../../lib/server/auth';
import { issuePasswordLink } from '../../../../../lib/server/admins';
import { isUuid } from '../../../../../lib/server/validate';
import { logActivity } from '../../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json } from '../../../../../lib/server/http';

/** Creates a one-time "choose a new password" link for another administrator. */
export const POST: APIRoute = async (ctx) => {
  const g = guard(ctx, 'admins', 'edit');
  if (isResponse(g)) return g;
  try {
    const id = ctx.params.id!;
    const target = isUuid(id) ? await getAdmin(id) : null;
    if (!target) return fail('Not found.', 404);
    if (!target.active) return fail('Enable this account first.', 400);
    const result = await issuePasswordLink(target, ctx.url.origin, { createdBy: g.admin.id, welcome: false });
    await logActivity(g.admin, { action: 'reset_link_created', entityType: 'admin', entityId: target.id, entityLabel: `${target.name} (${target.email})`, ip: clientIp(ctx) });
    return json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
};
