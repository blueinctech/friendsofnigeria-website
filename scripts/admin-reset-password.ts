/**
 * Sets a new password for an existing administrator and signs them out
 * everywhere. Use it if every super administrator is locked out.
 *
 *   npm run admin:reset-password -- --email jane@example.org
 */
import { destroyAllSessions, normaliseEmail, setPassword } from '../src/lib/server/auth.ts';
import { logActivity } from '../src/lib/server/activity.ts';
import { closePool, databaseUrl, one, query } from '../src/lib/server/db.ts';
import { passwordProblem } from '../src/lib/server/security.ts';
import { arg, ask, askHidden } from './_prompt.ts';

async function main() {
  if (!databaseUrl()) throw new Error('DATABASE_URL is not set.');
  const email = normaliseEmail(arg('email') ?? (await ask('Email of the administrator: ')));
  const admin = await one<{ id: string; name: string; email: string }>('SELECT id, name, email FROM admins WHERE lower(email) = $1', [email]);
  if (!admin) throw new Error('No administrator uses that email address.');
  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await askHidden('New password (at least 12 characters): ');
    const again = await askHidden('Repeat the password: ');
    if (password !== again) throw new Error('The two passwords do not match.');
  }
  const problem = passwordProblem(password, admin);
  if (problem) throw new Error(problem);
  await setPassword(admin.id, password);
  await destroyAllSessions(admin.id);
  await query('UPDATE admins SET active = true WHERE id = $1', [admin.id]);
  await logActivity(null, { action: 'password_reset', entityType: 'admin', entityId: admin.id, entityLabel: `${admin.email} (command line)` });
  console.log(`✔ Password updated for ${admin.email}. The account is active and all its sessions were signed out.`);
}

main()
  .catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
