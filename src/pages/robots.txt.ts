import type { APIRoute } from 'astro';
import { getSettings } from '../lib/server/settings';

/** robots.txt follows the "Allow search engines" switch in SEO Settings. */
export const GET: APIRoute = async ({ site, url }) => {
  const seo = await getSettings('seo');
  const origin = (site ?? url).origin;
  const body =
    seo.indexing === false
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /thank-you/\n\nSitemap: ${origin}/sitemap-index.xml\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
