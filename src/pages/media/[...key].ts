import type { APIRoute } from 'astro';
import { readStoredFile } from '../../lib/server/media';

/**
 * Serves files stored in Postgres (when Vercel Blob is not configured).
 * Keys contain a random id and never change, so they are cached for a year.
 */
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  if (!/^[0-9a-f-]{36}\/[a-z0-9.-]{1,120}$/.test(key)) return new Response('Not found', { status: 404 });
  const file = await readStoredFile(key);
  if (!file) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  const headers: Record<string, string> = {
    'Content-Type': file.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': String(file.data.length),
  };
  if (file.mime === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  if (!file.mime.startsWith('image/') && file.mime !== 'application/pdf') {
    headers['Content-Disposition'] = `attachment; filename="${key.split('/').pop()}"`;
  }
  return new Response(new Uint8Array(file.data), { headers });
};
