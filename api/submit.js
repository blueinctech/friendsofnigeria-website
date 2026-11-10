/**
 * Form handler for Vercel. Every site form posts here.
 *
 * - Emails each submission to FORM_TO_EMAIL using Resend (RESEND_API_KEY).
 * - Newsletter sign-ups are also added to a Brevo list when BREVO_API_KEY and
 *   BREVO_LIST_ID are set.
 * - Answers JSON to the site's script, or redirects to /thank-you/ when the
 *   browser posted the form without JavaScript.
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY   required, from resend.com
 *   FORM_TO_EMAIL    where submissions go, e.g. contact@friendsofnigeria.net
 *   FORM_FROM_EMAIL  sender on a domain verified in Resend, e.g. website@friendsofnigeria.net
 *   BREVO_API_KEY    optional, newsletter list
 *   BREVO_LIST_ID    optional, numeric Brevo list id
 */

const FORM_NAMES = {
  contact: 'Contact form',
  'membership-enquiry': 'Membership enquiry',
  'fonen-registration': 'FONEN registration',
  newsletter: 'Newsletter sign-up',
};
const LABELS = {
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

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = typeof req.body === 'string' ? req.body : await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
  return Object.fromEntries(new URLSearchParams(raw));
}

function reply(req, res, status, payload) {
  const wantsJson = (req.headers.accept || '').includes('application/json');
  if (wantsJson) return res.status(status).json(payload);
  if (status < 400) {
    res.setHeader('Location', '/thank-you/');
    return res.status(303).end();
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res
    .status(status)
    .send(`<p>${escape(payload.error)} You can also email <a href="mailto:contact@friendsofnigeria.net">contact@friendsofnigeria.net</a>.</p><p><a href="javascript:history.back()">Go back</a></p>`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const data = await readBody(req);
  const form = String(data['form-name'] || '');

  // Spam trap: real visitors never fill this hidden field. Pretend success.
  if (data['company-website-url']) return reply(req, res, 200, { ok: true });

  if (!FORM_NAMES[form]) return reply(req, res, 400, { ok: false, error: 'Unknown form.' });
  const replyTo = data.email || data.contactEmail;
  if (!isEmail(replyTo)) return reply(req, res, 400, { ok: false, error: 'Please enter a valid email address.' });

  const fields = Object.entries(data).filter(([k, v]) => !SKIP.has(k) && String(v).trim() !== '');
  if (fields.some(([, v]) => String(v).length > 5000)) return reply(req, res, 400, { ok: false, error: 'One of the fields is too long.' });

  const { RESEND_API_KEY, FORM_TO_EMAIL, FORM_FROM_EMAIL, BREVO_API_KEY, BREVO_LIST_ID } = process.env;
  if (!RESEND_API_KEY || !FORM_TO_EMAIL || !FORM_FROM_EMAIL) {
    console.error('Form handler is not configured: set RESEND_API_KEY, FORM_TO_EMAIL and FORM_FROM_EMAIL.');
    return reply(req, res, 503, { ok: false, error: 'The form is not connected yet.' });
  }

  const title = FORM_NAMES[form];
  const rows = fields
    .map(([k, v]) => `<tr><th align="left" valign="top" style="padding:6px 16px 6px 0;color:#5f6d73;font-weight:600">${escape(LABELS[k] || k)}</th><td style="padding:6px 0;white-space:pre-wrap">${escape(v)}</td></tr>`)
    .join('');
  const text = fields.map(([k, v]) => `${LABELS[k] || k}: ${v}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Friends of Nigeria website <${FORM_FROM_EMAIL}>`,
        to: FORM_TO_EMAIL.split(',').map((s) => s.trim()),
        reply_to: replyTo,
        subject: `${title}: ${data.name || data.company || data.contactName || replyTo}`,
        html: `<h2 style="font-family:sans-serif">${escape(title)}</h2><table style="font-family:sans-serif;font-size:14px">${rows}</table>`,
        text: `${title}\n\n${text}`,
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);

    if (form === 'newsletter' && BREVO_API_KEY && BREVO_LIST_ID) {
      const b = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: replyTo, listIds: [Number(BREVO_LIST_ID)], updateEnabled: true }),
      });
      if (!b.ok && b.status !== 204) console.error(`Brevo ${b.status}: ${await b.text()}`);
    }
    return reply(req, res, 200, { ok: true });
  } catch (err) {
    console.error(err);
    return reply(req, res, 502, { ok: false, error: 'We could not send your message right now.' });
  }
}
