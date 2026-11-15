/**
 * Dominio `tour`: fechas pasadas de ejemplo (archivo por año) y residencias de ejemplo.
 * Todo lo que hay en src/content/tour.yaml es INVENTADO (`demo: true`): las fechas reales salen del calendario
 * de iCloud (src/lib/shows.ts). Puro: solo `astro/zod` y _shared.ts.
 */
import { z } from 'astro/zod';
import { item, items, isoDate, localized, slug } from './_shared.ts';

const place = {
  venue: z.string().min(1),
  city: z.string().min(1),
  /** ISO 3166-1 alfa-2. */
  country: z.string().regex(/^[A-Z]{2}$/),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
};

export const pastDate = item({
  id: slug,
  date: isoDate,
  ...place,
  kind: z.enum(['club', 'festival', 'showcase', 'radio']).default('club'),
  status: z.enum(['played', 'soldout', 'cancelled']).default('played'),
});

export const residency = item({
  id: slug,
  name: localized,
  ...place,
  since: isoDate,
  /** Vacío = sigue en curso. */
  until: z.union([z.literal(''), isoDate]).default(''),
  cadence: localized,
});

export const schema = z
  .object({
    /** Fechas pasadas de ejemplo (archivo). */
    items: items(pastDate),
    residencies: items(residency),
  })
  .strict();

export type TourDomain = z.output<typeof schema>;
export type PastDate = z.output<typeof pastDate>;
export type Residency = z.output<typeof residency>;
