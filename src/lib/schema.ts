import { z } from 'astro/zod';

const localized = z.object({ es: z.string(), en: z.string() }).strict();
const optUrl = z.union([z.literal(''), z.url()]);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato YYYY-MM-DD')
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d);
  }, 'Fecha inexistente');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal #rrggbb');

export const siteSchema = z
  .object({
    site: z.object({ name: z.string().min(1), theme_color: hex, title: localized, description: localized }).strict(),
    artist: z
      .object({
        name: z.string().min(1),
        role: localized,
        city: z.string().min(1),
        country: z.string().min(1),
        country_code: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166 alpha-2, 2 letras mayúsculas'),
        genre: z.string(),
      })
      .strict(),
    hero: z.object({ media: z.string(), media_alt: localized, poster: z.string() }).strict(),
    links: z.array(
      z
        .object({
          id: z.string().min(1),
          platform: z.string().min(1),
          label: z.string(),
          handle: z.string().min(1),
          url: optUrl,
          nav: z.boolean(),
          contact: z.boolean(),
          footer: z.boolean(),
          same_as: z.boolean(),
        })
        .strict(),
    ),
    listen: z
      .object({
        profile_url: optUrl,
        featured: z.string(),
        tracks: z.array(
          z
            .object({
              id: z.string().min(1),
              title: z.string().min(1),
              url: z.url(),
              kind: z.enum(['unclassified', 'track', 'set']),
            })
            .strict(),
        ),
      })
      .strict(),
    releases: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          catalog: z.string(),
          label: z.object({ name: z.string().min(1), url: optUrl }).strict(),
          date: isoDate,
          format: localized,
          compilation: z.object({ artists: z.array(z.string().min(1)).min(2) }).strict().nullable(),
          own_tracks: z.array(
            z
              .object({
                number: z.number().int().positive(),
                title: z.string().min(1),
                duration: z.string().regex(/^\d{1,2}:\d{2}$/, 'Duración mm:ss'),
              })
              .strict(),
          ),
          cover: z.string(),
          cover_alt: localized,
          url: optUrl,
        })
        .strict(),
    ),
    projects: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1),
          visible: z.boolean(),
          status: localized,
          text: localized,
          handle: z.string(),
          platform: z.string(),
          url: optUrl,
        })
        .strict(),
    ),
    shows: z
      .object({
        // URL pública del calendario de iCloud (https:// o webcal://). Vacía = solo fechas manuales.
        calendar_url: z.union([z.literal(''), z.string().regex(/^(https?|webcal):\/\/\S+$/i, 'URL https:// o webcal://')]),
        manual: z.array(
          z
            .object({
              date: isoDate,
              venue: z.string().min(1),
              city: z.string().min(1),
              country: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166 alpha-2, 2 letras mayúsculas'),
              url: optUrl.default(''),
            })
            .strict(),
        ),
      })
      .strict(),
    about: z
      .object({ bio: localized, bio_long: localized, photo: z.string(), photo_alt: localized })
      .strict(),
    contact: z.object({ email: z.email(), email_in_jsonld: z.boolean() }).strict(),
    ui: z.record(z.string(), localized),
    // Interruptor global del contenido de ejemplo (ver src/lib/demo-core.ts). Se puede pisar con DEMO_CONTENT=0|1.
    demo_content: z.boolean().default(true),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.listen.featured && !d.listen.tracks.some((t) => t.id === d.listen.featured)) {
      ctx.addIssue({ code: 'custom', path: ['listen', 'featured'], message: 'No coincide con ningún id de listen.tracks' });
    }
  });

export type SiteContent = z.infer<typeof siteSchema>;
export type Localized = z.infer<typeof localized>;
