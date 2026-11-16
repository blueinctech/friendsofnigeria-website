import type { APIRoute } from 'astro';
import { ASSIGNABLE_MODULES, type Role } from '../../../../../lib/cms/permissions';
import { destroyAllSessions, getAdmin } from '../../../../../lib/server/auth';
import { activeSuperAdminCount } from '../../../../../lib/server/admins';
import { query } from '../../../../../lib/server/db';
import { cleanText } from '../../../../../lib/server/sanitize';
import { isUuid } from '../../../../../lib/server/validate';
import { logActivity } from '../../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../../lib/server/http';

const ROLES: Role[] = ['super_admin', 'editor', 'content_manager'];

/** Change name, role, assigned modules or active state. */
export const PATCH: APIRoute = async (ctx) => {
  const g = guard(ctx, 'admins', 'edit');
  if (isResponse(g)) return g;
  try {
    const id = ctx.params.id!;
    const target = isUuid(id) ? await getAdmin(id) : null;
    if (!target) return fail('Not found.', 404);
    const body = await readJson(ctx.request);
    const name = body.name === undefined ? target.name : cleanText(body.name);
    const role = (body.role === undefined ? target.role : body.role) as Role;
    const active = body.active === undefined ? target.active : body.active === true;
    if (!name || name.length > 120) return fail('Enter a name (up to 120 characters).', 422, { errors: { name: 'Required.' } });
    if (!ROLES.includes(role)) return fail('Choose a role.', 422);
    const modules =
      role === 'content_manager' ? (Array.isArray(body.modules) ? body.modules : target.modules).filter((m: string) => ASSIGNABLE_MODULES.some((a) => a.key === m)) : [];
    if (role === 'content_manager' && !modules.length) return fail('Choose at least one module for a content manager.', 422, { errors: { modules: 'Required.' } });

    if (target.id === g.admin.id && (role !== target.role || !active)) {
      return fail('You cannot change your own role or disable your own account. Ask another super administrator.', 400);
    }
    if (target.role === 'super_admin' && (role !== 'super_admin' || !active) && (await activeSuperAdminCount(target.id)) === 0) {
      return fail('At least one active super administrator is required.', 400);
    }
    await query('UPDATE admins SET name = $2, role = $3, modules = $4, active = $5, updated_at = now() WHERE id = $1', [target.id, name, role, modules, active]);
    if (!active) await destroyAllSessions(target.id);
    await logActivity(g.admin, {
      action: 'update',
      entityType: 'admin',
      entityId: target.id,
      entityLabel: `${name} (${target.email})`,
      details: { role, modules, active },
      ip: clientIp(ctx),
    });
    return json({ ok: true, item: await getAdmin(target.id) });
  } catch (err) {
    return handleError(err);
  }
};

export const DELETE: APIRoute = async (ctx) => {
  const g = guard(ctx, 'admins', 'delete');
  if (isResponse(g)) return g;
  try {
    const id = ctx.params.id!;
    const target = isUuid(id) ? await getAdmin(id) : null;
    if (!target) return fail('Not found.', 404);
    if (target.id === g.admin.id) return fail('You cannot delete your own account.', 400);
    if (target.role === 'super_admin' && (await activeSuperAdminCount(target.id)) === 0) return fail('At least one active super administrator is required.', 400);
    await query('DELETE FROM admins WHERE id = $1', [target.id]);
    await logActivity(g.admin, { action: 'delete', entityType: 'admin', entityId: target.id, entityLabel: `${target.name} (${target.email})`, ip: clientIp(ctx) });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
};
