/** Dominio `links`: orden y rótulos del link-in-bio. Los destinos reales salen de site.yaml (links) y del registro de rutas. */
import { z } from 'astro/zod';
import { item, items, localized, localizedReq, slug } from './_shared.ts';

export const schema = z.object({
  items: items(
    item({
      id: slug,
      /** link = enlace de site.yaml (ref = id)  ·  route = página del sitio (ref = id de ruta)  ·  mail = email de contacto. */
      kind: z.enum(['link', 'route', 'mail']),
      ref: z.string().default(''),
      label: localizedReq,
      hint: localized,
      primary: z.boolean().default(false),
    }),
  ),
});
export type LinksData = z.output<typeof schema>;
