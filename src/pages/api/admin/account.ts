import type { APIRoute } from 'astro';
import { checkCurrentPassword, destroyAllSessions, setPassword } from '../../../lib/server/auth';
import { query } from '../../../lib/server/db';
import { passwordProblem, rateLimit } from '../../../lib/server/security';
import { cleanText } from '../../../lib/server/sanitize';
import { logActivity } from '../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../lib/server/http';

/** The signed-in administrator updates their own name or password. */
export const PATCH: APIRoute = async (ctx) => {
  const g = guard(ctx, 'dashboard', 'view');
  if (isResponse(g)) return g;
  try {
    const body = await readJson(ctx.request);
    if (body.name !== undefined) {
      const name = cleanText(body.name);
      if (!name || name.length > 120) return fail('Enter a name (up to 120 characters).', 422, { errors: { name: 'Required.' } });
      await query('UPDATE admins SET name = $2, updated_at = now() WHERE id = $1', [g.admin.id, name]);
    }
    if (body.newPassword !== undefined) {
      const limit = await rateLimit(`password-change:${g.admin.id}`, 10, 900);
      if (!limit.allowed) return fail('Too many attempts. Please wait 15 minutes.', 429);
      if (typeof body.currentPassword !== 'string' || !(await checkCurrentPassword(g.admin.id, body.currentPassword))) {
        return fail('Your current password is incorrect.', 422, { errors: { currentPassword: 'Incorrect password.' } });
      }
      const problem = passwordProblem(body.newPassword, g.admin);
      if (problem) return fail(problem, 422, { errors: { newPassword: problem } });
      await setPassword(g.admin.id, body.newPassword as string);
      // Sign out every other device.
      await destroyAllSessions(g.admin.id, g.session.id);
      await logActivity(g.admin, { action: 'password_changed', entityType: 'admin', entityId: g.admin.id, entityLabel: g.admin.email, ip: clientIp(ctx) });
    }
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
