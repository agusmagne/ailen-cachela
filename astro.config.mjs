// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// El dominio todavía no está confirmado: se define con la variable SITE_URL al construir.
// Ej: SITE_URL=https://ailencachela.com npm run build
const site = (process.env.SITE_URL || 'https://ailencachela.com').replace(/\/+$/, '');

// Subcarpeta de publicación (p. ej. GitHub Pages de proyecto): BASE_PATH=/ailen-cachela
const base = process.env.BASE_PATH || '/';

// Interruptor del contenido de ejemplo (mismo criterio que src/lib/demo.ts): DEMO_CONTENT=0|1 o `demo_content` de site.yaml
const demoOn = (() => {
  const env = process.env.DEMO_CONTENT;
  if (env !== undefined && env !== '') return !/^(0|false|no|off)$/i.test(env.trim());
  try {
    return parse(readFileSync(new URL('./src/content/site.yaml', import.meta.url), 'utf8')).demo_content !== false;
  } catch {
    return true;
  }
})();

/** @param {string} d @returns {string[]} */
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

/**
 * Posproceso del build (va DESPUÉS de sitemap):
 *  1. Saca del sitemap las páginas `noindex` (vistas de impresión, páginas con contenido de ejemplo, kit de desarrollo).
 *  2. Con el contenido de ejemplo apagado, borra los PDF versionados en public/downloads (llevan el sello "ejemplo"):
 *     ninguna página los enlaza, y tampoco quedan accesibles por URL.
 */
/** @returns {import('astro').AstroIntegration} */
const postBuild = () => ({
  name: 'ailen-postbuild',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const out = fileURLToPath(dir);
      const prefix = `${site}${base === '/' ? '' : base.replace(/\/+$/, '')}`;
      const noindex = new Set();
      for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
        const head = readFileSync(f, 'utf8').split('</head>')[0];
        if (!/<meta name="robots" content="[^"]*noindex/i.test(head)) continue;
        const rel = f.slice(out.length).replace(/\\/g, '/').replace(/index\.html$/, '');
        noindex.add(`${prefix}/${rel.replace(/^\/+/, '')}`);
      }
      let removed = 0;
      for (const f of walk(out).filter((x) => /sitemap-\d+\.xml$/.test(x))) {
        const xml = readFileSync(f, 'utf8');
        const next = xml.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
          const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
          if (loc && noindex.has(loc)) {
            removed++;
            return '';
          }
          return block;
        });
        writeFileSync(f, next);
      }
      logger.info(`sitemap: ${removed} URL noindex excluidas`);
      if (!demoOn) {
        const dl = join(out, 'downloads');
        if (existsSync(dl)) for (const f of walk(dl).filter((x) => x.endsWith('.pdf'))) rmSync(f);
        logger.info('contenido de ejemplo apagado: PDF con sello eliminados del build');
      }
    },
  },
});

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
    postBuild(),
  ],
});
