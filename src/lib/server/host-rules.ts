/**
 * Redirects and headers that `vercel.json` applies on Vercel, re-applied in the
 * middleware so a plain Node host (Hostinger) behaves the same. `vercel.json`
 * stays the single list: edit redirects there and both hosts follow.
 */
import vercel from '../../../vercel.json';

interface Rule {
  prefix: string;
  destination: string;
}

/** "/about-me/:path*" -> prefix "/about-me"; first matching rule wins, as on Vercel. */
const RULES: Rule[] = (vercel.redirects ?? []).map((r) => ({
  prefix: r.source.replace(/\/:path\*$/, '').replace(/\/$/, ''),
  destination: r.destination,
}));

/** Old WordPress address -> new page, or null. Matches the path with or without a trailing slash. */
export function legacyRedirect(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const rule of RULES) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) return rule.destination;
  }
  return null;
}

/** Security headers every response gets (from the "/(.*)" rule in vercel.json). */
const SITE_HEADERS: [string, string][] = (
  vercel.headers?.find((h) => h.source === '/(.*)')?.headers ?? []
).map((h) => [h.key, h.value]);

export function applySiteHeaders(response: Response): Response {
  for (const [key, value] of SITE_HEADERS) {
    if (response.headers.has(key)) continue;
    try {
      response.headers.set(key, value);
    } catch {
      // Immutable response (e.g. a fetched asset): leave it as it is.
    }
  }
  return response;
}
