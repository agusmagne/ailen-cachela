/**
 * Dominio `collective` (paquete oficio): enriquece por `id` los proyectos REALES de site.yaml (SENKA, fragmento.techno, ROOM).
 * Los ítems de `items` son de la artista (no demo): solo llevan id, tipo y relación verificada. Todo lo inventado
 * (manifiesto, ediciones, residentes, bitácora, convocatoria) vive en arreglos con `demo: true` dentro de cada ítem.
 */
import { z } from 'astro/zod';
import { item, items, localized, localizedReq, isoDate, slug } from './_shared.ts';

export const KINDS = ['project', 'collective', 'label'] as const;

const edition = item({
  id: slug,
  title: localizedReq,
  date: isoDate,
  venue: localizedReq,
  lineup: z.array(z.string().min(1)).min(1),
  note: localized,
});
const resident = item({
  id: slug,
  alias: z.string().min(1),
  since: z.number().int().min(2000).max(2100),
  role: localizedReq,
  bio: localizedReq,
});
const entry = item({ id: slug, date: isoDate, title: localizedReq, summary: localizedReq, body: z.array(localizedReq).min(1) });
const call = item({
  id: slug,
  title: localizedReq,
  intro: localizedReq,
  rules: z.array(localizedReq).min(1),
  format: localizedReq,
});

export const schema = z.object({
  items: items(
    item({
      id: slug,
      kind: z.enum(KINDS),
      /** Relación de Ailén con el proyecto: dato verificado (artista.md / brief.md). */
      relation: localizedReq,
      seed: z.string().min(1),
      manifesto: items(item({ id: slug, text: localizedReq })),
      editions: items(edition),
      residents: items(resident),
      log: items(entry),
      calls: items(call),
    }),
  ),
});
export type Collective = z.output<typeof schema>;
