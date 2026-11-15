/** Formato de fechas, lugares y horas de las páginas de agenda (usa los textos del sitio: depende de Vite, no es de la lógica pura). */
import { t, formatDate, type Lang } from '../../lib/content';
import { countryLabel, showEndTime, showTime, type Show, type ShowStatus } from '../../lib/show-map';
import type { Entry } from '../../lib/agenda/entries';

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function dateParts(date: string, lang: Lang) {
  return {
    iso: date,
    wd: formatDate(date, lang, { weekday: 'short' }).replace(/\./g, ''),
    day: formatDate(date, lang, { day: 'numeric' }),
    mon: formatDate(date, lang, { month: 'short' }).replace(/\./g, ''),
    year: formatDate(date, lang, { year: 'numeric' }),
  };
}

/** '28 nov 2026' */
export function shortDate(date: string, lang: Lang) {
  const p = dateParts(date, lang);
  return `${p.day.padStart(2, '0')} ${p.mon} ${p.year}`;
}

/** 'sábado 28 de noviembre de 2026' / 'Saturday 28 November 2026' */
export const longDate = (date: string, lang: Lang) => formatDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** '28 nov' */
export const dayMonth = (date: string, lang: Lang) => formatDate(date, lang, { day: 'numeric', month: 'short' }).replace(/\./g, '');

export function placeOfShow(s: Show, lang: Lang): string {
  const c = countryLabel(s, lang);
  if (s.city) return [s.city, c].filter(Boolean).join(', ');
  return [s.location, c].filter(Boolean).join(', ');
}

export function placeOfEntry(e: Entry, lang: Lang): string {
  if (e.show) return placeOfShow(e.show, lang);
  const c = e.countryCode ? countryLabel({ country: null, countryCode: e.countryCode }, lang) : null;
  return [e.city, c].filter(Boolean).join(', ');
}

/** Hora o rango de la fecha, o texto de día completo. Siempre un texto (la cuenta regresiva lo muestra aunque no haya JS). */
export function timeOfShow(s: Show, lang: Lang): string {
  const a = showTime(s);
  if (!a) {
    if (s.end) return t('shows_until', lang, { date: dayMonth(s.end, lang) });
    return t('agenda_all_day', lang);
  }
  const b = showEndTime(s);
  return t('shows_time', lang, { time: b ? `${a} – ${b}` : a });
}

export const statusText = (status: ShowStatus, lang: Lang) =>
  status === 'soldout' ? t('shows_status_soldout', lang) : status === 'cancelled' ? t('shows_status_cancelled', lang) : '';

export const countText = (n: number, lang: Lang, key: 'agenda_map_count' | 'agenda_year_dates') =>
  n === 1 ? t(`${key}_one` as 'agenda_map_count_one', lang) : t(key, lang, { n });
