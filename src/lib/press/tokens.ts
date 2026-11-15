/**
 * Lectura de la paleta desde src/styles/tokens.css (única fuente de verdad de los colores). Pura: recibe el texto
 * del CSS, así se prueba con node y el manual de marca nunca duplica valores.
 */
export const PALETTE_IDS = [
  'void',
  'bg',
  'bg-raised',
  'chrome-50',
  'chrome-100',
  'chrome-200',
  'chrome-300',
  'chrome-400',
  'chrome-500',
  'chrome-600',
  'chrome-700',
  'chrome-800',
  'accent',
  'accent-b',
  'accent-c',
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export type Palette = Record<PaletteId, string>;

/** Variables CSS con valor hexadecimal literal ("--chrome-50: #f4f6f9;") -> { 'chrome-50': '#f4f6f9' }. */
export function parseTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (!(m[1] in out)) out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

/** La paleta del sitio. Falla si el CSS ya no define alguno de los colores que usa el kit de prensa. */
export function paletteFrom(css: string): Palette {
  const tokens = parseTokens(css);
  const missing = PALETTE_IDS.filter((id) => !(id in tokens));
  if (missing.length) throw new Error(`tokens.css ya no define: ${missing.map((m) => `--${m}`).join(', ')}`);
  return Object.fromEntries(PALETTE_IDS.map((id) => [id, tokens[id]])) as Palette;
}
