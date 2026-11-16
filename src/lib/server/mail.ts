/**
 * Transactional email through Resend (the same account the site's forms use).
 *
 *   RESEND_API_KEY   from resend.com
 *   FORM_FROM_EMAIL  sender on a domain verified in Resend
 */
export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.FORM_FROM_EMAIL);

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  fromName?: string;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const { RESEND_API_KEY, FORM_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !FORM_FROM_EMAIL) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${mail.fromName ?? 'Friends of Nigeria website'} <${FORM_FROM_EMAIL}>`,
      to: Array.isArray(mail.to) ? mail.to : [mail.to],
      reply_to: mail.replyTo,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  });
  if (!res.ok) {
    console.error(`[mail] Resend ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
