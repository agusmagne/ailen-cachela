/**
 * JSON-LD de Música. Regla del proyecto: SOLO datos reales (nunca de un ítem `demo`). Devuelve `null` para un ítem de ejemplo.
 * Puro: recibe URLs absolutas ya armadas.
 */
import type { Release } from './releases.ts';
import { isoDuration } from './format.ts';

interface Ctx {
  /** URL absoluta de la página del release. */
  pageUrl: string;
  artistName: string;
  /** Id (URL absoluta) del nodo de la artista en la home. */
  artistId?: string;
}

export function releaseJsonLd(r: Release, ctx: Ctx): Record<string, unknown>[] | null {
  if (r.demo) return null;
  const byArtist = ctx.artistId ? { '@id': ctx.artistId } : { '@type': 'MusicGroup', name: ctx.artistName };
  const album: Record<string, unknown> = {
    '@type': 'MusicAlbum',
    '@id': `${ctx.pageUrl}#album`,
    name: r.title,
    url: ctx.pageUrl,
    ...(r.date ? { datePublished: r.date } : {}),
    ...(r.catalog ? { identifier: r.catalog } : {}),
    ...(r.kind === 'compilation' ? { albumReleaseType: 'https://schema.org/CompilationAlbum' } : {}),
    ...(r.label.name ? { recordLabel: { '@type': 'Organization', name: r.label.name, ...(r.label.url ? { url: r.label.url } : {}) } } : {}),
    ...(r.compilationArtists.length ? { byArtist: r.compilationArtists.map((name) => ({ '@type': 'MusicGroup', name })) } : { byArtist }),
    ...(r.url ? { sameAs: [r.url] } : {}),
    track: r.tracks.map((tr) => ({
      '@type': 'MusicRecording',
      '@id': `${ctx.pageUrl}#track-${tr.n}`,
      name: tr.title,
      position: tr.n,
      duration: isoDuration(tr.duration),
      byArtist,
      inAlbum: { '@id': `${ctx.pageUrl}#album` },
    })),
  };
  return [album];
}
