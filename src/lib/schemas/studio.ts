/** Dominio `studio` (paquete oficio): equipo, recorrido, flujo de trabajo y notas de proceso. Todo es de ejemplo. */
import { z } from 'astro/zod';
import { item, items, localizedReq, isoDate, slug } from './_shared.ts';

const spec = z.object({ label: localizedReq, value: localizedReq }).strict();

export const GEAR_CATEGORIES = ['monitoring', 'synth', 'dj', 'processing', 'software'] as const;

export const schema = z.object({
  gear: items(
    item({
      id: slug,
      category: z.enum(GEAR_CATEGORIES),
      /** Descripción genérica del equipo (nunca una marca ni un modelo real sin verificar). */
      name: localizedReq,
      /** Para qué se usa en el estudio. */
      role: localizedReq,
      specs: z.array(spec).default([]),
    }),
  ),
  tour: items(
    item({
      id: slug,
      title: localizedReq,
      caption: localizedReq,
      seed: z.string().min(1),
      layout: z.enum(['wide', 'narrow', 'full']).default('wide'),
    }),
  ),
  workflow: items(item({ id: slug, title: localizedReq, text: localizedReq, output: localizedReq })),
  notes: items(
    item({
      id: slug,
      date: isoDate,
      title: localizedReq,
      tags: z.array(localizedReq).default([]),
      summary: localizedReq,
      body: z.array(localizedReq).min(1),
    }),
  ),
});
export type Studio = z.output<typeof schema>;
