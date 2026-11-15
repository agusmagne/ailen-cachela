/**
 * Feed RSS 2.0 de la serie de mixes. XML propio, sin dependencias. Puro.
 * El que llama pasa SOLO ítems no demo (la regla del proyecto: un feed nunca lleva contenido de ejemplo).
 */

export interface FeedItem {
  title: string;
  /** URL absoluta de la página del mix. */
  link: string;
  /** Texto plano. */
  description?: string;
  /** YYYY-MM-DD (opcional: los sets reales de SoundCloud no tienen fecha confirmada). */
  date?: string;
}

export interface FeedOptions {
  title: string;
  description: string;
  /** URL absoluta de la página de mixes. */
  link: string;
  /** URL absoluta del propio feed. */
  self: string;
  lang: 'es' | 'en';
  items: FeedItem[];
}

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const rfc822 = (iso: string) => new Date(`${iso}T00:00:00Z`).toUTCString();

export function buildFeed(o: FeedOptions): string {
  const items = o.items
    .map(
      (it) =>
        `    <item>\n      <title>${xmlEscape(it.title)}</title>\n      <link>${xmlEscape(it.link)}</link>\n      <guid isPermaLink="true">${xmlEscape(it.link)}</guid>\n` +
        (it.description ? `      <description>${xmlEscape(it.description)}</description>\n` : '') +
        (it.date ? `      <pubDate>${rfc822(it.date)}</pubDate>\n` : '') +
        `    </item>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n` +
    `    <title>${xmlEscape(o.title)}</title>\n    <link>${xmlEscape(o.link)}</link>\n    <description>${xmlEscape(o.description)}</description>\n` +
    `    <language>${o.lang}</language>\n    <atom:link href="${xmlEscape(o.self)}" rel="self" type="application/rss+xml"/>\n` +
    (items ? items + '\n' : '') +
    `  </channel>\n</rss>\n`
  );
}
