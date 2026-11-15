/**
 * Dominio `mixes` (src/content/mixes.yaml). PURO: solo astro/zod y _shared.
 *
 * - Los sets reales de SoundCloud NO se copian: un ítem con `ref: <id de site.listen.tracks>` (sin `demo`) hereda
 *   título y URL. Quedan "sin clasificar" (la artista no indicó si son tracks o sets).
 * - La serie numerada (`number`) con tracklists, lugar y duración es de ejemplo (`demo: true`).
 */
import { z } from 'astro/zod';
import { item, items, localized, isoDate, slug, duration } from './_shared.ts';

const camelot = z.string().regex(/^(1[0-2]|[1-9])[AB]$/, 'Tonalidad Camelot, por ejemplo 8A');

export const mixTrack = z
  .object({
    n: z.number().int().positive(),
    artist: z.string().min(1),
    title: z.string().min(1),
    label: z.string().default(''),
    bpm: z.number().int().min(60).max(200).optional(),
    key: camelot.optional(),
  })
  .strict();

export const mix = item({
  id: slug,
  /** Id de un ítem de site.listen.tracks: hereda título y URL de SoundCloud. */
  ref: z.string().default(''),
  /** Número de la serie (001, 002...). Solo la serie de ejemplo. */
  number: z.number().int().positive().optional(),
  title: z.string().default(''),
  date: z.union([z.literal(''), isoDate]).default(''),
  venue: z.string().default(''),
  duration: z.union([z.literal(''), duration]).default(''),
  description: localized.default({ es: '', en: '' }),
  tags: z.array(z.string().min(1)).default([]),
  tracklist: z.array(mixTrack).default([]),
  wave_seed: z.string().default(''),
});

export const schema = z
  .object({ items: items(mix) })
  .strict()
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    const nums = new Set<number>();
    d.items.forEach((m, i) => {
      if (seen.has(m.id)) ctx.addIssue({ code: 'custom', path: ['items', i, 'id'], message: `id repetido: ${m.id}` });
      seen.add(m.id);
      if (m.number !== undefined) {
        if (nums.has(m.number)) ctx.addIssue({ code: 'custom', path: ['items', i, 'number'], message: `número repetido: ${m.number}` });
        nums.add(m.number);
      }
      if (!m.ref && (!m.title || !m.date || !m.venue || !m.duration)) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: 'Un mix sin `ref` necesita title, date, venue y duration' });
      }
      if (!m.demo && !m.ref) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'demo'], message: 'Un mix inventado debe llevar demo: true' });
      }
    });
  });

export type MixItem = z.output<typeof mix>;
export type MixesDomain = z.output<typeof schema>;
