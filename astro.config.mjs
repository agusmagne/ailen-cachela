// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// El dominio todavía no está confirmado: se define con la variable SITE_URL al construir.
// Ej: SITE_URL=https://ailencachela.com npm run build
const site = (process.env.SITE_URL || 'https://ailencachela.com').replace(/\/+$/, '');

// Subcarpeta de publicación (p. ej. GitHub Pages de proyecto): BASE_PATH=/ailen-cachela
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es', en: 'en' } },
    }),
  ],
});
