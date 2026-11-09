// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://friendsofnigeria.net',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/') && !page.includes('/thank-you/'),
    }),
  ],
  image: {
    responsiveStyles: true,
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
