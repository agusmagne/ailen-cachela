/**
 * Combinar fechas del calendario con las manuales del YAML, deduplicar y separar en
 * próximas / pasadas. Puro (sin Astro): se prueba con `node --test`.
 */
import { endOfDayMs, startOfDayMs } from './ics.ts';
import { showDate, type Show } from './show-map.ts';

export const SHOWS_TZ = 'America/Argentina/Buenos_Aires';

const nameKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Instante de inicio (ms). Día completo: 00:00 en la zona de Argentina. */
export function showStartMs(s: Show, tz = SHOWS_TZ): number {
  return s.allDay ? startOfDayMs(s.start, tz) : Date.parse(s.start);
}

/**
 * Instante de fin (ms). Con hora y sin fin: hasta el final de ese día local.
 * Día completo: hasta el final del último día, en la zona de Argentina.
 */
export function showEndMs(s: Show, tz = SHOWS_TZ): number {
  if (s.allDay) return endOfDayMs((s.end ?? s.start).slice(0, 10), tz);
  if (s.end) return Date.parse(s.end);
  return endOfDayMs(s.start.slice(0, 10), tz);
}

/** Calendario + manuales, sin duplicados (misma fecha y mismo nombre: gana el del calendario). */
export function mergeShows(calendar: Show[], manual: Show[]): Show[] {
  const seen = new Set<string>();
  const out: Show[] = [];
  for (const s of [...calendar, ...manual]) {
    const key = `${showDate(s)}|${nameKey(s.title)}`;
    if (seen.has(s.id) || seen.has(key)) continue;
    seen.add(s.id);
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function splitShows(shows: Show[], nowMs: number, tz = SHOWS_TZ): { upcoming: Show[]; past: Show[] } {
  const upcoming: Show[] = [];
  const past: Show[] = [];
  for (const s of shows) (showEndMs(s, tz) >= nowMs ? upcoming : past).push(s);
  upcoming.sort((a, b) => showStartMs(a, tz) - showStartMs(b, tz));
  past.sort((a, b) => showStartMs(b, tz) - showStartMs(a, tz));
  return { upcoming, past };
}
