/**
 * Piezas visuales generativas de ejemplo para la sección de fotos de prensa. NO son fotos de la artista: son arte
 * por código, determinista por semilla (misma semilla, mismo SVG), que usa solo la paleta del sitio. Mientras no haya
 * fotos reales, ocupan su lugar rotuladas como ejemplo.
 */
import type { Palette } from './tokens.ts';
import { xmlEscape } from './logo.ts';

export type PieceShape = 'landscape' | 'portrait' | 'square';
/** Tamaño del lienzo (unidades del viewBox; el SVG escala sin pérdida). */
export const PIECE_SIZE: Record<PieceShape, { w: number; h: number }> = {
  landscape: { w: 1600, h: 900 },
  portrait: { w: 900, h: 1200 },
  square: { w: 1200, h: 1200 },
};

/** FNV-1a de 32 bits. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/** mulberry32: generador pseudoaleatorio chico y estable. */
export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n2 = (n: number) => +n.toFixed(2);

export function pressPieceSvg(seed: string, shape: PieceShape, p: Palette, opts: { title?: string } = {}): string {
  const { w, h } = PIECE_SIZE[shape];
  const r = rng(`${seed}|${shape}`);
  const uid = `p${hashSeed(seed).toString(36)}`;
  const cx = w * (0.3 + r() * 0.4);
  const cy = h * (0.3 + r() * 0.4);
  const out: string[] = [];
  out.push(
    `<defs>` +
      `<radialGradient id="${uid}g" cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(Math.max(w, h) * 0.75)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p['chrome-300']}" stop-opacity=".5"/><stop offset=".45" stop-color="${p['chrome-600']}" stop-opacity=".22"/><stop offset="1" stop-color="${p.void}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${uid}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p['chrome-50']}"/><stop offset=".5" stop-color="${p['chrome-400']}"/><stop offset=".58" stop-color="${p['chrome-200']}"/><stop offset="1" stop-color="${p['chrome-100']}"/></linearGradient>` +
      `<filter id="${uid}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="${hashSeed(seed) % 97}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -.3"/></filter>` +
      `</defs>`,
  );
  out.push(`<rect width="${w}" height="${h}" fill="${p.void}"/>`);
  out.push(`<rect width="${w}" height="${h}" fill="url(#${uid}g)"/>`);

  if (shape === 'landscape') {
    if (r() < 0.5) {
      // Anillos concéntricos desplazados
      const count = 22;
      for (let i = 1; i <= count; i++) {
        const rad = i * (Math.max(w, h) / count) * 0.72;
        const emph = i % 5 === 0;
        out.push(`<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(rad)}" fill="none" stroke="${emph ? p['chrome-200'] : p['chrome-600']}" stroke-width="${emph ? 2.2 : 1.2}" opacity="${emph ? 0.75 : 0.9}"/>`);
      }
    } else {
      // Líneas de pista: horizontales con ondulación suave
      const lines = 34;
      for (let i = 0; i < lines; i++) {
        const y = (h / (lines + 1)) * (i + 1);
        const amp = 8 + r() * 46 * Math.sin((i / lines) * Math.PI);
        const ph = r() * Math.PI * 2;
        const f = 2 + r() * 3;
        const pts: string[] = [];
        for (let x = 0; x <= w; x += 40) pts.push(`${x} ${n2(y + Math.sin((x / w) * Math.PI * f + ph) * amp)}`);
        out.push(`<path d="M${pts.join(' L')}" fill="none" stroke="${i % 6 === 0 ? p['chrome-200'] : p['chrome-500']}" stroke-width="${i % 6 === 0 ? 2 : 1.2}" opacity="${n2(0.35 + r() * 0.5)}"/>`);
      }
    }
  } else if (shape === 'portrait') {
    // Arco de cromo sobre aros
    for (let i = 1; i <= 10; i++) out.push(`<circle cx="${w / 2}" cy="${n2(h * 0.62)}" r="${i * 60}" fill="none" stroke="${p['chrome-700']}" stroke-width="1.4"/>`);
    const aw = w * (0.38 + r() * 0.1);
    const top = h * (0.16 + r() * 0.1);
    const base = h * 0.92;
    out.push(`<path d="M${n2(w / 2 - aw)} ${n2(base)} V${n2(top + aw)} A${n2(aw)} ${n2(aw)} 0 0 1 ${n2(w / 2 + aw)} ${n2(top + aw)} V${n2(base)} H${n2(w / 2 + aw * 0.55)} V${n2(top + aw * 1.05)} A${n2(aw * 0.55)} ${n2(aw * 0.55)} 0 0 0 ${n2(w / 2 - aw * 0.55)} ${n2(top + aw * 1.05)} V${n2(base)} Z" fill="url(#${uid}c)"/>`);
  } else {
    // Disco: surcos, etiqueta y un reflejo
    const R = w * 0.44;
    out.push(`<circle cx="${w / 2}" cy="${h / 2}" r="${n2(R)}" fill="${p['chrome-800']}" stroke="${p['chrome-500']}" stroke-width="2"/>`);
    for (let i = 0; i < 36; i++) out.push(`<circle cx="${w / 2}" cy="${h / 2}" r="${n2(R * 0.34 + i * (R * 0.64) / 36)}" fill="none" stroke="${i % 7 === 0 ? p['chrome-400'] : p['chrome-700']}" stroke-width="${i % 7 === 0 ? 1.6 : 1}"/>`);
    out.push(`<circle cx="${w / 2}" cy="${h / 2}" r="${n2(R * 0.26)}" fill="url(#${uid}c)"/>`);
    out.push(`<circle cx="${w / 2}" cy="${h / 2}" r="${n2(R * 0.05)}" fill="${p.void}"/>`);
    const a0 = r() * Math.PI * 2;
    const a1 = a0 + 0.5;
    const x = (a: number, rr: number) => n2(w / 2 + Math.cos(a) * rr);
    const y = (a: number, rr: number) => n2(h / 2 + Math.sin(a) * rr);
    out.push(`<path d="M${x(a0, R * 0.3)} ${y(a0, R * 0.3)} L${x(a0, R)} ${y(a0, R)} A${n2(R)} ${n2(R)} 0 0 1 ${x(a1, R)} ${y(a1, R)} L${x(a1, R * 0.3)} ${y(a1, R * 0.3)} Z" fill="${p['chrome-100']}" opacity=".09"/>`);
  }

  // Gota de acento, única, y grano
  out.push(`<circle cx="${n2(w * (0.12 + r() * 0.76))}" cy="${n2(h * (0.12 + r() * 0.76))}" r="${n2(Math.min(w, h) * 0.014)}" fill="${p.accent}"/>`);
  out.push(`<rect width="${w}" height="${h}" filter="url(#${uid}n)" opacity=".09"/>`);

  const title = opts.title ? `<title>${xmlEscape(opts.title)}</title>` : '';
  const aria = opts.title ? 'role="img"' : 'aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ${aria}>${title}${out.join('')}</svg>`;
}

export const pressPieceFile = (seed: string, shape: PieceShape, p: Palette, title: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${pressPieceSvg(seed, shape, p, { title })}\n`;
