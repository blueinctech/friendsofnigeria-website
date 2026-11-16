// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';
import { loadEnv } from 'vite';

// Server code reads settings from process.env. Fill it from a local .env file
// during development (hosting platforms set real environment variables).
for (const [key, value] of Object.entries(loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), ''))) {
  if (process.env[key] === undefined) process.env[key] = value;
}

// Every page is rendered on request so the website always shows what is in the
// database that the admin dashboard edits. Vercel's CDN caches public pages for
// a short time (see src/middleware.ts), so visitors still get fast responses.
//
// CMS_ADAPTER=node builds a standalone Node server instead, which is only used
// to test the production build locally (`npm run build:node`).
const useNode = process.env.CMS_ADAPTER === 'node';
const adapter = useNode
  ? (await import('@astrojs/node')).default({ mode: 'standalone' })
  : vercel({ maxDuration: 60 });

export default defineConfig({
  site: 'https://friendsofnigeria.net',
  output: 'server',
  adapter,
  // Page addresses end with a slash (see the redirect in src/middleware.ts); file
  // addresses such as /media/<id>/photo.webp and /robots.txt do not.
  trailingSlash: 'ignore',
  integrations: [preact({ include: ['**/components/admin/**'] })],
  security: {
    checkOrigin: true,
    // The standalone Node server only trusts Host headers for listed domains
    // (Vercel passes the real request URL, so this only matters for node builds).
    ...(useNode
      ? {
          allowedDomains: [
            { hostname: 'localhost' },
            { hostname: '127.0.0.1' },
            ...(process.env.CMS_ALLOWED_HOSTS ?? '')
              .split(',')
              .map((h) => h.trim())
              .filter(Boolean)
              .map((hostname) => ({ hostname })),
          ],
        }
      : {}),
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    ssr: { external: ['sharp', 'pg'] },
  },
});
