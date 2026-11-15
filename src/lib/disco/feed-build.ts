/**
 * Arma el feed RSS de mixes de un idioma (depende de Astro/Vite). Solo ítems NO demo: un feed nunca lleva contenido de ejemplo.
 */
import { t, absolute, type Lang } from '../content';
import { router } from '../routes';
import { isDemo } from '../demo';
import { mixes } from './data';
import { buildFeed } from './feed';

export function mixesFeed(lang: Lang, origin: URL | string): string {
  const real = mixes.filter((m) => !isDemo(m));
  return buildFeed({
    lang,
    title: t('base_feed_mixes', lang),
    description: t('disco_feed_desc', lang),
    link: absolute(router.path('mixes', lang), origin),
    self: absolute(router.endpointHref('feed-mixes', lang), origin),
    items: real.map((m) => ({
      title: m.kind === 'series' ? `${t('disco_mix_code', lang, { code: m.code })} · ${m.title}` : m.title,
      link: absolute(router.path('mix', lang, { slug: m.slug }), origin),
      description: m.kind === 'series' ? m.description[lang] : t('disco_mix_desc_sc', lang, { title: m.title }),
      date: m.date || undefined,
    })),
  });
}
