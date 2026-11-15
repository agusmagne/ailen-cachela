/**
 * Armado del contexto de la página de prensa, de las vistas de impresión y de los descargables (ZIP, vCard, QR).
 * Acá sí se importan los módulos del sitio (contenido, dominios, rutas); la lógica pura vive en model.ts, logo.ts y art.ts.
 * Una sola fuente: así la página, los PDF y el ZIP dicen exactamente lo mismo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { site, t, pick, absolute, withBase, type Lang } from '../content';
import { domain } from '../data';
import { demoOn } from '../demo';
import { router } from '../routes';
import { schema } from '../schemas/press';
import { buildVCard } from '../downloads/vcard';
import { qrSvg } from '../downloads/qr';
import { createZip } from '../downloads/zip';
import { publicFileSize } from '../downloads/response';
import { paletteFrom, type Palette } from './tokens';
import { isotipoFile, isotipoSvg, LOGO_VARIANTS, type LogoVariant } from './logo';
import { pressPieceFile, type PieceShape } from './art';
import { bioSet, factSheet, kitEntries, timelineEntries, type BioId, type KitLabels } from './model';

export const PRESS_DIR = 'downloads/press';
/** Nombres de los archivos descargables. Los que dependen del idioma llevan -es / -en. */
export const FILES = {
  epk: (l: Lang) => `ailen-cachela-epk-${l}.pdf`,
  onesheet: (l: Lang) => `ailen-cachela-one-sheet-${l}.pdf`,
  kit: (l: Lang) => `ailen-cachela-press-kit-${l}.zip`,
  vcard: 'ailen-cachela-booking.vcf',
  qr: (l: Lang) => `ailen-cachela-qr-prensa-${l}.svg`,
  iso: (v: 'negro' | 'blanco') => `ailen-cachela-isotipo-${v}.svg`,
  wordmark: (v: 'negro' | 'blanco') => `ailen-cachela-wordmark-${v}.png`,
} as const;
export const fileHref = (name: string) => withBase(`/${PRESS_DIR}/${name}`);

