/** Lógica pura de la grilla de videos (se prueba con node:test). */
export type VideoCategory = 'live' | 'aftermovie' | 'visuals';

export interface VideoLike {
  id: string;
  category: VideoCategory;
  year: number;
  featured?: boolean;
}

export const CATEGORY_ORDER: readonly VideoCategory[] = ['live', 'aftermovie', 'visuals'];

/** Filtra por categoría ("all" = todos) sin alterar el orden. */
export function filterVideos<T extends VideoLike>(list: readonly T[], cat: VideoCategory | 'all'): T[] {
  return cat === 'all' ? [...list] : list.filter((v) => v.category === cat);
}

/** Cantidad por categoría, solo de las que tienen algo (en el orden fijo de CATEGORY_ORDER). */
export function categoryCounts<T extends VideoLike>(list: readonly T[]): { category: VideoCategory; count: number }[] {
  return CATEGORY_ORDER.map((category) => ({ category, count: list.filter((v) => v.category === category).length })).filter((c) => c.count > 0);
}

/** El video destacado: el primero marcado `featured`, o el más reciente. Null si la lista está vacía. */
export function pickFeatured<T extends VideoLike>(list: readonly T[]): T | null {
  if (!list.length) return null;
  return list.find((v) => v.featured) ?? [...list].sort((a, b) => b.year - a.year)[0];
}

/** "1:12:40" -> 4360 segundos; "03:48" -> 228. NaN si el formato no es válido. */
export function durationSeconds(d: string): number {
  const parts = d.split(':').map(Number);
  if (parts.some((n) => !Number.isInteger(n) || n < 0) || parts.length < 2 || parts.length > 3) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Duración ISO 8601 ("PT1H12M40S") para <time datetime>. */
export function isoDuration(d: string): string {
  const s = durationSeconds(d);
  if (Number.isNaN(s)) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${sec || (!h && !m) ? `${sec}S` : ''}`;
}
