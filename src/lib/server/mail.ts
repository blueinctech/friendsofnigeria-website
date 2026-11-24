/**
 * Transactional email: enquiry notifications and password links.
 *
 * Amazon SES is used when its keys are set, otherwise Resend:
 *
 *   SES_ACCESS_KEY_ID, SES_SECRET_ACCESS_KEY, SES_REGION   Amazon SES (sender domain verified in SES)
 *   RESEND_API_KEY                                          Resend (sender domain verified in Resend)
 *   FORM_FROM_EMAIL                                         sender address, e.g. website@friendsofnigeria.net
 */
const sesConfigured = () =>
  Boolean(process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY && process.env.SES_REGION);

export const mailConfigured = () =>
  Boolean(process.env.FORM_FROM_EMAIL && (sesConfigured() || process.env.RESEND_API_KEY));

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  fromName?: string;
}

let sesClient: import('@aws-sdk/client-sesv2').SESv2Client | null = null;

async function sendWithSes(mail: Mail, from: string): Promise<boolean> {
  const sdk = await import('@aws-sdk/client-sesv2');
  sesClient ??= new sdk.SESv2Client({
    region: process.env.SES_REGION,
    credentials: { accessKeyId: process.env.SES_ACCESS_KEY_ID!, secretAccessKey: process.env.SES_SECRET_ACCESS_KEY! },
  });
  try {
    await sesClient.send(
      new sdk.SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: Array.isArray(mail.to) ? mail.to : [mail.to] },
        ReplyToAddresses: mail.replyTo ? [mail.replyTo] : undefined,
        Content: {
          Simple: {
            Subject: { Data: mail.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: mail.html, Charset: 'UTF-8' }, Text: { Data: mail.text, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    return true;
  } catch (err) {
    console.error(`[mail] SES: ${(err as Error).name}: ${(err as Error).message}`);
    return false;
  }
}

async function sendWithResend(mail: Mail, from: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
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

export async function sendMail(mail: Mail): Promise<boolean> {
  const { FORM_FROM_EMAIL, RESEND_API_KEY } = process.env;
  if (!FORM_FROM_EMAIL) return false;
  const from = `${mail.fromName ?? 'Friends of Nigeria website'} <${FORM_FROM_EMAIL}>`;
  if (sesConfigured()) return sendWithSes(mail, from);
  if (RESEND_API_KEY) return sendWithResend(mail, from);
  return false;
}

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