export const palette = (): Palette => paletteFrom(readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8'));

const readPublic = (name: string): Uint8Array | null => {
  const p = join(process.cwd(), 'public', PRESS_DIR, name);
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
};
/** Peso en bytes de un archivo versionado en public/downloads/press (null si todavía no existe). */
export const publicSize = (name: string) => publicFileSize(`${PRESS_DIR}/${name}`);

/** Origen público del sitio (SITE_URL al construir). */
export const siteOrigin = () => new URL(import.meta.env.SITE ?? 'https://ailencachela.com');

const stripMix = (s: string) => s.replace(/\s*\(.*?\)\s*$/, '');

export function loadPress(lang: Lang) {
  const press = domain('press', schema);
  const email = site.contact.email;
  const roomRelease = site.releases.find((r) => r.own_tracks.length > 0) ?? null;
  const fragmento = site.projects.find((p) => p.id === 'fragmento');
  const senka = site.projects.find((p) => p.id === 'senka');
  const ownTrack = roomRelease?.own_tracks[0];

  const bios = bioSet(lang, {
    tagline: t('press_tagline', lang),
    short: pick(site.about.bio, lang),
    extra: press.bios.map((b) => ({ id: b.id, text: b.text, demo: b.demo })),
  });

  const facts = factSheet(lang, {
    labels: {
      role: t('press_fact_role', lang),
      city: t('press_fact_city', lang),
      label: t('press_fact_label', lang),
      collective: t('press_fact_collective', lang),
      project: t('press_fact_project', lang),
      languages: t('press_fact_languages', lang),
    },
    role: pick(site.artist.role, lang),
    city: site.artist.city,
    country: site.artist.country,
    labelValue: roomRelease && ownTrack ? t('press_fact_label_value', lang, { label: roomRelease.label.name, track: stripMix(ownTrack.title), catalog: roomRelease.catalog, year: roomRelease.date.slice(0, 4) }) : '',
    labelUrl: roomRelease?.label.url,
    collective: fragmento ? t('press_fact_collective_value', lang, { name: fragmento.name }) : '',
    project: senka?.name ?? '',
    languages: t('press_fact_languages_value', lang),
    extra: press.facts,
  });

  const timeline = timelineEntries(
    lang,
    roomRelease && ownTrack
      ? [{ id: 'room-004', year: Number(roomRelease.date.slice(0, 4)), title: t('press_real_milestone', lang, { track: stripMix(ownTrack.title), release: roomRelease.title }), place: t('press_real_milestone_place', lang, { label: roomRelease.label.name, city: 'Buenos Aires' }) }]
      : [],
    press.timeline,
  );

  const pageUrl = absolute(router.path('press', lang), siteOrigin());
  const hasDemo = [press.bios, press.facts, press.pronunciation, press.quotes, press.supports, press.testimonials, press.timeline, press.statement, press.safer, press.photos, press.contacts].some((a) => a.length > 0);

  return {
    press,
    email,
    bios,
    facts,
    timeline,
    pageUrl,
    hasDemo,
    shortBio: pick(site.about.bio, lang),
    tagline: t('press_tagline', lang),
    links: site.links.filter((l) => l.url !== ''),
    pieceTitle: (caption: string) => `${t('press_photo_notreal', lang)} · ${caption}`,
  };
}
export type PressContext = ReturnType<typeof loadPress>;

/* ---- Descargables ----------------------------------------------------------------------------------------------------- */

/** vCard del booking: mismo archivo en los dos idiomas (rol y nota bilingües). */
export function vcardText(): string {
  return buildVCard({
    name: `${site.artist.name} (Booking)`,
    org: site.artist.name,
    title: `${pick(site.artist.role, 'es')} / ${pick(site.artist.role, 'en')}`,
    email: site.contact.email,
    url: absolute(router.home('es'), siteOrigin()),
    city: site.artist.city,
    country: site.artist.country,
    note: t('press_vcard_note', 'es'),
  });
}

export const qrFile = (lang: Lang, pageUrl: string) => qrSvg(pageUrl, { ecc: 'M', quiet: 4, fill: '#000000', background: '#ffffff', title: t('press_qr_label', lang) });

const kitLabels = (lang: Lang): KitLabels => ({
  demoNote: t('press_kit_demo_note', lang),
  bioTitle: { tagline: t('press_bio_tagline', lang), short: t('press_bio_short', lang), medium: t('press_bio_medium', lang), long: t('press_bio_long', lang) } satisfies Record<BioId, string>,
  factsTitle: t('press_kit_facts_title', lang),
  readmeTitle: t('press_kit_readme_title', lang),
  readmeIntro: t('press_kit_readme_intro', lang),
  readmeFiles: t('press_kit_readme_files', lang),
  contact: t('press_kit_contact', lang),
  generated: t('press_kit_generated', lang),
});

const kitMemo = new Map<Lang, Buffer>();
/** ZIP del press kit (determinista; con el contenido de ejemplo marcado). Memoizado por build. */
export function buildKitZip(lang: Lang): Buffer {
  const hit = kitMemo.get(lang);
  if (hit) return hit;
  const ctx = loadPress(lang);
  const p = palette();
  const bioNames: Record<BioId, string> = lang === 'es'
    ? { tagline: 'bio-tagline.txt', short: 'bio-corta.txt', medium: 'bio-media.txt', long: 'bio-larga.txt' }
    : { tagline: 'bio-tagline.txt', short: 'bio-short.txt', medium: 'bio-medium.txt', long: 'bio-long.txt' };
  const logoTitle = t('press_logo_title', lang);
  const entries = kitEntries({
    lang,
    labels: kitLabels(lang),
    demoOn,
    bios: ctx.bios,
    facts: ctx.facts,
    names: { bio: bioNames, facts: lang === 'es' ? 'ficha-tecnica.txt' : 'fact-sheet.txt', readme: lang === 'es' ? 'LEEME.txt' : 'README.txt', vcard: FILES.vcard, qr: FILES.qr(lang) },
    logos: (['negro', 'blanco'] as const).map((v) => ({ name: FILES.iso(v), data: isotipoFile(v, p, logoTitle) })),
    pieces: ctx.press.photos.map((ph, i) => ({
      name: `${lang === 'es' ? 'pieza' : 'piece'}-${String(i + 1).padStart(2, '0')}-${ph.shape}.svg`,
      data: pressPieceFile(ph.seed, ph.shape as PieceShape, p, ctx.pieceTitle(ph.caption[lang])),
    })),
    vcard: vcardText(),
    qr: qrFile(lang, ctx.pageUrl),
    binaries: [
      ...(['negro', 'blanco'] as const).map((v) => ({ name: FILES.wordmark(v), data: readPublic(FILES.wordmark(v)) })),
      { name: FILES.epk(lang), data: readPublic(FILES.epk(lang)) },
      { name: FILES.onesheet(lang), data: readPublic(FILES.onesheet(lang)) },
    ],
    contactLine: ctx.email,
  });
  const zip = createZip(entries);
  kitMemo.set(lang, zip);
  return zip;
}

export { isotipoSvg, isotipoFile, LOGO_VARIANTS };
export type { LogoVariant };
