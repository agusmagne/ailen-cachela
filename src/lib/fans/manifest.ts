/** Web app manifest (puro: se prueba con node:test). Todas las URL respetan BASE_PATH (`base` sin barra final). */
export interface ManifestShortcut {
  name: string;
  /** Ruta absoluta del sitio, ya con BASE_PATH. */
  url: string;
}

export interface ManifestOptions {
  base: string;
  name: string;
  shortName: string;
  description: string;
  lang: string;
  themeColor: string;
  backgroundColor: string;
  shortcuts?: ManifestShortcut[];
}

export const MANIFEST_ICONS = [
  { file: 'icons/icon-192.png', sizes: '192x192', purpose: 'any' },
  { file: 'icons/icon-512.png', sizes: '512x512', purpose: 'any' },
  { file: 'icons/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
] as const;

export function buildManifest(o: ManifestOptions) {
  const base = o.base.replace(/\/+$/, '');
  const scope = `${base}/`;
  return {
    id: scope,
    name: o.name,
    short_name: o.shortName,
    description: o.description,
    lang: o.lang,
    dir: 'ltr',
    start_url: scope,
    scope,
    display: 'standalone',
    orientation: 'any',
    theme_color: o.themeColor,
    background_color: o.backgroundColor,
    categories: ['music', 'entertainment'],
    icons: MANIFEST_ICONS.map((i) => ({ src: `${base}/${i.file}`, sizes: i.sizes, type: 'image/png', purpose: i.purpose })),
    shortcuts: (o.shortcuts ?? []).map((s) => ({ name: s.name, short_name: s.name, url: s.url, icons: [{ src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' }] })),
  };
}
