import { site, pick, BASE, type Lang } from './content';
import type { Show } from './show-map';

/** JSON-LD desde site.yaml y el calendario. Solo datos verificados; sin genre salvo confirmación, sin email salvo autorización. */
export function buildJsonLd(lang: Lang, origin: string, upcoming: Show[] = []) {
  const root = origin.replace(/\/$/, '') + BASE;
  const url = lang === 'es' ? `${root}/` : `${root}/en/`;
  const artistId = `${root}/#artist`;

  const person: Record<string, unknown> = {
    '@type': ['Person', 'MusicGroup'],
    '@id': artistId,
    name: site.artist.name,
    url,
    description: pick(site.about.bio, lang),
    jobTitle: pick(site.artist.role, lang),
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.artist.city,
      addressCountry: site.artist.country_code,
    },
    sameAs: site.links.filter((l) => l.same_as && l.url).map((l) => l.url),
  };
  if (site.artist.genre) person.genre = site.artist.genre;
  if (site.contact.email_in_jsonld) person.email = site.contact.email;

  const graph: Record<string, unknown>[] = [person];

  for (const r of site.releases) {
    graph.push({
      '@type': 'MusicAlbum',
      name: r.title,
      datePublished: r.date,
      ...(r.url ? { url: r.url } : {}),
      recordLabel: { '@type': 'Organization', name: r.label.name, ...(r.label.url ? { url: r.label.url } : {}) },
      track: r.own_tracks.map((tr) => {
        const [m, s] = tr.duration.split(':').map(Number);
        return {
          '@type': 'MusicRecording',
          name: tr.title,
          position: tr.number,
          duration: `PT${m}M${s}S`,
          byArtist: { '@id': artistId },
        };
      }),
    });
  }

  // MusicEvent: una por fecha próxima, solo con los datos que existen en el calendario/YAML.
  for (const s of upcoming) graph.push(musicEvent(s, artistId));

  return { '@context': 'https://schema.org', '@graph': graph };
}

const EVENT_STATUS = {
  scheduled: 'https://schema.org/EventScheduled',
  soldout: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
} as const;

function musicEvent(s: Show, artistId: string): Record<string, unknown> {
  const address: Record<string, unknown> = { '@type': 'PostalAddress' };
  if (s.address) address.streetAddress = s.address;
  if (s.city) address.addressLocality = s.city;
  if (s.region) address.addressRegion = s.region;
  if (s.countryCode ?? s.country) address.addressCountry = s.countryCode ?? s.country;
  const hasAddress = Object.keys(address).length > 1;

  const place: Record<string, unknown> = { '@type': 'Place', name: s.title };
  if (hasAddress) place.address = address;
  else if (s.location) place.address = s.location;

  const ev: Record<string, unknown> = {
    '@type': 'MusicEvent',
    name: `${site.artist.name} @ ${s.title}`,
    startDate: s.start,
    ...(s.end ? { endDate: s.end } : {}),
    eventStatus: EVENT_STATUS[s.status],
    location: place,
    performer: { '@id': artistId },
  };
  if (s.url) {
    ev.offers = {
      '@type': 'Offer',
      url: s.url,
      ...(s.status === 'soldout' ? { availability: 'https://schema.org/SoldOut' } : {}),
    };
  }
  return ev;
}
