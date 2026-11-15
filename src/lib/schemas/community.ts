/** Dominio `community`: niveles y citas de ejemplo (demo: true); canales reales o pendientes. */
import { z } from 'astro/zod';
import { item, items, localized, localizedReq, optUrl, slug } from './_shared.ts';

const lines = z.object({ es: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }).strict();

/** `items` = niveles de membresía de ejemplo. */
export const schema = z.object({
  items: items(item({ id: slug, name: localizedReq, tagline: localizedReq, perks: lines, cadence: localized })),
  quotes: items(item({ id: slug, text: localizedReq, author: localizedReq, context: localizedReq })),
  channels: items(
    item({
      id: slug,
      platform: z.string().min(1),
      label: localizedReq,
      status: z.enum(['live', 'pending']),
      /** id de un enlace de site.yaml (links); si existe, de ahí sale la URL real. */
      siteLink: z.string().default(''),
      url: optUrl.default(''),
    }),
  ),
});
export type Community = z.output<typeof schema>;
