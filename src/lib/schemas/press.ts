/**
 * Dominio `press` (src/content/press.yaml): contenido de la página de prensa / EPK.
 * Todo lo que está acá es de EJEMPLO (`demo: true`): los datos reales (bio corta, ciudad, sello, "Ahogo", perfiles,
 * email de booking) se leen de site.yaml y no se copian. Esquema puro: solo `astro/zod` y _shared.
 */
import { z } from 'astro/zod';
import { item, items, localizedReq, slug } from './_shared.ts';

/** Bios de ejemplo por largo (la corta es la real de site.yaml). */
const bio = item({ id: z.enum(['medium', 'long']), text: localizedReq });
/** Fila extra de la ficha técnica. */
const fact = item({ id: slug, label: localizedReq, value: localizedReq });
/** Guía de pronunciación para presentadores. */
const pronunciation = item({ id: slug, name: z.string().min(1), phonetic: localizedReq, note: localizedReq });
const quote = item({ id: slug, text: localizedReq, outlet: localizedReq, year: z.string().min(1) });
const support = item({ id: slug, name: localizedReq, place: localizedReq });
const testimonial = item({ id: slug, text: localizedReq, author: localizedReq, org: localizedReq });
const milestone = item({ id: slug, year: z.number().int().min(1990).max(2100), title: localizedReq, place: localizedReq });
const statement = item({ id: slug, text: localizedReq });
const policy = item({ id: slug, title: localizedReq, text: localizedReq });
/** Pieza visual generativa de ejemplo (no es una foto de la artista). */
const photo = item({
  id: slug,
  seed: z.string().min(1),
  shape: z.enum(['landscape', 'portrait', 'square']),
  caption: localizedReq,
});
/** Contacto de prensa dedicado (hoy solo hay un email verificado: el de booking). */
const pressContact = item({ id: slug, email: z.string().regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/), note: localizedReq });

export const schema = z.object({
  bios: items(bio),
  facts: items(fact),
  pronunciation: items(pronunciation),
  quotes: items(quote),
  supports: items(support),
  testimonials: items(testimonial),
  timeline: items(milestone),
  statement: items(statement),
  safer: items(policy),
  photos: items(photo),
  contacts: items(pressContact),
});
export type Press = z.output<typeof schema>;
