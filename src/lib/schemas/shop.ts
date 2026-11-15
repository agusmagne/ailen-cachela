/** Dominio `shop` (tienda de ejemplo). Esquema puro: solo astro/zod y _shared. Todo producto es de ejemplo (demo: true). */
import { z } from 'astro/zod';
import { item, items, localized, localizedReq, slug } from './_shared.ts';

const paras = z.object({ es: z.array(z.string()).min(1), en: z.array(z.string()).min(1) }).strict();
const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/, 'Fecha y hora ISO con zona (2027-03-20T18:00:00-03:00)')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Fecha inexistente');

export const PRODUCT_KINDS = ['apparel', 'poster', 'physical', 'digital'] as const;
export const PRODUCT_FORMATS = ['tee', 'hoodie', 'tote', 'print', 'vinyl', 'tape', 'pack'] as const;
export const PRODUCT_STATUS = ['soon', 'consult', 'drop', 'soldout'] as const;

const product = item({
  id: slug,
  kind: z.enum(PRODUCT_KINDS),
  format: z.enum(PRODUCT_FORMATS),
  name: localizedReq,
  collection: localizedReq,
  blurb: localizedReq,
  material: localized,
  sizes: z.array(z.string()).default([]),
  dimensions: z.string().default(''),
  /** Tirada limitada; null = sin límite. */
  edition: z.object({ size: z.number().int().positive(), numbered: z.boolean() }).strict().nullable().default(null),
  status: z.enum(PRODUCT_STATUS),
  /** Semilla del arte generativo (Media): misma semilla, misma pieza. */
  seed: z.string().min(1),
  art: z.enum(['cover', 'portrait']).default('portrait'),
  /** Id del drop al que pertenece ('' = catálogo permanente). */
  drop: z.string().default(''),
});

const drop = item({ id: slug, title: localizedReq, note: localizedReq, opens: dateTime });
const policy = item({ id: slug, title: localizedReq, body: paras });

export const schema = z
  .object({ items: items(product), drops: items(drop), policies: items(policy) })
  .superRefine((d, ctx) => {
    const ids = new Set(d.drops.map((x) => x.id));
    d.items.forEach((p, i) => {
      if (p.drop && !ids.has(p.drop)) ctx.addIssue({ code: 'custom', path: ['items', i, 'drop'], message: `El drop "${p.drop}" no existe` });
    });
  });
export type Shop = z.output<typeof schema>;
export type Product = Shop['items'][number];
