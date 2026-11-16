// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import preact from '@astrojs/preact';

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
  trailingSlash: 'always',
  integrations: [preact({ include: ['**/components/admin/**'] })],
  security: { checkOrigin: true },
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
