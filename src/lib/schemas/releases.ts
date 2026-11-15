/**
 * Dominio `releases` (src/content/releases.yaml). PURO: solo astro/zod y _shared.
 *
 * - El release real (ROOM.004) NO se copia: un ítem con `ref: ellas-ep` apunta a `site.releases` y solo agrega
 *   enriquecimiento verificado (tipo). Todo lo demás (releases de ejemplo, charts) lleva `demo: true`.
 * - La lista principal se llama `items` (el registro de rutas oculta Música si queda vacía).
 */
import { z } from 'astro/zod';
import { item, items, localized, isoDate, slug, duration, optUrl } from './_shared.ts';

export const RELEASE_KINDS = ['album', 'ep', 'single', 'remix', 'compilation'] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

const camelot = z.string().regex(/^(1[0-2]|[1-9])[AB]$/, 'Tonalidad Camelot, por ejemplo 8A');
const track = z
  .object({
    n: z.number().int().positive(),
    title: z.string().min(1),
    duration,
    bpm: z.number().int().min(60).max(200).optional(),
    key: camelot.optional(),
    isrc: z.string().optional(),
  })
  .strict();

const credit = z.object({ role: localized, name: z.string().min(1) }).strict();
const platform = z.object({ id: z.string().min(1), label: z.string().min(1), url: optUrl.default('') }).strict();

export const release = item({
  id: slug,
  /** Id de un release de site.yaml: el ítem hereda título, catálogo, fecha, sello, formato, pistas y URL. */
  ref: z.string().default(''),
  kind: z.enum(RELEASE_KINDS),
  status: z.enum(['released', 'upcoming']).default('released'),
  title: z.string().default(''),
  catalog: z.string().default(''),
  date: z.union([z.literal(''), isoDate]).default(''),
  label: z.string().default(''),
  format: localized.default({ es: '', en: '' }),
  description: localized.default({ es: '', en: '' }),
  tracks: z.array(track).default([]),
  /** Compilaciones de ejemplo: artistas del volumen (ficticios). */
  compilation_artists: z.array(z.string().min(1)).default([]),
  credits: z.array(credit).default([]),
  isrc_note: z.string().default(''),
  upc: z.string().default(''),
  bpm: z.number().int().min(60).max(200).optional(),
  key: camelot.optional(),
  remix_of: z.object({ title: z.string().min(1), artist: z.string().min(1) }).strict().optional(),
  supported_by: z.array(z.string().min(1)).default([]),
  /** Enlaces verificados; nunca se inventa una URL. Vacío = "pendiente". */
  platforms: z.array(platform).default([]),
  wave_seed: z.string().default(''),
});

const chartEntry = z
  .object({
    position: z.number().int().positive(),
    title: z.string().min(1),
    artist: z.string().min(1),
    label: z.string().min(1),
    bpm: z.number().int().min(60).max(200),
    key: camelot,
  })
  .strict();

export const chart = item({
  id: slug,
  title: localized,
  /** YYYY-MM */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  entries: z.array(chartEntry).min(1),
});

export const schema = z
  .object({
    items: items(release),
    charts: items(chart),
  })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.items.forEach((r, i) => {
      if (seen.has(r.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `id repetido: ${r.id}` });
      seen.add(r.id);
      if (!r.ref && (!r.title || !r.date || !r.label)) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: 'Un release sin `ref` necesita title, date y label' });
      }
      if (!r.demo && !r.ref) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'demo'], message: 'Un release inventado debe llevar demo: true' });
      }
      if (r.kind === 'remix' && !r.remix_of) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'remix_of'], message: 'Un remix necesita remix_of' });
      }
    });
  });

export type ReleaseItem = z.output<typeof release>;
export type ChartItem = z.output<typeof chart>;
export type ReleasesDomain = z.output<typeof schema>;
