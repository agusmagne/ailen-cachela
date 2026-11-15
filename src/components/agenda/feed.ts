/** Contexto común de los endpoints .ics (feed y archivos por fecha): opciones de calendar.ts con los datos del sitio. */
import { site, absolute, BASE, type Lang } from '../../lib/content';
import { router } from '../../lib/routes';
import { countryLabel } from '../../lib/show-map';
import type { CalendarOptions } from '../../lib/agenda/calendar';

export function calendarOptions(lang: Lang, site_: URL | undefined): CalendarOptions {
  const origin = site_ ?? new URL('https://ailencachela.com');
  return {
    lang,
    artist: site.artist.name,
    siteUrl: origin.toString().replace(/\/$/, '') + BASE,
    showsUrl: absolute(router.path('shows', lang), origin),
    countryName: (s) => countryLabel(s, lang),
  };
}
