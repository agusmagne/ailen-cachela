/**
 * Dominio `videos` (paquete oficio). Los videos son de ejemplo y NO tienen id de plataforma: la fachada es inerte,
 * así nada se pide jamás a un tercero. Cuando haya videos reales se agrega `provider`/`youtube_id` en un esquema nuevo.
 */
import { z } from 'astro/zod';
import { item, items, localizedReq, slug } from './_shared.ts';

export const CATEGORIES = ['live', 'aftermovie', 'visuals'] as const;

export const schema = z.object({
  items: items(
    item({
      id: slug,
      title: localizedReq,
      category: z.enum(CATEGORIES),
      year: z.number().int().min(2000).max(2100),
      duration: z.string().regex(/^(\d{1,2}:)?\d{1,2}:\d{2}$/, 'Duración mm:ss o h:mm:ss'),
      place: localizedReq,
      summary: localizedReq,
      featured: z.boolean().default(false),
    }),
  ),
});
export type Videos = z.output<typeof schema>;
