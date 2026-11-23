/**
 * First-time setup: creates the first super administrator. Works only while no
 * administrator exists, and only with the secret ADMIN_SETUP_TOKEN that the
 * site owner set in the hosting environment.
 */
import { countAdmins, createAdmin, isEmail, normaliseEmail } from './auth';
import { passwordProblem, rateLimit, safeEqual } from './security';
import { cleanText } from './sanitize';
import { logActivity } from './activity';

export const setupEnabled = () => (process.env.ADMIN_SETUP_TOKEN ?? '').length >= 16;

export interface SetupResult {
  done: boolean;
  error: string;
  name: string;
  email: string;
}

export async function runSetup(form: FormData, ip: string | null | undefined): Promise<SetupResult> {
  const setupToken = process.env.ADMIN_SETUP_TOKEN ?? '';
  const name = cleanText(form.get('name')).slice(0, 120);
  const email = normaliseEmail(form.get('email'));
  const password = String(form.get('password') ?? '');
  const result = (error: string): SetupResult => ({ done: false, error, name, email });
  if (!setupEnabled()) return result('Setup is locked: ADMIN_SETUP_TOKEN is not set on the server.');
  const limit = await rateLimit(`setup:${ip ?? 'unknown'}`, 10, 3600);
  if (!limit.allowed) return result('Too many attempts. Please wait an hour.');
  if (!safeEqual(String(form.get('token') ?? ''), setupToken)) return result('The setup token is incorrect.');
  if (!name) return result('Enter your name.');
  if (!isEmail(email)) return result('Enter a valid email address.');
  if (password !== String(form.get('confirm') ?? '')) return result('The two passwords do not match.');
  const weak = passwordProblem(password, { email, name });
  if (weak) return result(weak);
  if ((await countAdmins()) > 0) return { done: true, error: '', name, email };
  const admin = await createAdmin({ email, name, role: 'super_admin', password });
  await logActivity({ id: admin!.id, name }, { action: 'setup', entityType: 'admin', entityId: admin!.id, entityLabel: email, ip });
  return { done: true, error: '', name, email };
}
