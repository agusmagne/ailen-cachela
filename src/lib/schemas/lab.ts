/**
 * Esquema PURO del dominio `lab` (src/content/lab.yaml): las herramientas del Lab que se listan en el hub y en la franja de la home.
 * No son contenido de ejemplo (ningún dato inventado sobre la artista): el sonido es sintetizado y cada herramienta lo aclara.
 */
import { z } from 'astro/zod';
import { item, items, localizedReq, slug } from './_shared.ts';

export const tool = item({
  id: slug,
  /** id de la ruta en src/lib/routes-core.ts */
  route: z.enum(['lab-sequencer', 'lab-visualizer', 'lab-scratch', 'lab-generator', 'lab-live']),
  title: localizedReq,
  text: localizedReq,
  /** etiquetas técnicas cortas (se muestran como chips) */
  tags: z.array(localizedReq).default([]),
});

export const schema = z.object({ items: items(tool) }).strict();
export type LabContent = z.output<typeof schema>;
