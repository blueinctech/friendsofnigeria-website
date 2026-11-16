import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site, url }) => {
  const origin = (site ?? url).origin;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap></sitemapindex>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
