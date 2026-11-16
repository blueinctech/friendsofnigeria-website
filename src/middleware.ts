/**
 * Runs before every request:
 * - signs in administrators from their session cookie,
 * - protects /admin pages and /api/admin endpoints (session, CSRF, same origin),
 * - sets security and caching headers.
 */
import { defineMiddleware } from 'astro:middleware';
import { readSession } from './lib/server/auth';
import { DatabaseNotConfiguredError } from './lib/server/db';
import { csrfValid, fail, sameOrigin, SESSION_COOKIE } from './lib/server/http';

/** Admin pages and endpoints that work without a session. */
const PUBLIC_ADMIN = ['/admin/login/', '/admin/forgot-password/', '/admin/reset-password/', '/admin/setup/'];

const ADMIN_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const CACHE_SECONDS = Number(process.env.PUBLIC_CACHE_SECONDS ?? 30);

function unavailable(isApi: boolean) {
  if (isApi) return fail('The database is not configured. Set DATABASE_URL (see docs/admin-cms.md).', 503);
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website setup needed</title>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#1a1f1c">
<h1>The website database is not connected yet</h1>
<p>Set the <code>DATABASE_URL</code> environment variable and redeploy. Setup steps are in <code>docs/admin-cms.md</code> in the repository.</p></body>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' } },
  );
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { url, request, cookies, locals } = ctx;
  const path = url.pathname;
  locals.admin = null;
  locals.session = null;
  locals.preview = false;

  // One address per page: /about -> /about/ (files and API endpoints are left alone).
  if ((request.method === 'GET' || request.method === 'HEAD') && !path.endsWith('/') && !path.startsWith('/api/') && !/\.[a-z0-9]{2,5}$/i.test(path)) {
    return new Response(null, { status: 301, headers: { Location: `${path}/${url.search}` } });
  }

  const isAdminPage = path === '/admin' || path.startsWith('/admin/');
  const isAdminApi = path.startsWith('/api/admin/');
  const wantsPreview = url.searchParams.has('preview');

  try {
    if (isAdminPage || isAdminApi || wantsPreview) {
      const token = cookies.get(SESSION_COOKIE)?.value;
      const found = token ? await readSession(token) : null;
      if (found) {
        locals.admin = found.admin;
        locals.session = found.session;
      } else if (token) {
        cookies.delete(SESSION_COOKIE, { path: '/' });
      }
      locals.preview = wantsPreview && Boolean(found);
    }

    if (isAdminApi) {
      const open = /^\/api\/admin\/auth\/(login|forgot|reset)\/$/.test(path);
      if (!open && !locals.admin) return fail('Your session has ended. Please sign in again.', 401);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        if (!sameOrigin(request, url)) return fail('Request blocked: it did not come from this website.', 403);
        if (!open && !csrfValid(request, locals.session)) return fail('Your session token is missing or out of date. Reload the page and try again.', 403);
      }
    }

    if (isAdminPage && !locals.admin && !PUBLIC_ADMIN.includes(path)) {
      const nextPath = path === '/admin/' || path === '/admin' ? '' : `?next=${encodeURIComponent(path + url.search)}`;
      return ctx.redirect(`/admin/login/${nextPath}`, 302);
    }

    const response = await next();

    if (isAdminPage || isAdminApi) {
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('Referrer-Policy', 'same-origin');
      if (isAdminPage) response.headers.set('Content-Security-Policy', ADMIN_CSP);
      return response;
    }

    // Public pages: previews are private, everything else is cached briefly at the CDN.
    if (locals.preview) {
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('X-Robots-Tag', 'noindex');
    } else if (!response.headers.has('Cache-Control') && request.method === 'GET' && (response.status === 200 || response.status === 404)) {
      response.headers.set(
        'Cache-Control',
        CACHE_SECONDS > 0 ? `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300` : 'no-store',
      );
    }
    return response;
  } catch (err) {
    if (err instanceof DatabaseNotConfiguredError || (err as Error)?.name === 'DatabaseNotConfiguredError') return unavailable(isAdminApi);
    if ((err as { code?: string })?.code === 'ECONNREFUSED' || (err as { code?: string })?.code === '42P01') {
      console.error('[middleware] database unavailable or not migrated', err);
      return unavailable(isAdminApi);
    }
    throw err;
  }
});
