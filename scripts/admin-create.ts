/**
 * Creates an administrator from the command line. The password is typed at a
 * hidden prompt (or read from ADMIN_PASSWORD for automated setups), never
 * passed as an argument, so it does not end up in shell history.
 *
 *   npm run admin:create
 *   npm run admin:create -- --email jane@example.org --name "Jane Doe" --role super_admin
 *
 * Roles: super_admin (default), editor, content_manager.
 */
import { createAdmin, isEmail, normaliseEmail } from '../src/lib/server/auth.ts';
import { logActivity } from '../src/lib/server/activity.ts';
import { closePool, databaseUrl, one } from '../src/lib/server/db.ts';
import { passwordProblem } from '../src/lib/server/security.ts';
import type { Role } from '../src/lib/cms/permissions.ts';
import { arg, ask, askHidden } from './_prompt.ts';

const ROLES: Role[] = ['super_admin', 'editor', 'content_manager'];

async function main() {
  if (!databaseUrl()) throw new Error('DATABASE_URL is not set.');
  const email = normaliseEmail(arg('email') ?? process.env.ADMIN_EMAIL ?? (await ask('Email: ')));
  if (!isEmail(email)) throw new Error('That is not a valid email address.');
  if (await one('SELECT 1 FROM admins WHERE lower(email) = $1', [email])) throw new Error('An administrator with that email already exists. Use npm run admin:reset-password instead.');
  const name = (arg('name') ?? process.env.ADMIN_NAME ?? (await ask('Full name: '))).trim();
  if (!name) throw new Error('A name is required.');
  const role = (arg('role') ?? process.env.ADMIN_ROLE ?? 'super_admin') as Role;
  if (!ROLES.includes(role)) throw new Error(`Role must be one of: ${ROLES.join(', ')}.`);

  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('Password (at least 12 characters): ');
    const again = await askHidden('Repeat the password: ');
    if (password !== again) throw new Error('The two passwords do not match.');
  }
  const problem = passwordProblem(password, { email, name });
  if (problem) throw new Error(problem);

  const admin = await createAdmin({ email, name, role, password });
  await logActivity(null, { action: 'create', entityType: 'admin', entityId: admin!.id, entityLabel: `${email} (command line)` });
  console.log(`✔ Created ${role.replace('_', ' ')} ${email}. Sign in at /admin/login/.`);
}

main()
  .catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
