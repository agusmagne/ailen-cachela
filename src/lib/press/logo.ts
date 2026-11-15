/**
 * Isotipo de la artista (el monograma del favicon: lambda de cromo sobre aros concéntricos con una gota rosa),
 * en tres versiones: color (sobre fondo oscuro), negro y blanco (sin fondo, para imprenta y pantallas).
 * Los colores llegan de la paleta del sitio (src/lib/press/tokens.ts): acá no hay valores propios.
 */
import type { Palette } from './tokens.ts';

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type LogoVariant = 'color' | 'negro' | 'blanco';
export const LOGO_VARIANTS: readonly LogoVariant[] = ['color', 'negro', 'blanco'];

const LAMBDA = 'M15 49 32 13 49 49H41.5L32 28.5 22.5 49Z';

export function isotipoSvg(variant: LogoVariant, p: Palette, opts: { title?: string; idPrefix?: string } = {}): string {
  const id = `${opts.idPrefix ?? 'iso'}-${variant}`;
  const title = opts.title ? `<title>${xmlEscape(opts.title)}</title>` : '';
  const aria = opts.title ? 'role="img"' : 'aria-hidden="true"';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ${aria}>${title}`;
  if (variant === 'color') {
    return (
      head +
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p['chrome-50']}"/><stop offset=".48" stop-color="${p['chrome-400']}"/><stop offset=".56" stop-color="${p['chrome-200']}"/><stop offset="1" stop-color="${p['chrome-50']}"/></linearGradient></defs>` +
      `<rect width="64" height="64" fill="${p.bg}"/>` +
      `<circle cx="32" cy="32" r="26" fill="none" stroke="${p['chrome-600']}" stroke-width="1.6"/>` +
      `<circle cx="32" cy="32" r="19" fill="none" stroke="${p['chrome-700']}" stroke-width="1.2"/>` +
      `<path d="${LAMBDA}" fill="url(#${id})"/>` +
      `<circle cx="32" cy="43" r="3" fill="${p.accent}"/></svg>`
    );
  }
  const ink = variant === 'negro' ? p.void : p['chrome-50'];
  return (
    head +
    `<circle cx="32" cy="32" r="26" fill="none" stroke="${ink}" stroke-width="1.6"/>` +
    `<circle cx="32" cy="32" r="19" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".6"/>` +
    `<path d="${LAMBDA}" fill="${ink}"/>` +
    `<circle cx="32" cy="43" r="3" fill="${variant === 'negro' ? p['chrome-50'] : p.void}" stroke="${ink}" stroke-width="1.2"/></svg>`
  );
}

/** Archivo SVG independiente (con prólogo XML) para el ZIP y la descarga directa. */
export const isotipoFile = (variant: LogoVariant, p: Palette, title: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${isotipoSvg(variant, p, { title, idPrefix: 'iso' })}\n`;
