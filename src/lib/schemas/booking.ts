/**
 * Dominio `booking` (src/content/booking.yaml). PURO: solo astro/zod y _shared.
 *
 * Todo lo que describe condiciones, equipo, hospitalidad o representación es una PLANTILLA DE EJEMPLO: cada ítem lleva
 * `demo: true`, se rotula en pantalla y desaparece con el interruptor global. Lo único real del paquete es el email de
 * booking (site.contact.email) y los nombres de modelo verificados de Pioneer DJ (ver VERIFIED_MODELS).
 */
import { z } from 'astro/zod';
import { item, items, localizedReq, slug } from './_shared.ts';

/** Nombres de equipo verificados en la web de Pioneer DJ (investigación pro-booking). Cualquier otro modelo es "a confirmar". */
export const VERIFIED_MODELS = ['CDJ-3000X', 'DJM-V10', 'DJM-A9', 'DJM-S11', 'PLX-1000'] as const;
export type VerifiedModel = (typeof VERIFIED_MODELS)[number];

export const RIG_MODES = ['dj', 'live', 'hybrid'] as const;
export type RigMode = (typeof RIG_MODES)[number];

export const PRIORITIES = ['must', 'nice'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Tipos de pieza que el diagrama de cabina sabe dibujar. */
export const GEAR_KINDS = ['deck', 'mixer', 'turntable', 'laptop', 'monitor', 'mic', 'synth', 'drum', 'interface', 'fx'] as const;
export type GearKind = (typeof GEAR_KINDS)[number];

const gear = z
  .object({
    kind: z.enum(GEAR_KINDS),
    qty: z.number().int().min(1).max(8),
    /** Nombre de modelo. Solo los de VERIFIED_MODELS salen como confirmados; el resto lleva `confirm: true` y un nombre genérico. */
    model: localizedReq,
    /** "a confirmar con la artista": no es un nombre verificado. */
    confirm: z.boolean().default(false),
  })
  .strict();

const lines = z.array(localizedReq).default([]);

export const schema = z.object({
  /** Representación por territorio (ejemplo). */
  items: items(
    item({
      id: slug,
      region: localizedReq,
      agency: localizedReq,
      note: localizedReq,
    }),
  ),
  /** "Cómo trabajo": pasos del proceso. */
  process: items(item({ id: slug, title: localizedReq, text: localizedReq })),
  /** Configuraciones de cabina aceptables (rider técnico). */
  rigs: items(
    item({
      id: slug,
      mode: z.enum(RIG_MODES),
      name: localizedReq,
      /** Configuración preferida. */
      primary: z.boolean().default(false),
      gear: z.array(gear).min(1),
      note: localizedReq,
    }),
  ),
  /** Requisitos de sala: energía, monitoreo, micrófono, mesa, luz. */
  requirements: items(item({ id: slug, label: localizedReq, text: localizedReq })),
  /** Lo que lleva la artista. */
  brings: items(item({ id: slug, text: localizedReq })),
  /** Qué pasa si el equipo del venue no coincide. */
  mismatch: items(item({ id: slug, text: localizedReq })),
  /** Variante live / híbrido: lista de entradas (input list). */
  inputs: items(
    item({
      id: slug,
      ch: z.number().int().min(1).max(48),
      source: localizedReq,
      connection: z.string().min(1),
      note: localizedReq,
    }),
  ),
  /** Hoja de cues (live / sets con cambios). */
  cues: items(
    item({
      id: slug,
      at: z.string().regex(/^[+-]?\d{1,3}(:\d{2})?$/, 'Minutos o mm:ss'),
      cue: localizedReq,
      signal: localizedReq,
      action: localizedReq,
      fallback: localizedReq,
    }),
  ),
  /** Hospitalidad: grupos con renglones imprescindibles / "si está disponible". */
  hospitality: items(
    item({
      id: slug,
      title: localizedReq,
      intro: localizedReq,
      lines: z.array(z.object({ priority: z.enum(PRIORITIES), text: localizedReq }).strict()).min(1),
    }),
  ),
  /** Condiciones de contratación (plantilla). */
  terms: items(
    item({
      id: slug,
      title: localizedReq,
      text: localizedReq,
      points: lines,
      /** Qué hay que decidir con la artista, el contador o el abogado antes de usar este texto. */
      review: localizedReq,
    }),
  ),
});
export type BookingData = z.infer<typeof schema>;
export type Rig = BookingData['rigs'][number];
export type RigGear = Rig['gear'][number];
