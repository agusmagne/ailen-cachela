import { site, pick, type Lang } from './content';
import { isDemo } from './demo-core';

/** JSON-LD de páginas interiores. Regla: nunca se emite JSON-LD de ítems de ejemplo (isDemo). */
export { isDemo };

export const crumbsLd = (items: { name: string; url: string }[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
});

export function webPageLd(opts: { name: string; description: string; url: string; lang: Lang; type?: string }) {
  return {
    '@type': opts.type ?? 'WebPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.lang,
    isPartOf: { '@type': 'WebSite', name: site.site.name, description: pick(site.site.description, opts.lang) },
  };
}

/** Agrupa nodos en un @graph. Acepta nodos sueltos o ya agrupados. */
export const graph = (...nodes: (Record<string, unknown> | null | undefined | false)[]) => ({
  '@context': 'https://schema.org',
  '@graph': nodes.filter(Boolean),
});
