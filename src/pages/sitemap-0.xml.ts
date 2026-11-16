import type { APIRoute } from 'astro';
import { query } from '../lib/server/db';
import { getSettings } from '../lib/server/settings';
import { live, programmePath } from '../lib/server/public';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Every published, indexable address on the website, read live from the database. */
export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? url).origin;
  const seo = await getSettings('seo');
  const entries: { path: string; lastmod?: string | Date }[] = [];
  if (seo.indexing !== false) {
    const [pages, news, events, team, programmes, albums] = await Promise.all([
      query(`SELECT path, updated_at FROM pages WHERE ${live(false)} AND NOT noindex AND canonical_url IS NULL AND key IS DISTINCT FROM 'not-found' ORDER BY sort_order`),
      query(`SELECT slug, updated_at FROM news WHERE ${live(false)} AND canonical_url IS NULL ORDER BY published_at DESC`),
      query(`SELECT slug, updated_at FROM events WHERE ${live(false)} AND canonical_url IS NULL ORDER BY sort_order`),
      query(`SELECT slug, updated_at FROM team_members WHERE ${live(false)} AND bio <> '' ORDER BY sort_order`),
      query(`SELECT type, slug, updated_at FROM programmes WHERE ${live(false)} AND canonical_url IS NULL ORDER BY type, sort_order`),
      query(`SELECT slug, updated_at FROM albums WHERE ${live(false)} ORDER BY date DESC`),
    ]);
    entries.push(...pages.map((r) => ({ path: r.path, lastmod: r.updated_at })));
    entries.push(...news.map((r) => ({ path: `/news/${r.slug}/`, lastmod: r.updated_at })));
    entries.push(...events.map((r) => ({ path: `/events/${r.slug}/`, lastmod: r.updated_at })));
    entries.push(...programmes.map((r) => ({ path: programmePath(r.type, r.slug), lastmod: r.updated_at })));
    entries.push(...team.map((r) => ({ path: `/team/${r.slug}/`, lastmod: r.updated_at })));
    entries.push(...albums.map((r) => ({ path: `/gallery/${r.slug}/`, lastmod: r.updated_at })));
  }
  const body = entries
    .map((e) => `<url><loc>${esc(origin + e.path)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ''}</url>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
