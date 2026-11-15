import type { APIRoute } from 'astro';
import { site, t, pick, BASE } from '../lib/content';
import { router } from '../lib/routes';
import { routeLabel } from '../lib/nav';
import { buildManifest } from '../lib/fans/manifest.ts';

/**
 * Manifest de la app instalable. Un solo archivo para los dos idiomas (el sitio es bilingüe): nombre y descripción
 * en español, que es el idioma por defecto. Respeta BASE_PATH: start_url, scope e íconos salen con el prefijo.
 * Los accesos directos (shortcuts) solo incluyen páginas que existen y tienen contenido.
 */
export const GET: APIRoute = () => {
  const shortcuts = ['shows', 'links', 'booking']
    .filter((id) => router.listed(id))
    .map((id) => ({ name: routeLabel(id, 'es'), url: router.path(id, 'es') }));
  const manifest = buildManifest({
    base: BASE,
    name: t('fans_pwa_name', 'es'),
    shortName: t('fans_pwa_short', 'es'),
    description: pick(site.site.description, 'es'),
    lang: 'es',
    themeColor: site.site.theme_color,
    backgroundColor: site.site.theme_color,
    shortcuts,
  });
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
};
