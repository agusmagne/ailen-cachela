/**
 * JSON-LD `MusicEvent` de las fechas REALES (nunca de ejemplo). Misma forma que src/lib/jsonld.ts (home), pero con el
 * artista como nodo propio porque estas páginas no incluyen el grafo de la home. Puro.
 */
import type { Show } from '../show-map.ts';

const STATUS = {
  scheduled: 'https://schema.org/EventScheduled',
  soldout: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
} as const;

export function musicEventLd(s: Show, artist: string, pageUrl: string): Record<string, unknown> {
  const address: Record<string, unknown> = { '@type': 'PostalAddress' };
  if (s.address) address.streetAddress = s.address;
  if (s.city) address.addressLocality = s.city;
  if (s.region) address.addressRegion = s.region;
  if (s.countryCode ?? s.country) address.addressCountry = s.countryCode ?? s.country;
  const place: Record<string, unknown> = { '@type': 'Place', name: s.title };
  if (Object.keys(address).length > 1) place.address = address;
  else if (s.location) place.address = s.location;
  const ev: Record<string, unknown> = {
    '@type': 'MusicEvent',
    name: `${artist} @ ${s.title}`,
    startDate: s.start,
    ...(s.end ? { endDate: s.end } : {}),
    eventStatus: STATUS[s.status],
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: place,
    performer: { '@type': ['Person', 'MusicGroup'], name: artist },
    url: pageUrl,
  };
  if (s.url) {
    ev.offers = { '@type': 'Offer', url: s.url, ...(s.status === 'soldout' ? { availability: 'https://schema.org/SoldOut' } : {}) };
  }
  return ev;
}
