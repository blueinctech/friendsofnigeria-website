/**
 * Administrator management helpers used by the dashboard and the scripts.
 */
import { query, one } from './db.ts';
import { createResetToken } from './auth.ts';
import { escapeHtml, mailConfigured, sendMail } from './mail.ts';
import { paragraph, renderEmail } from './email-template.ts';

export async function activeSuperAdminCount(excludeId?: string) {
  const row = await one<{ n: number }>(`SELECT count(*)::int AS n FROM admins WHERE role = 'super_admin' AND active AND id IS DISTINCT FROM $1`, [excludeId ?? null]);
  return row?.n ?? 0;
}

export async function listAdmins() {
  return query(`SELECT id, email, name, role, modules, active, last_login_at, created_at FROM admins ORDER BY created_at`);
}

/**
 * Creates a password link for an administrator (new account or reset) and
 * emails it when email is configured. Returns the link so a super
 * administrator can pass it on securely if email is not set up.
 */
export async function issuePasswordLink(admin: { id: string; email: string; name: string }, origin: string, opts: { createdBy: string | null; welcome: boolean; hours?: number }) {
  const hours = opts.hours ?? (opts.welcome ? 72 : 24);
  const token = await createResetToken(admin.id, hours, opts.createdBy);
  const link = `${origin}/admin/reset-password/?token=${encodeURIComponent(token)}`;
  let emailed = false;
  if (mailConfigured()) {
    const subject = opts.welcome ? 'Your Friends of Nigeria website account' : 'Set a new password for the Friends of Nigeria website';
    const intro = opts.welcome
      ? 'An administrator account has been created for you on the Friends of Nigeria website dashboard.'
      : 'A password reset was requested for your Friends of Nigeria website dashboard account.';
    emailed = await sendMail({
      to: admin.email,
      subject,
      fromName: 'Friends of Nigeria website',
      html: renderEmail({
        preheader: opts.welcome ? 'Set your password to start using the website dashboard.' : 'Use this link to choose a new password.',
        eyebrow: 'Website dashboard',
        heading: opts.welcome ? 'Welcome to the website dashboard' : 'Choose a new password',
        body: paragraph(`Hello ${escapeHtml(admin.name)},`) + paragraph(escapeHtml(intro)),
        buttons: [{ label: 'Choose your password', href: link }],
        note: `This link works once and expires in ${hours} hours. If you did not expect this email, you can ignore it.`,
      }),
      text: `Hello ${admin.name},\n\n${intro}\n\nChoose your password: ${link}\n\nThis link works once and expires in ${hours} hours. If you did not expect this email, you can ignore it.`,
    });
  }
  return { link, emailed, hours };
}
