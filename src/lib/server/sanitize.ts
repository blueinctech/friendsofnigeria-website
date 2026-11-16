/**
 * Server-side cleaning of everything administrators type, so stored content
 * can be rendered on the public website without risk of script injection.
 */
import sanitizeHtml from 'sanitize-html';

const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ol: ['start'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.target && out.target !== '_blank') delete out.target;
      if (out.target === '_blank') out.rel = 'noopener noreferrer';
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
    b: 'strong',
    i: 'em',
    h1: 'h2',
  },
};

export function cleanRichText(html: unknown, maxLength = 200_000): string {
  const value = typeof html === 'string' ? html : '';
  if (value.length > maxLength) throw new Error(`The text is too long (maximum ${maxLength.toLocaleString('en-GB')} characters).`);
  return sanitizeHtml(value, RICH_TEXT).trim();
}

/** Plain text: no tags, no control characters, trimmed. */
export function cleanText(value: unknown, multiline = false): string {
  if (value == null) return '';
  let s = String(value).normalize('NFC');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '') : s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.trim();
}

/** Turns stored HTML into plain text, e.g. for reading time or search snippets. */
export const htmlToText = (html: string) =>
  sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();

/**
 * Accepts https/http URLs, site-relative paths ("/about/"), in-page anchors,
 * mailto: and tel:. Rejects javascript: and other schemes.
 */
export function cleanUrl(value: unknown, { allowRelative = true } = {}): string | null {
  const s = cleanText(value);
  if (!s) return '';
  if (allowRelative && (/^\/(?!\/)/.test(s) || s.startsWith('#'))) return s;
  if (/^(mailto|tel):/i.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
