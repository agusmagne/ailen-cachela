/** Dominio `services` (paquete oficio): servicios de producción. Todo es de ejemplo; sin precios (a consultar). */
import { z } from 'astro/zod';
import { item, items, localizedReq, slug } from './_shared.ts';

export const schema = z.object({
  items: items(
    item({
      id: slug,
      title: localizedReq,
      summary: localizedReq,
      scope: z.array(localizedReq).min(1),
      deliverables: z.array(localizedReq).min(1),
      needs: z.array(localizedReq).min(1),
      timing: localizedReq,
      seed: z.string().min(1),
    }),
  ),
  process: items(item({ id: slug, title: localizedReq, text: localizedReq })),
  faq: items(item({ id: slug, q: localizedReq, a: localizedReq })),
});
export type Services = z.output<typeof schema>;
