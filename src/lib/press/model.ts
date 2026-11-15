/**
 * Lógica pura de la página de prensa y del press kit: bios por largo, ficha técnica, línea de tiempo y textos del ZIP.
 * No importa Astro ni Vite (se prueba con node:test); las páginas y los endpoints le pasan los datos ya cargados.
 */
import type { ZipEntry } from '../downloads/zip.ts';

export type Lang = 'es' | 'en';
export interface L10n {
  es: string;
  en: string;
}

/* ---- Bios ---------------------------------------------------------------------------------------------------- */

export type BioId = 'tagline' | 'short' | 'medium' | 'long';
export const BIO_IDS: readonly BioId[] = ['tagline', 'short', 'medium', 'long'];
/** Rangos orientativos de palabras (AM World y la práctica del sector). La corta REAL del sitio es más breve que el rango. */
export const BIO_WORDS: Record<BioId, [number, number]> = { tagline: [5, 25], short: [15, 100], medium: [110, 200], long: [250, 400] };

export const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export interface Bio {
  id: BioId;
  text: string;
  words: number;
  demo: boolean;
}

export interface BioInput {
  tagline: string;
  /** Bio corta verificada (site.yaml). */
  short: string;
  /** Bios de ejemplo del dominio `press` (ya sin ítems demo si el interruptor está apagado). */
  extra: { id: 'medium' | 'long'; text: L10n; demo: boolean }[];
}

/** Las bios disponibles, en orden de largo. Ignora las vacías. */
export function bioSet(lang: Lang, input: BioInput): Bio[] {
  const list: Bio[] = [
    { id: 'tagline', text: input.tagline, words: 0, demo: false },
    { id: 'short', text: input.short, words: 0, demo: false },
  ];
  for (const id of ['medium', 'long'] as const) {
    const e = input.extra.find((x) => x.id === id);
    if (e) list.push({ id, text: e.text[lang], words: 0, demo: e.demo });
  }
  return list.filter((b) => b.text.trim() !== '').map((b) => ({ ...b, text: b.text.trim(), words: countWords(b.text) }));
}

/** Párrafos de una bio (los separa una línea en blanco). */
export const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/* ---- Ficha técnica ------------------------------------------------------------------------------------------- */

export interface FactRow {
  id: string;
  label: string;
  value: string;
  href?: string;
  demo: boolean;
}

export interface FactInput {
  labels: Record<'role' | 'city' | 'label' | 'collective' | 'project' | 'languages', string>;
  role: string;
  city: string;
  country: string;
  /** Sello real (ROOM) con el lanzamiento verificado, ya escrito ("ROOM · Ellas EP [ROOM.004], 2017"). */
  labelValue: string;
  labelUrl?: string;
  collective: string;
  project: string;
  languages: string;
  /** Filas de ejemplo (dominio `press`). */
  extra: { id: string; label: L10n; value: L10n; demo: boolean }[];
}

/** Primero las filas reales (verificadas), después las de ejemplo. */
export function factSheet(lang: Lang, f: FactInput): FactRow[] {
  const real: FactRow[] = [
    { id: 'role', label: f.labels.role, value: f.role, demo: false },
    { id: 'city', label: f.labels.city, value: [f.city, f.country].filter(Boolean).join(', '), demo: false },
    { id: 'label', label: f.labels.label, value: f.labelValue, href: f.labelUrl || undefined, demo: false },
    { id: 'collective', label: f.labels.collective, value: f.collective, demo: false },
    { id: 'project', label: f.labels.project, value: f.project, demo: false },
    { id: 'languages', label: f.labels.languages, value: f.languages, demo: false },
  ].filter((r) => r.value.trim() !== '');
  const extra: FactRow[] = f.extra.map((e) => ({ id: e.id, label: e.label[lang], value: e.value[lang], demo: e.demo }));
  return [...real, ...extra];
}

/* ---- Línea de tiempo ----------------------------------------------------------------------------------------- */

export interface TimelineEntry {
  id: string;
  year: number;
  title: string;
  place: string;
  demo: boolean;
}

/** Hito real + hitos de ejemplo, de más antiguo a más reciente (a igual año, el real primero). */
export function timelineEntries(
  lang: Lang,
  real: { id: string; year: number; title: string; place: string }[],
  extra: { id: string; year: number; title: L10n; place: L10n; demo: boolean }[],
): TimelineEntry[] {
  const all: TimelineEntry[] = [
    ...real.map((r) => ({ ...r, demo: false })),
    ...extra.map((e) => ({ id: e.id, year: e.year, title: e.title[lang], place: e.place[lang], demo: e.demo })),
  ];
  return all.sort((a, b) => a.year - b.year || Number(a.demo) - Number(b.demo));
}

