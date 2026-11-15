import { site, pick, BASE, type Lang } from './content';

/** JSON-LD desde site.yaml. Solo datos verificados; sin genre salvo confirmación, sin email salvo autorización. */
export function buildJsonLd(lang: Lang, origin: string) {
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

  // Event: solo con fechas reales cargadas.
  const today = new Date().toISOString().slice(0, 10);
  for (const s of site.shows.filter((x) => x.date >= today)) {
    graph.push({
      '@type': 'Event',
      name: `${site.artist.name} @ ${s.venue}`,
      startDate: s.date,
      location: {
        '@type': 'Place',
        name: s.venue,
        address: { '@type': 'PostalAddress', addressLocality: s.city, addressCountry: s.country },
      },
      performer: { '@id': artistId },
      ...(s.url ? { url: s.url } : {}),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}
