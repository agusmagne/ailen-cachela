/**
 * Generador de flyers, pósters y fondos: parámetros, semillas y texto. PURO (sin DOM ni canvas): se prueba con `node --test`.
 * El dibujo (shader de cromo + geometría + texto) está en src/scripts/modules/lab-generator.ts.
 *
 * El arte sale del mismo motor que los flyers de Fechas: `flyerSpec` (src/lib/flyer.ts) convierte una semilla y una fecha en
 * parámetros del shader y de la geometría (anillos, arcos, líneas, anillo de 31 marcas con el día en acento). Acá la "semilla"
 * es un texto que escribe la persona (o un dado) en vez del UID de un evento, y `kind` permite forzar la composición.
 */
import { FLYER_KINDS, flyerSpec, unit, type FlyerKind, type FlyerSpec } from '../flyer.ts';

export type FormatId = 'story' | 'post' | 'square' | 'phone' | 'poster';
export interface FormatDef {
  id: FormatId;
  w: number;
  h: number;
  /** "poster": título, line-up, fecha y lugar. "wallpaper": solo arte y firma (la hora del teléfono ocupa la parte alta). */
  layout: 'poster' | 'wallpaper';
  /** fracciones de alto que se dejan libres arriba y abajo (interfaz de Instagram, reloj del teléfono, borde de impresión) */
  safeTop: number;
  safeBottom: number;
}

/** A3 a 200 dpi (2339 x 3307 = 7,7 Mpx): el límite de área de un canvas en iOS es ~16,7 Mpx, y a 300 dpi no entra. */
export const FORMATS: readonly FormatDef[] = [
  { id: 'story', w: 1080, h: 1920, layout: 'poster', safeTop: 0.13, safeBottom: 0.13 },
  { id: 'post', w: 1080, h: 1350, layout: 'poster', safeTop: 0.06, safeBottom: 0.06 },
  { id: 'square', w: 1080, h: 1080, layout: 'poster', safeTop: 0.06, safeBottom: 0.06 },
  { id: 'phone', w: 1170, h: 2532, layout: 'wallpaper', safeTop: 0.3, safeBottom: 0.1 },
  { id: 'poster', w: 2339, h: 3307, layout: 'poster', safeTop: 0.04, safeBottom: 0.04 },
];

export const formatById = (id: string): FormatDef => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

export const LIMITS = { title: 48, lineup: 140, time: 16, place: 56, footer: 44, seed: 40 } as const;

export type KindChoice = 'auto' | FlyerKind;
export const KIND_CHOICES: readonly KindChoice[] = ['auto', ...FLYER_KINDS];

export interface FlyerState {
  title: string;
  lineup: string;
  /** YYYY-MM-DD o vacío */
  date: string;
  time: string;
  place: string;
  footer: string;
  seed: string;
  kind: KindChoice;
  format: FormatId;
}

export const DEFAULT_STATE: FlyerState = {
  title: 'Ailén Cachela',
  lineup: '',
  date: '',
  time: '',
  place: '',
  footer: '',
  seed: 'ailen',
  kind: 'auto',
  format: 'story',
};

/** Texto de usuario a una línea segura: sin caracteres de control, espacios colapsados, acotado por puntos de código. */
export function sanitize(text: unknown, max: number): string {
  const s = String(text ?? '')
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, max).join('').trimEnd();
}

export function sanitizeState(raw: Partial<Record<keyof FlyerState, unknown>>): FlyerState {
  const kind = KIND_CHOICES.includes(raw.kind as KindChoice) ? (raw.kind as KindChoice) : 'auto';
  const fmt = FORMATS.some((f) => f.id === raw.format) ? (raw.format as FormatId) : 'story';
  return {
    title: sanitize(raw.title, LIMITS.title),
    lineup: sanitize(raw.lineup, LIMITS.lineup),
    date: parseIsoDate(String(raw.date ?? '')) ? String(raw.date) : '',
    time: sanitize(raw.time, LIMITS.time),
    place: sanitize(raw.place, LIMITS.place),
    footer: sanitize(raw.footer, LIMITS.footer),
    seed: sanitize(raw.seed, LIMITS.seed),
    kind,
    format: fmt,
  };
}

