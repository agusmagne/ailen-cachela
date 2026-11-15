/**
 * Calendarios descargables y suscribibles de las fechas REALES (nunca ejemplos): un .ics por fecha y el feed completo.
 * Puro: arma eventos con `buildIcs` (src/lib/downloads/ics-write.ts) y se prueba con `node --test`.
 * Detalle importante: `buildIcs` no escapa el punto y coma; para que ningún lector lo interprete como separador, los
 * textos pasan por `icsText`, que lo reemplaza por una coma.
 */
import { buildIcs, type IcsEvent } from '../downloads/ics-write.ts';
import { EVENT_TZ } from './time.ts';
import type { Show } from '../show-map.ts';
import { showSlug } from './entries.ts';

export interface CalendarOptions {
  lang: 'es' | 'en';
  artist: string;
  /** Origen público del sitio, con BASE_PATH y sin barra final ('https://ailencachela.com'). */
  siteUrl: string;
  /** Ruta absoluta de la página de fechas (con barra final). */
  showsUrl: string;
  /** Nombre del país a partir del código (la página lo resuelve con Intl). */
  countryName: (s: Show) => string | null;
  now?: Date;
}

const L = {
  es: { tickets: 'Entradas', more: 'Todas las fechas', soldout: 'agotado', cancelled: 'cancelado', calName: 'Fechas de {artist}' },
  en: { tickets: 'Tickets', more: 'All dates', soldout: 'sold out', cancelled: 'cancelled', calName: '{artist} shows' },
} as const;

/** El punto y coma queda como coma (ver nota del archivo). */
export const icsText = (s: string) => s.replace(/;/g, ',').replace(/\s*\r?\n\s*/g, '\n').trim();

const safeUid = (id: string) => id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'show';

export const calendarName = (artist: string, lang: 'es' | 'en') => L[lang].calName.replace('{artist}', artist);

export function showToIcsEvent(s: Show, o: CalendarOptions): IcsEvent {
  const l = L[o.lang];
  const host = new URL(o.siteUrl).hostname;
  const suffix = s.status === 'soldout' ? ` (${l.soldout})` : s.status === 'cancelled' ? ` (${l.cancelled})` : '';
  const location = [s.title, s.address, s.city ?? s.location, o.countryName(s)].filter((x): x is string => !!x);
  const lines: string[] = [];
  if (s.notes) lines.push(s.notes);
  if (s.url && s.status !== 'cancelled') lines.push(`${l.tickets}: ${s.url}`);
  lines.push(`${l.more}: ${o.showsUrl}`);
  return {
    uid: `${safeUid(s.id)}@${host}`,
    summary: icsText(`${o.artist} @ ${s.title}${suffix}`),
    start: s.start,
    end: s.end,
    location: icsText(location.join(', ')) || null,
    description: icsText(lines.join('\n')),
    url: s.url ?? `${o.showsUrl}#${showSlug(s)}`,
    status: s.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
  };
}

/** .ics de UNA fecha. */
export function buildShowIcs(s: Show, o: CalendarOptions): string {
  return buildIcs([showToIcsEvent(s, o)], { name: calendarName(o.artist, o.lang), tz: s.tz || EVENT_TZ, now: o.now, prodId: `-//${o.artist}//Fechas//${o.lang.toUpperCase()}` });
}

/** Feed completo para suscribirse (webcal://). Solo fechas reales. */
export function buildFeed(shows: readonly Show[], o: CalendarOptions): string {
  return buildIcs(
    shows.map((s) => showToIcsEvent(s, o)),
    { name: calendarName(o.artist, o.lang), tz: EVENT_TZ, now: o.now, prodId: `-//${o.artist}//Fechas//${o.lang.toUpperCase()}` },
  );
}

/** Nombre de archivo del .ics de una fecha en un idioma. */
export const showIcsFile = (s: Pick<Show, 'id' | 'start' | 'title'>, lang: 'es' | 'en') => `${showSlug(s)}-${lang}`;
