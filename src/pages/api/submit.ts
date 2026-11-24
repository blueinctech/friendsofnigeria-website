/**
 * Handles every website form (contact, membership enquiry, FONEN registration,
 * newsletter). Each submission is saved to the database, where it appears in
 * the dashboard, and emailed to the team when Resend is configured.
 *
 * Answers JSON to the site's script, or redirects to /thank-you/ when the
 * browser posted the form without JavaScript.
 */
import type { APIRoute } from 'astro';
import { query } from '../../lib/server/db';
import { escapeHtml, sendMail } from '../../lib/server/mail';
import { rateLimit } from '../../lib/server/security';
import { cleanText } from '../../lib/server/sanitize';
import { getSettings } from '../../lib/server/settings';
import { clientIp } from '../../lib/server/http';
import { sha256 } from '../../lib/server/security';

const FORMS: Record<string, { title: string; type: string }> = {
  contact: { title: 'Contact form', type: 'contact' },
  'membership-enquiry': { title: 'Membership enquiry', type: 'membership' },
  'fonen-registration': { title: 'FONEN registration', type: 'fonen' },
  newsletter: { title: 'Newsletter sign-up', type: 'newsletter' },
};
const LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  topic: 'Subject',
  message: 'Message',
  programme: 'Programme',
  organisation: 'Organisation',
  country: 'Country',
  category: 'Membership category',
  company: 'Company',
  website: 'Website',
  sector: 'Sector',
  turnover: 'Annual turnover',
  address: 'Address',
  postcode: 'Postal code',
  contactName: 'Contact person',
  contactPhone: 'Contact phone',
  contactEmail: 'Contact email',
  consent: 'Consent given',
};
const SKIP = new Set(['form-name', 'company-website-url']);
const isEmail = (s: unknown) => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function reply(request: Request, status: number, payload: { ok: boolean; error?: string }) {
  const wantsJson = (request.headers.get('accept') || '').includes('application/json');
  if (wantsJson) return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (status < 400) return new Response(null, { status: 303, headers: { Location: '/thank-you/' } });
  return new Response(
    `<p>${escapeHtml(payload.error)} You can also email <a href="mailto:contact@friendsofnigeria.net">contact@friendsofnigeria.net</a>.</p><p><a href="javascript:history.back()">Go back</a></p>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export const POST: APIRoute = async (ctx) => {
  const { request } = ctx;
  let data: Record<string, string>;
  try {
    const form = await request.formData();
    data = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  } catch {
    return reply(request, 400, { ok: false, error: 'The form could not be read.' });
  }
  const formName = String(data['form-name'] || '');

  // Spam trap: real visitors never fill this hidden field. Pretend success.
  if (data['company-website-url']) return reply(request, 200, { ok: true });
  const form = FORMS[formName];
  if (!form) return reply(request, 400, { ok: false, error: 'Unknown form.' });

  const email = cleanText(data.email || data.contactEmail).toLowerCase();
  if (!isEmail(email)) return reply(request, 400, { ok: false, error: 'Please enter a valid email address.' });

  const fields = Object.entries(data)
    .filter(([k, v]) => !SKIP.has(k) && String(v).trim() !== '' && k.length <= 40)
    .map(([k, v]) => [k, cleanText(v, true)] as const);
  if (fields.length > 40 || fields.some(([, v]) => v.length > 5000)) return reply(request, 400, { ok: false, error: 'One of the fields is too long.' });

  try {
    const ip = clientIp(ctx) ?? 'unknown';
    const limit = await rateLimit(`form:${formName}:${sha256(ip)}`, 8, 600);
    if (!limit.allowed) return reply(request, 429, { ok: false, error: 'You have sent several messages in a short time. Please wait a few minutes and try again.' });

    const values = Object.fromEntries(fields);
    const [row] = await query<{ id: string }>(
      `INSERT INTO enquiries (type, name, email, phone, organisation, subject, message, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        form.type,
        values.name || values.contactName || values.company || null,
        email,
        values.phone || values.contactPhone || null,
        values.organisation || values.company || null,
        values.topic || values.programme || values.category || null,
        values.message || null,
        JSON.stringify(values),
      ],
    );

    // Email the team (optional: submissions are already saved).
    const site = await getSettings('site');
    // Each form has its own recipients (as on the old WordPress site), then a shared fallback.
    const perForm = { contact: site.notify_email_contact, membership: site.notify_email_contact, fonen: site.notify_email_fonen, newsletter: site.notify_email_newsletter }[form.type];
    const to = String(perForm || site.notify_email || process.env.FORM_TO_EMAIL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(isEmail);
    const notify = form.type !== 'newsletter' || site.newsletter_notify !== false;
    if (to.length && notify) {
      const rows = fields
        .map(([k, v]) => `<tr><th align="left" valign="top" style="padding:6px 16px 6px 0;color:#5f6d73;font-weight:600">${escapeHtml(LABELS[k] || k)}</th><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`)
        .join('');
      const sent = await sendMail({
        to,
        replyTo: email,
        subject: `${form.title}: ${values.name || values.company || values.contactName || email}`,
        html: `<h2 style="font-family:sans-serif">${escapeHtml(form.title)}</h2><table style="font-family:sans-serif;font-size:14px">${rows}</table><p style="font-family:sans-serif;font-size:13px;color:#5f6d73">Also saved in the website dashboard.</p>`,
        text: `${form.title}\n\n${fields.map(([k, v]) => `${LABELS[k] || k}: ${v}`).join('\n')}`,
      }).catch((err) => {
        console.error('[submit] email failed', err);
        return false;
      });
      if (sent) await query('UPDATE enquiries SET email_sent = true WHERE id = $1', [row.id]);
    }

    const { BREVO_API_KEY, BREVO_LIST_ID } = process.env;
    if (form.type === 'newsletter' && BREVO_API_KEY && BREVO_LIST_ID) {
      const b = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, listIds: [Number(BREVO_LIST_ID)], updateEnabled: true }),
      }).catch(() => null);
      if (b && !b.ok && b.status !== 204) console.error(`[submit] Brevo ${b.status}: ${await b.text()}`);
    }
    return reply(request, 200, { ok: true });
  } catch (err) {
    console.error('[submit]', err);
    return reply(request, 502, { ok: false, error: 'We could not send your message right now.' });
  }
};
