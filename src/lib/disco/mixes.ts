/**
 * Normaliza los mixes: la serie de ejemplo (numerada, con tracklist) y los sets reales de SoundCloud
 * (`site.listen.tracks`, sin clasificar: solo título y URL). Puro.
 */
import type { MixItem } from '../schemas/mixes.ts';
import { seriesNumber } from './format.ts';

export interface SiteTrack {
  id: string;
  title: string;
  url: string;
  kind: 'unclassified' | 'track' | 'set';
}

export interface Mix {
  slug: string;
  /** Número de serie (solo la serie de ejemplo). */
  number: number | null;
  code: string;
  title: string;
  date: string;
  venue: string;
  duration: string;
  description: { es: string; en: string };
  tags: string[];
  tracklist: MixItem['tracklist'];
  /** URL de SoundCloud (solo los sets reales). */
  url: string;
  kind: 'series' | 'soundcloud';
  demo: boolean;
  waveSeed: string;
}

export function resolveMix(it: MixItem, tracks: readonly SiteTrack[]): Mix {
  const base = it.ref ? tracks.find((t) => t.id === it.ref) : undefined;
  if (it.ref && !base) throw new Error(`mixes.yaml: "${it.id}" referencia a site.listen.tracks "${it.ref}", que no existe.`);
  return {
    slug: it.id,
    number: it.number ?? null,
    code: it.number !== undefined ? seriesNumber(it.number) : '',
    title: it.title || base?.title || it.id,
    date: it.date,
    venue: it.venue,
    duration: it.duration,
    description: it.description,
    tags: it.tags,
    tracklist: it.tracklist,
    url: base?.url ?? '',
    kind: base ? 'soundcloud' : 'series',
    demo: it.demo,
    waveSeed: it.wave_seed || it.id,
  };
}

/** Serie: del número más nuevo al más viejo. */
export const sortSeries = (list: readonly Mix[]): Mix[] =>
  list.filter((m) => m.kind === 'series').sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
