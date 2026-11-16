import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { ASSIGNABLE_MODULES, type Role } from '../../../../lib/cms/permissions';
import { createAdmin, isEmail, normaliseEmail } from '../../../../lib/server/auth';
import { issuePasswordLink, listAdmins } from '../../../../lib/server/admins';
import { isUniqueViolation } from '../../../../lib/server/db';
import { cleanText } from '../../../../lib/server/sanitize';
import { logActivity } from '../../../../lib/server/activity';
import { clientIp, fail, guard, handleError, isResponse, json, readJson } from '../../../../lib/server/http';

const ROLES: Role[] = ['super_admin', 'editor', 'content_manager'];
const cleanModules = (v: unknown) => (Array.isArray(v) ? v.filter((m) => ASSIGNABLE_MODULES.some((a) => a.key === m)) : []) as string[];

export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'admins', 'view');
  if (isResponse(g)) return g;
  try {
    return json({ items: await listAdmins() });
  } catch (err) {
    return handleError(err);
  }
};

/** Invites a new administrator: the account gets a one-time link to choose a password. */
export const POST: APIRoute = async (ctx) => {
  const g = guard(ctx, 'admins', 'create');
  if (isResponse(g)) return g;
  try {
    const body = await readJson(ctx.request);
    const email = normaliseEmail(body.email);
    const name = cleanText(body.name);
    const role = body.role as Role;
    const errors: Record<string, string> = {};
    if (!isEmail(email)) errors.email = 'Enter a valid email address.';
    if (!name || name.length > 120) errors.name = 'Enter a name (up to 120 characters).';
    if (!ROLES.includes(role)) errors.role = 'Choose a role.';
    const modules = role === 'content_manager' ? cleanModules(body.modules) : [];
    if (role === 'content_manager' && !modules.length) errors.modules = 'Choose at least one module for a content manager.';
    if (Object.keys(errors).length) return fail('Please correct the highlighted fields.', 422, { errors });

    // A random password nobody knows; the invitee sets their own through the link.
    let admin;
    try {
      admin = await createAdmin({ email, name, role, modules, password: randomBytes(32).toString('base64url') + 'Aa1!' });
    } catch (err) {
      if (isUniqueViolation(err)) return fail('An administrator with this email already exists.', 409, { errors: { email: 'Already used by another administrator.' } });
      throw err;
    }
    const link = await issuePasswordLink(admin!, ctx.url.origin, { createdBy: g.admin.id, welcome: true });
    await logActivity(g.admin, { action: 'create', entityType: 'admin', entityId: admin!.id, entityLabel: `${name} (${email})`, details: { role, modules }, ip: clientIp(ctx) });
    return json({ ok: true, item: admin, ...link }, 201);
  } catch (err) {
    return handleError(err);
  }
};
