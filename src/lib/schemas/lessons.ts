/** Dominio `lessons` (paquete oficio): clases, mentorías y workshops. El formato es una propuesta de ejemplo. */
import { z } from 'astro/zod';
import { item, items, localizedReq, isoDate, slug } from './_shared.ts';

export const KINDS = ['class', 'mentorship', 'workshop'] as const;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const MODALITIES = ['online', 'inperson', 'hybrid'] as const;

const session = z
  .object({
    date: isoDate,
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Hora HH:MM'),
    spots: z.number().int().positive(),
    place: localizedReq,
  })
  .strict();

export const schema = z.object({
  items: items(
    item({
      id: slug,
      kind: z.enum(KINDS),
      level: z.enum(LEVELS),
      modality: z.enum(MODALITIES),
      title: localizedReq,
      summary: localizedReq,
      topics: z.array(localizedReq).min(1),
      duration: localizedReq,
      sessions: z.array(session).default([]),
      seed: z.string().min(1),
    }),
  ),
  levels: items(item({ id: z.enum(LEVELS), title: localizedReq, text: localizedReq })),
  faq: items(item({ id: slug, q: localizedReq, a: localizedReq })),
});
export type Lessons = z.output<typeof schema>;
