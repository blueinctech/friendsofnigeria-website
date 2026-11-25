/**
 * The look of every email the website sends, matching the site: white card on
 * the site's paper background, logo, Inter type, green pill buttons and a slate
 * footer with the organisation's details.
 *
 * Email clients ignore most modern CSS, so this is table layout with inline
 * styles only. Images use a PNG copy of the logo (public/email/fon-logo.png),
 * because Outlook cannot show WebP.
 */
import { escapeHtml } from './mail.ts';

// Same as `site` in astro.config.mjs. Plain constant so the Node scripts can import this file too.
export const SITE_URL = 'https://friendsofnigeria.net';

const C = {
  paper: '#f7f8f6',
  card: '#ffffff',
  ink: '#121e22',
  ink2: '#46555c',
  ink3: '#5f6d73',
  line: '#e4e7e5',
  green: '#0b9444',
  greenInk: '#087a38',
  greenTint: '#eef8f2',
  slate: '#121e22',
};
const FONT = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailButton {
  label: string;
  href: string;
  /** "primary" is the green pill; "secondary" is outlined. */
  style?: 'primary' | 'secondary';
}

export interface EmailContent {
  /** Short line shown next to the subject in the inbox list. */
  preheader: string;
  /** Small green label above the heading, e.g. "New website enquiry". */
  eyebrow?: string;
  heading: string;
  /** Already-escaped HTML for the body (use the helpers below). */
  body: string;
  buttons?: EmailButton[];
  /** Small print under the buttons. */
  note?: string;
}

export const paragraph = (html: string) =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.ink2}">${html}</p>`;

/** Label/value rows, like the dashboard's enquiry view. Values are escaped here. */
export function detailsTable(rows: [string, string][]) {
  const tr = rows
    .map(
      ([label, value], i) => `<tr>
  <td valign="top" style="padding:12px 16px 12px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:13px;line-height:1.5;font-weight:600;color:${C.ink3};width:150px">${escapeHtml(label)}</td>
  <td valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:15px;line-height:1.5;color:${C.ink};white-space:pre-wrap;word-break:break-word">${linkify(label, value)}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">${tr}</table>`;
}

/** A tinted box for a visitor's message. */
export const messageBox = (label: string, text: string) =>
  `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;font-weight:600;color:${C.ink3}">${escapeHtml(label)}</p>
<div style="margin:0 0 24px;padding:16px 18px;background:${C.greenTint};border-left:3px solid ${C.green};border-radius:8px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(text)}</div>`;

function linkify(label: string, value: string) {
  const v = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `<a href="mailto:${escapeHtml(v)}" style="color:${C.greenInk};text-decoration:none">${escapeHtml(v)}</a>`;
  if (/^https?:\/\/\S+$/.test(v)) return `<a href="${escapeHtml(v)}" style="color:${C.greenInk};text-decoration:none">${escapeHtml(v)}</a>`;
  if (/phone/i.test(label) && /^[0-9 +.\-()]{6,24}$/.test(v)) return `<a href="tel:${escapeHtml(v.replace(/[^0-9+]/g, ''))}" style="color:${C.greenInk};text-decoration:none">${escapeHtml(v)}</a>`;
  return escapeHtml(v);
}

function button(b: EmailButton) {
  const primary = (b.style ?? 'primary') === 'primary';
  const bg = primary ? C.green : C.card;
  const fg = primary ? '#ffffff' : C.greenInk;
  const border = primary ? C.green : C.green;
  return `<td style="padding:0 12px 12px 0">
  <a href="${escapeHtml(b.href)}" style="display:inline-block;padding:13px 24px;background:${bg};color:${fg};border:1.5px solid ${border};border-radius:999px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;text-decoration:none">${escapeHtml(b.label)}</a>
</td>`;
}

export function renderEmail(c: EmailContent) {
  const buttons = c.buttons?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px"><tr>${c.buttons.map(button).join('')}</tr></table>`
    : '';
  const note = c.note ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.ink3}">${escapeHtml(c.note)}</p>` : '';
  const eyebrow = c.eyebrow
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.green}">${escapeHtml(c.eyebrow)}</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper}">
<tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
    <tr><td style="padding:0 4px 20px">
      <a href="${SITE_URL}/" style="text-decoration:none"><img src="${SITE_URL}/email/fon-logo.png" width="120" alt="Friends of Nigeria" style="display:block;width:120px;height:auto;border:0"></a>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;overflow:hidden">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;background:${C.green};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px">
          ${eyebrow}
          <h1 style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${C.ink}">${escapeHtml(c.heading)}</h1>
          ${c.body}
          ${buttons}
          ${note}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.ink3}" align="center">
      <strong style="color:${C.ink2}">Friends of Nigeria</strong> · Connecting Nigeria and Europe<br>
      229 rue Saint-Honoré, 75001 Paris · <a href="${SITE_URL}/" style="color:${C.greenInk};text-decoration:none">friendsofnigeria.net</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