/** Fecha real YYYY-MM-DD o null. */
export function parseIsoDate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? { y, m: mo, d } : null;
}

const MONTHS = {
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
} as const;
const WEEKDAYS = {
  es: ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'],
  en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
} as const;

export function dateParts(iso: string, lang: 'es' | 'en'): { day: string; month: string; weekday: string; year: string } | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return { day: String(p.d), month: MONTHS[lang][p.m - 1], weekday: WEEKDAYS[lang][wd], year: String(p.y) };
}

/** Semilla efectiva: la escrita, o el título, o una fija. */
export const seedId = (s: Pick<FlyerState, 'seed' | 'title'>) => `lab:${s.seed || s.title || 'ailen'}`;

/** Fecha determinista a partir de la semilla, para cuando no se eligió fecha (así el arte tiene su marca de día). */
export function dateFromSeed(id: string): string {
  const mo = 1 + Math.floor(unit(id, 'month') * 12);
  const d = 1 + Math.floor(unit(id, 'dom') * 28);
  return `2026-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parámetros del arte. Misma semilla + misma fecha + mismo `kind` = mismo arte. Para forzar una composición se prueban
 * sufijos de la semilla (determinista) hasta que `flyerSpec` elige esa; así no hace falta tocar flyer.ts.
 */
export function specFor(s: Pick<FlyerState, 'seed' | 'title' | 'date' | 'kind'>): FlyerSpec {
  const base = seedId(s);
  const date = parseIsoDate(s.date) ? s.date : dateFromSeed(base);
  const make = (id: string) => flyerSpec({ id, start: date, allDay: true, mapUrl: null });
  if (s.kind === 'auto') return make(base);
  for (let i = 0; i < 256; i++) {
    const spec = make(i === 0 ? base : `${base}#${i}`);
    if (spec.kind === s.kind) return spec;
  }
  return make(base);
}

/** Semilla corta al azar para el dado ("K7F2A9"). `rng` devuelve [0,1). */
export function randomSeed(rng: () => number = Math.random, len = 6): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += A[Math.min(A.length - 1, Math.floor(rng() * A.length))];
  return out;
}

/** Tamaño del fondo de shader: se acota la cantidad de píxeles (la geometría y el texto se dibujan después a resolución completa). */
export function shaderSize(w: number, h: number, maxPx = 2_300_000): { w: number; h: number } {
  const k = Math.min(1, Math.sqrt(maxPx / (w * h)));
  return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
}

/** Mayor tamaño de fuente en [minPx, maxPx] con el que `widthAt(px)` cabe en `maxW` (búsqueda binaria). */
export function fitFont(widthAt: (px: number) => number, maxW: number, maxPx: number, minPx: number): number {
  if (widthAt(maxPx) <= maxW) return maxPx;
  let lo = minPx;
  let hi = maxPx;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (widthAt(mid) <= maxW) lo = mid;
    else hi = mid;
  }
  return Math.max(minPx, Math.floor(lo * 10 + 1e-3) / 10);
}

/** Corte de línea voraz; una palabra más ancha que el renglón se parte por letras. Con `maxLines` agrega "…" al final si no entra todo. */
export function wrapLines(measure: (text: string) => number, text: string, maxW: number, maxLines = 99): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const push = (l: string) => lines.push(l);
  for (const word of words) {
    let w = word;
    while (measure(w) > maxW && w.length > 1) {
      // partir por letras
      let n = w.length - 1;
      while (n > 1 && measure(w.slice(0, n)) > maxW) n--;
      if (cur) {
        push(cur);
        cur = '';
      }
      push(w.slice(0, n));
      w = w.slice(n);
    }
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxW) cur = next;
    else {
      if (cur) push(cur);
      cur = w;
    }
  }
  if (cur) push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && measure(`${last}…`) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

export function fileName(s: Pick<FlyerState, 'title' | 'seed'>, f: FormatDef): string {
  const base = slug(s.title) || slug(s.seed) || 'flyer';
  return `ailen-cachela-lab-${base}-${f.w}x${f.h}.png`;
}
