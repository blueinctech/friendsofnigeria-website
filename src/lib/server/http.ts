/**
 * Helpers for Astro pages and API routes.
 */
import type { APIContext, AstroCookieSetOptions } from 'astro';
import { can, type Action, type Module } from '../cms/permissions.ts';
import { safeEqual } from './security.ts';
import type { Admin, Session } from './auth.ts';
import { SESSION_MAX_HOURS } from './auth.ts';

export const SESSION_COOKIE = 'fon_admin_session';

export function sessionCookieOptions(url: URL): AstroCookieSetOptions {
  return {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_HOURS * 3600,
  };
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export const fail = (message: string, status = 400, extra: Record<string, unknown> = {}) => json({ ok: false, error: message, ...extra }, status);

export function clientIp(ctx: Pick<APIContext, 'request' | 'clientAddress'>): string | null {
  const h = ctx.request.headers;
  // On Vercel, its own header holds the visitor's address.
  const vercel = process.env.VERCEL ? h.get('x-vercel-forwarded-for') : null;
  if (vercel) return vercel.split(',')[0].trim().slice(0, 64);
  // Elsewhere (Hostinger), the proxy appends the real address as the LAST entry;
  // earlier entries come from the visitor and can be faked to dodge rate limits.
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const last = forwarded.split(',').map((s) => s.trim()).filter(Boolean).pop();
    if (last) return last.slice(0, 64);
  }
  try {
    return ctx.clientAddress ?? null;
  } catch {
    return null;
  }
}

/** Reads a JSON body, refusing anything over `maxBytes`. */
export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError('The request is too large.', 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError('The request is too large.', 413);
  try {
    const data = JSON.parse(text || '{}');
    if (!data || typeof data !== 'object') throw new Error();
    return data as T;
  } catch {
    throw new HttpError('The request could not be read.', 400);
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Same-origin check for requests that change data. */
export function sameOrigin(request: Request, url: URL) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const site = request.headers.get('sec-fetch-site');
  return !site || site === 'same-origin';
}

export function csrfValid(request: Request, session: Session | null | undefined) {
  const token = request.headers.get('x-csrf-token') || '';
  return Boolean(session && token && safeEqual(token, session.csrf));
}

export interface Guard {
  admin: Admin;
  session: Session;
}

/**
 * Checks that the caller is signed in and allowed to do `action` in `module`.
 * The middleware has already verified the CSRF token for non-GET requests.
 */
export function guard(ctx: APIContext, module: Module, action: Action = 'view'): Guard | Response {
  const { admin, session } = ctx.locals;
  if (!admin || !session) return fail('Your session has ended. Please sign in again.', 401);
  if (!can(admin, module, action)) return fail('You do not have permission to do this.', 403);
  return { admin, session };
}

export const isResponse = (x: unknown): x is Response => x instanceof Response;

/** Turns thrown errors into JSON responses. */
export function handleError(err: unknown) {
  const e = err as { status?: number; message?: string; errors?: unknown; code?: string };
  if (e && typeof e.status === 'number' && e.status < 500) return fail(e.message || 'Request failed.', e.status, { errors: e.errors, code: e.code });
  console.error('[api]', err);
  return fail('Something went wrong on the server. Please try again.', 500);
}