/* ---- Textos del press kit ------------------------------------------------------------------------------------ */

export interface KitLabels {
  demoNote: string;
  bioTitle: Record<BioId, string>;
  factsTitle: string;
  readmeTitle: string;
  readmeIntro: string;
  readmeFiles: string;
  contact: string;
  generated: string;
}

/** Texto plano de una bio, con el aviso al principio si es de ejemplo. */
export function bioFile(bio: Bio, labels: KitLabels, demoOn: boolean): string {
  const head = bio.demo && demoOn ? `[${labels.demoNote}]\n\n` : '';
  return `${head}${labels.bioTitle[bio.id]} (${bio.words})\n\n${paragraphs(bio.text).join('\n\n')}\n`;
}

export function factsFile(rows: FactRow[], labels: KitLabels, demoOn: boolean): string {
  const width = Math.max(0, ...rows.map((r) => r.label.length));
  const lines = rows.map((r) => `${r.label.padEnd(width)}  ${r.value}${r.demo && demoOn ? '  [*]' : ''}`);
  const note = demoOn && rows.some((r) => r.demo) ? `\n[*] ${labels.demoNote}\n` : '';
  return `${labels.factsTitle}\n${'='.repeat(labels.factsTitle.length)}\n\n${lines.join('\n')}\n${note}`;
}

export interface KitInput {
  lang: Lang;
  labels: KitLabels;
  demoOn: boolean;
  bios: Bio[];
  facts: FactRow[];
  /** Nombres de archivo ya localizados, con extensión. */
  names: { bio: Record<BioId, string>; facts: string; readme: string; vcard: string; qr: string };
  logos: { name: string; data: string }[];
  /** Piezas de ejemplo (SVG). Vacío si no hay (interruptor demo apagado). */
  pieces: { name: string; data: string }[];
  vcard: string;
  qr: string;
  /** Binarios que existen en public/ (wordmark PNG, PDF). Se omiten los que faltan. */
  binaries: { name: string; data: Uint8Array | null }[];
  contactLine: string;
}

/** Entradas del ZIP, en orden estable (así el ZIP es determinista). */
export function kitEntries(k: KitInput): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const dirs = k.lang === 'es' ? { bio: 'bios', logos: 'logos', pieces: 'fotos-ejemplo', contact: 'contacto', pdf: 'pdf' } : { bio: 'bios', logos: 'logos', pieces: 'sample-photos', contact: 'contact', pdf: 'pdf' };
  const present = k.binaries.filter((b): b is { name: string; data: Uint8Array } => b.data !== null);
  const listing: string[] = [];
  const add = (name: string, data: Uint8Array | string) => {
    entries.push({ name, data });
    listing.push(name);
  };
  for (const bio of k.bios) add(`${dirs.bio}/${k.names.bio[bio.id]}`, bioFile(bio, k.labels, k.demoOn));
  add(k.names.facts, factsFile(k.facts, k.labels, k.demoOn));
  for (const l of k.logos) add(`${dirs.logos}/${l.name}`, l.data);
  for (const b of present.filter((x) => x.name.endsWith('.png'))) add(`${dirs.logos}/${b.name}`, b.data);
  for (const p of k.pieces) add(`${dirs.pieces}/${p.name}`, p.data);
  add(`${dirs.contact}/${k.names.vcard}`, k.vcard);
  add(`${dirs.contact}/${k.names.qr}`, k.qr);
  for (const b of present.filter((x) => x.name.endsWith('.pdf'))) add(`${dirs.pdf}/${b.name}`, b.data);
  const readme = [
    k.labels.readmeTitle,
    '='.repeat(k.labels.readmeTitle.length),
    '',
    k.labels.readmeIntro,
    k.demoOn && (k.bios.some((b) => b.demo) || k.pieces.length > 0) ? `\n[${k.labels.demoNote}]` : '',
    '',
    k.labels.readmeFiles,
    ...listing.map((n) => `  - ${n}`),
    '',
    `${k.labels.contact}: ${k.contactLine}`,
    '',
  ].join('\n');
  return [{ name: k.names.readme, data: readme }, ...entries];
}
