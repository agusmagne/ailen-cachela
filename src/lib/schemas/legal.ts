/** Dominio `legal`: datos de la titular (campos a completar) y textos de privacidad, accesibilidad y aviso legal. */
import { z } from 'astro/zod';
import { item, items, isoDate, localized, localizedReq, slug } from './_shared.ts';

const lines = z.object({ es: z.array(z.string()), en: z.array(z.string()) }).strict();

export const CHECK_STATUS = ['done', 'partial', 'unverified', 'limit'] as const;

const section = z
  .object({
    id: slug,
    /** Sección que solo tiene sentido mientras haya contenido de ejemplo: desaparece con el interruptor apagado. */
    demo: z.boolean().optional(),
    title: localizedReq,
    paras: lines.default({ es: [], en: [] }),
    bullets: lines.default({ es: [], en: [] }),
    checks: z
      .array(z.object({ id: slug, area: localizedReq, status: z.enum(CHECK_STATUS), text: localizedReq, demo: z.boolean().optional() }).strict())
      .default([]),
    note: localized.optional(),
    /** Enlace interno a una ruta del registro (se muestra solo si la página existe). */
    link: z.object({ route: z.string(), label: localizedReq }).strict().optional(),
    /** Bloque especial dentro de la sección: modo sin conexión, tipografías, herramientas o campos de la titular. */
    widget: z.enum(['offline', 'fonts', 'tech', 'holder']).optional(),
  })
  .strict();

const doc = z.object({ title: localizedReq, lead: localizedReq, updated: isoDate, sections: z.array(section).min(1) }).strict();

/** `items` = campos de datos de la titular, a completar (value vacío = "A completar"). */
export const schema = z.object({
  items: items(item({ id: slug, label: localizedReq, hint: localizedReq, value: z.string().default('') })),
  docs: z.record(z.string(), doc).default({}),
});
export type Legal = z.output<typeof schema>;
export type LegalDoc = z.output<typeof doc>;
