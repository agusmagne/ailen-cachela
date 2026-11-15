/**
 * Entradas del archivo y del mapa: une las fechas reales (calendario) con las de ejemplo (tour.yaml) en una forma
 * común y calcula agrupaciones por año, estadísticas y puntos de mapa. Puro: se prueba con `node --test`.
 */
import { showCoords } from '../flyer.ts';
import { showDate, type Show, type ShowStatus } from '../show-map.ts';
import { cityCoords } from './places.ts';

export interface Entry {
  /** Clave estable (id del evento o del ítem de ejemplo). */
  key: string;
  /** 'YYYY-MM-DD' */
  date: string;
  year: number;
  /** Venue o nombre del evento. */
  title: string;
  city: string | null;
  countryCode: string | null;
  status: ShowStatus;
  lat: number | null;
  lon: number | null;
  /** Dato inventado (tour.yaml). */
  demo: boolean;
  /** Solo fechas reales: el show original. */
  show: Show | null;
}

export interface TourItemLike {
  id: string;
  date: string;
  venue: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  status: 'played' | 'soldout' | 'cancelled';
  demo?: boolean;
}

const yearOf = (date: string) => Number(date.slice(0, 4));

export function entryFromShow(s: Show): Entry {
  const date = showDate(s);
  const geo = showCoords(s) ?? cityCoords(s.city, s.countryCode);
  return {
    key: s.id,
    date,
    year: yearOf(date),
    title: s.title,
    city: s.city,
    countryCode: s.countryCode,
    status: s.status,
    lat: geo?.lat ?? null,
    lon: geo?.lon ?? null,
    demo: false,
    show: s,
  };
}

export function entryFromTour(t: TourItemLike): Entry {
  return {
    key: `tour-${t.id}`,
    date: t.date,
    year: yearOf(t.date),
    title: t.venue,
    city: t.city,
    countryCode: t.country,
    status: t.status === 'soldout' ? 'soldout' : t.status === 'cancelled' ? 'cancelled' : 'scheduled',
    lat: t.lat,
    lon: t.lon,
    demo: t.demo === true,
    show: null,
  };
}

/** Más reciente primero; a igual fecha, por título (orden estable). */
export const byDateDesc = (a: Entry, b: Entry) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title));

export function groupByYear(entries: readonly Entry[]): { year: number; entries: Entry[] }[] {
  const map = new Map<number, Entry[]>();
  for (const e of [...entries].sort(byDateDesc)) {
    if (!Number.isFinite(e.year)) continue;
    (map.get(e.year) ?? map.set(e.year, []).get(e.year)!).push(e);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, entries: list }));
}

export interface Stats {
  dates: number;
  cities: number;
  countries: number;
  /** Fechas por año (más reciente primero). */
  byYear: { year: number; count: number }[];
  /** Hay datos de ejemplo mezclados en las cifras. */
  hasDemo: boolean;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Clave de ciudad (para contar y agrupar marcadores). */
export const cityKey = (e: Pick<Entry, 'city' | 'countryCode'>) => (e.city ? `${norm(e.city)}|${e.countryCode ?? ''}` : null);

/** Las fechas canceladas no cuentan como fechas tocadas. */
export function computeStats(entries: readonly Entry[]): Stats {
  const played = entries.filter((e) => e.status !== 'cancelled');
  const cities = new Set(played.map(cityKey).filter((k): k is string => k !== null));
  const countries = new Set(played.map((e) => e.countryCode).filter((c): c is string => !!c));
  return {
    dates: played.length,
    cities: cities.size,
    countries: countries.size,
    byYear: groupByYear(played).map((g) => ({ year: g.year, count: g.entries.length })),
    hasDemo: played.some((e) => e.demo),
  };
}

export interface MapPoint {
  key: string;
  city: string;
  countryCode: string | null;
  lat: number;
  lon: number;
  count: number;
  /** Todas las fechas del punto son de ejemplo. */
  demo: boolean;
  /** Años en que hubo fechas, ascendente. */
  years: number[];
  /** Hay fechas todavía por venir (marca el punto como "próxima"). */
  upcoming: boolean;
}

/** Un punto por ciudad (las fechas sin coordenadas o sin ciudad no se dibujan). `upcomingKeys`: claves de entradas futuras. Orden: con fechas por venir primero, después por cantidad. */
export function mapPoints(entries: readonly Entry[], upcomingKeys: ReadonlySet<string> = new Set()): MapPoint[] {
  const pts = new Map<string, MapPoint>();
  for (const e of entries) {
    const k = cityKey(e);
    if (!k || e.lat === null || e.lon === null || e.status === 'cancelled') continue;
    let p = pts.get(k);
    if (!p) {
      p = { key: k, city: e.city!, countryCode: e.countryCode, lat: e.lat, lon: e.lon, count: 0, demo: true, years: [], upcoming: false };
      pts.set(k, p);
    }
    p.count++;
    if (!e.demo) p.demo = false;
    if (!p.years.includes(e.year)) p.years.push(e.year);
    if (upcomingKeys.has(e.key)) p.upcoming = true;
  }
  return [...pts.values()].map((p) => ({ ...p, years: p.years.sort((a, b) => a - b) })).sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || b.count - a.count || a.city.localeCompare(b.city));
}

/** Id para URL y ancla de una fecha real: 'YYYY-MM-DD-titulo-ab12' (estable por id de evento). */
export function showSlug(s: Pick<Show, 'id' | 'start' | 'title'>): string {
  const words = s.title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  let h = 2166136261;
  for (let i = 0; i < s.id.length; i++) {
    h ^= s.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const tag = (h >>> 0).toString(36).slice(0, 4).padStart(4, '0');
  return [showDate(s), words, tag].filter(Boolean).join('-');
}
