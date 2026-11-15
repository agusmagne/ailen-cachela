/** Dominio `newsletter`: temas reales del alta; números, ventajas y envío de muestra son de ejemplo (demo: true). */
import { z } from 'astro/zod';
import { item, items, isoDate, localizedReq, slug } from './_shared.ts';

const lines = z.object({ es: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }).strict();

/** `items` = archivo de números anteriores (de ejemplo). */
export const schema = z.object({
  items: items(item({ id: slug, number: z.number().int().positive(), date: isoDate, subject: localizedReq, preview: localizedReq, bullets: lines })),
  perks: items(item({ id: slug, title: localizedReq, text: localizedReq })),
  samples: items(item({ id: slug, subject: localizedReq, lines })),
  topics: items(item({ id: slug, label: localizedReq })),
});
export type Newsletter = z.output<typeof schema>;
