/**
 * Normaliza los releases: mezcla los ítems del dominio `releases` con `site.releases` (el release real no se duplica).
 * Puro: recibe los datos por parámetro (así se prueba con node:test sin Vite).
 */
import type { ReleaseItem, ReleaseKind } from '../schemas/releases.ts';
import { yearOf } from './format.ts';

export interface SiteRelease {
  id: string;
  title: string;
  catalog: string;
  label: { name: string; url: string };
  date: string;
  format: { es: string; en: string };
  compilation: { artists: string[] } | null;
  own_tracks: { number: number; title: string; duration: string }[];
  cover: string;
  cover_alt: { es: string; en: string };
  url: string;
}

export interface ReleaseTrack {
  n: number;
  title: string;
  duration: string;
  bpm?: number;
  key?: string;
  isrc?: string;
}

export interface Release {
  /** Slug de la URL. */
  slug: string;
  kind: ReleaseKind;
  status: 'released' | 'upcoming';
  title: string;
  catalog: string;
  date: string;
  year: number;
  label: { name: string; url: string };
  format: { es: string; en: string };
  description: { es: string; en: string };
  tracks: ReleaseTrack[];
  /** Pistas propias dentro de una compilación (Ailén participa con ellas). */
  compilationArtists: string[];
  credits: { role: { es: string; en: string }; name: string }[];
  upc: string;
  bpm?: number;
  key?: string;
  remixOf?: { title: string; artist: string };
  supportedBy: string[];
  platforms: { id: string; label: string; url: string }[];
  /** Enlace principal verificado (Bandcamp del sello para el real). */
  url: string;
  cover: string;
  coverAlt: { es: string; en: string } | null;
  demo: boolean;
  waveSeed: string;
}

export function resolveRelease(it: ReleaseItem, siteReleases: readonly SiteRelease[]): Release {
  const base = it.ref ? siteReleases.find((r) => r.id === it.ref) : undefined;
  if (it.ref && !base) throw new Error(`releases.yaml: "${it.id}" referencia a site.releases "${it.ref}", que no existe.`);
  const date = it.date || base?.date || '';
  const tracks: ReleaseTrack[] = it.tracks.length
    ? it.tracks.map((t) => ({ n: t.n, title: t.title, duration: t.duration, bpm: t.bpm, key: t.key, isrc: t.isrc }))
    : (base?.own_tracks ?? []).map((t) => ({ n: t.number, title: t.title, duration: t.duration }));
  const url = base?.url ?? '';
  return {
    slug: it.id,
    kind: it.kind,
    status: it.status,
    title: it.title || base?.title || it.id,
    catalog: it.catalog || base?.catalog || '',
    date,
    year: yearOf(date),
    label: base ? { name: it.label || base.label.name, url: base.label.url } : { name: it.label, url: '' },
    format: it.format.es || it.format.en ? it.format : (base?.format ?? { es: '', en: '' }),
    description: it.description,
    tracks,
    compilationArtists: base?.compilation?.artists ?? it.compilation_artists,
    credits: it.credits,
    upc: it.upc,
    bpm: it.bpm,
    key: it.key,
    remixOf: it.remix_of,
    supportedBy: it.supported_by,
    platforms: it.platforms.length ? it.platforms : url ? [{ id: 'bandcamp', label: 'Bandcamp', url }] : [],
    url,
    cover: base?.cover ?? '',
    coverAlt: base?.cover_alt ?? null,
    demo: it.demo,
    waveSeed: it.wave_seed || it.id,
  };
}

/** Próximos primero (por fecha ascendente), luego publicados del más nuevo al más viejo. */
export function sortReleases(list: readonly Release[]): Release[] {
  const up = list.filter((r) => r.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date));
  const out = list.filter((r) => r.status !== 'upcoming').sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return [...up, ...out];
}

export interface FilterOptions {
  kinds: ReleaseKind[];
  years: number[];
  labels: string[];
}

/** Valores disponibles para los chips de filtro (solo los que existen en el catálogo visible). */
export function filterOptions(list: readonly Release[]): FilterOptions {
  const order: ReleaseKind[] = ['album', 'ep', 'single', 'remix', 'compilation'];
  return {
    kinds: order.filter((k) => list.some((r) => r.kind === k)),
    years: [...new Set(list.map((r) => r.year))].sort((a, b) => b - a),
    labels: [...new Set(list.map((r) => r.label.name))].sort((a, b) => a.localeCompare(b)),
  };
}

/** Anterior y siguiente dentro del orden del catálogo. */
export function neighbours<T extends { slug: string }>(list: readonly T[], slug: string): { prev: T | null; next: T | null } {
  const i = list.findIndex((x) => x.slug === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}
