/**
 * Piezas de esquema compartidas por todos los dominios (src/lib/schemas/<dominio>.ts, que deben ser PUROS: solo `astro/zod`
 * y este archivo; así tests/content.test.ts los valida con node).
 * Un paquete las importa; no las edita. Si necesita una pieza nueva, la define en su propio esquema.
 */
import { z } from 'astro/zod';

/** Texto es/en: los dos obligatorios (puede ser cadena vacía). */
export const localized = z.object({ es: z.string(), en: z.string() }).strict();
/** Texto es/en que no puede estar vacío. */
export const localizedReq = z.object({ es: z.string().min(1), en: z.string().min(1) }).strict();
export const optUrl = z.union([z.literal(''), z.url()]);
export const url = z.url();
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato YYYY-MM-DD')
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d);
  }, 'Fecha inexistente');
/** Identificador para URLs: minúsculas, números y guiones. */
export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug en minúsculas con guiones');
/** mm:ss o h:mm:ss */
export const duration = z.string().regex(/^(\d{1,2}:)?\d{1,2}:\d{2}$/, 'Duración mm:ss o h:mm:ss');
/** Nombre de archivo dentro de src/assets/media/ (vacío = sin archivo; el componente usa una pieza generativa). */
export const mediaFile = z.string();

/** Marca de contenido de ejemplo. Obligatoria de pensar, no de escribir: por defecto es dato real. */
export const demoFlag = z.boolean().default(false);

/**
 * Elemento de un arreglo de datos: objeto estricto con `demo`. Todo ítem inventado lleva `demo: true`.
 *   const release = item({ id: slug, title: z.string() });
 */
export function item<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...shape, demo: demoFlag }).strict();
}

/** Lista principal de un dominio: se llama `items`, por defecto vacía (dominio sin contenido = estado vacío digno). */
export const items = <T extends z.ZodType>(schema: T) => z.array(schema).default([]);
