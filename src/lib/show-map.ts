/**
 * Mapeo de un evento de calendario (IcsEvent) a un show del sitio, y utilidades de saneado.
 * Puro: sin Astro ni red. Todo el texto viene de un calendario público editado desde un
 * teléfono, o sea que es un dato NO confiable: se limpia, se acota y nunca se interpreta.
 * El escapado HTML lo hace Astro al renderizar; acá no se genera HTML.
 */
import type { IcsEvent } from './ics.ts';

export type ShowStatus = 'scheduled' | 'soldout' | 'cancelled';

export interface Show {
  id: string;
  source: 'calendar' | 'manual';
  /** Nombre del evento/venue, sin prefijos de estado. */
  title: string;
  status: ShowStatus;
  allDay: boolean;
  /** Día completo: 'YYYY-MM-DD'. Con hora: ISO con offset ('2026-11-28T23:00:00-03:00'). */
  start: string;
  /** Día completo: último día inclusivo (si dura más de uno). Con hora: ISO con offset. */
  end: string | null;
  tz: string;
  address: string | null;
  city: string | null;
  region: string | null;
  /** País tal cual vino (calendario) o null (manual: solo countryCode). */
  country: string | null;
  countryCode: string | null;
  /** Ubicación en una línea, solo cuando no se pudo inferir la ciudad con confianza. */
  location: string | null;
  mapUrl: string | null;
  url: string | null;
  /** Notas en texto plano (saltos de línea respetados). */
  notes: string | null;
}

export const LIMITS = { title: 120, address: 160, city: 80, region: 80, country: 60, location: 200, notes: 600, url: 2000 } as const;

/* ---- Saneado de texto ------------------------------------------------------ */

// Controles C0 (salvo \n y \t), DEL y marcas de dirección bidi que sirven para falsear texto.
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Una línea: sin controles, espacios colapsados, con tope. */
export function cleanLine(s: string, max: number): string {
  return truncate(s.replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim(), max);
}

/** Varias líneas: respeta saltos, quita controles, colapsa líneas vacías repetidas y acota. */
export function cleanMultiline(s: string, max: number): string {
  const t = s
    .replace(BAD_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncate(t, max);
}

/** Solo http(s), sin credenciales ni espacios; devuelve la URL normalizada o null. */
export function safeHttpUrl(input: string): string | null {
  const s = input.trim();
  if (!s || s.length > LIMITS.url || /[\s\u0000-\u001F\u007F]/.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export type NoteToken = { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

/** Notas -> líneas de fragmentos (texto o link). Los links http(s) válidos se convierten; el resto es texto. */
export function linkify(text: string): NoteToken[][] {
  return text.split('\n').map((line) => {
    const tokens: NoteToken[] = [];
    let last = 0;
    for (const m of line.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
      const idx = m.index ?? 0;
      let raw = m[0];
      raw = raw.replace(/[.,;:!?)\]}]+$/, '');
      const href = safeHttpUrl(raw);
      if (!href) continue;
      if (idx > last) tokens.push({ type: 'text', text: line.slice(last, idx) });
      const shown = raw.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
      tokens.push({ type: 'link', text: truncate(shown, 48), href });
      last = idx + raw.length;
    }
    if (last < line.length) tokens.push({ type: 'text', text: line.slice(last) });
    return tokens;
  });
}

/** Primer link http(s) válido que aparece en un texto. */
export function firstHttpUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    const href = safeHttpUrl(m[0].replace(/[.,;:!?)\]}]+$/, ''));
    if (href) return href;
  }
  return null;
}

/* ---- Prefijos de estado en el título ---------------------------------------- */

/** Letras con acento -> base, una a una (misma longitud, para poder cortar el original). */
const stripAccents = (s: string) => s.replace(/[À-ſ]/g, (c) => c.normalize('NFD')[0]);

const SOLD = 'agotad[oa]s?|sold[\\s-]?out';
const CANC = 'cancelad[oa]s?|cancell?ed';
const PREFIX = new RegExp(`^\\s*(?:[\\[(]\\s*(${SOLD}|${CANC})\\s*[\\])]|(${SOLD}|${CANC})\\s*[:|\\-–—])\\s*[-–—:|]?\\s*`, 'i');

export function parseTitle(raw: string): { title: string; status: 'soldout' | 'cancelled' | null } {
  let title = raw;
  let status: 'soldout' | 'cancelled' | null = null;
  for (let i = 0; i < 3; i++) {
    const m = PREFIX.exec(stripAccents(title));
    if (!m) break;
    const word = (m[1] ?? m[2]).toLowerCase();
    const kind = /^(agot|sold)/.test(word) ? 'soldout' : 'cancelled';
    status = status === 'cancelled' || kind === 'cancelled' ? 'cancelled' : 'soldout';
    title = title.slice(m[0].length);
  }
  return { title, status };
}

/* ---- Países ------------------------------------------------------------------ */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

let countryIndex: Map<string, string> | null = null;
function countries(): Map<string, string> {
  if (countryIndex) return countryIndex;
  const idx = new Map<string, string>();
  const names = ['es', 'en'].map((l) => new Intl.DisplayNames([l], { type: 'region' }));
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of A) {
    for (const b of A) {
      const code = a + b;
      for (const dn of names) {
        let name: string | undefined;
        try {
          name = dn.of(code);
        } catch {
          name = undefined;
        }
        if (name && name !== code) idx.set(norm(name), code);
      }
    }
  }
  const aliases: Record<string, string> = {
    'ee uu': 'US', eeuu: 'US', usa: 'US', 'u s a': 'US', uk: 'GB', 'gran bretana': 'GB', 'republica checa': 'CZ',
    'holanda': 'NL', 'paises bajos': 'NL', 'brasil': 'BR',
  };
  for (const [k, v] of Object.entries(aliases)) idx.set(k, v);
  countryIndex = idx;
  return idx;
}

/** Código ISO de un nombre de país en es/en (o un código de 2 letras en mayúsculas); null si no se reconoce. */
export function lookupCountry(part: string): string | null {
  const t = part.trim();
  if (/^[A-Z]{2}$/.test(t)) {
    for (const code of countries().values()) if (code === t) return t;
  }
  return countries().get(norm(t)) ?? null;
}

export function countryLabel(s: Pick<Show, 'country' | 'countryCode'>, lang: 'es' | 'en'): string | null {
  if (s.countryCode) {
    try {
      const n = new Intl.DisplayNames([lang === 'es' ? 'es-AR' : 'en-GB'], { type: 'region' }).of(s.countryCode);
      if (n && n !== s.countryCode) return n;
    } catch {
      /* cae al texto original */
    }
  }
  return s.country ?? s.countryCode;
}

/* ---- Ubicación ----------------------------------------------------------------- */

export interface ParsedLocation {
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  location: string | null;
}

// "B7627 Tandil", "CP 7000 Tandil", "C1425ABC CABA": con prefijo de letras o "CP"; solo dígitos (4-5) únicamente si no es la primera línea.
const POSTAL_PREFIXED = /^(?:c\.?p\.?\s*\d{4,5}|[A-Za-z]{1,3}\s?\d{4,5}(?:[A-Za-z]{3})?)\s+(\S.*)$/i;
const POSTAL_DIGITS = /^\d{4,5}\s+(\S.*)$/;
const US_CITY_STATE = /^(.+?),\s*([A-Za-z]{2})\s+\d{5}(?:-\d{4})?$/;

/**
 * Convierte la ubicación (multilínea de Apple: calle / "CP Ciudad" / provincia / país, o una sola
 * línea separada por comas, o solo un lugar) en campos. Si no se puede inferir la ciudad con
 * confianza, devuelve la ubicación en una línea y no inventa nada.
 */
export function parseLocation(input: string): ParsedLocation {
  const empty: ParsedLocation = { address: null, city: null, region: null, country: null, countryCode: null, location: null };
  let parts = cleanMultiline(input, LIMITS.location * 2)
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return empty;
  const multiline = parts.length > 1;
  if (!multiline && parts[0].includes(',')) parts = parts[0].split(',').map((p) => p.trim()).filter(Boolean);

  let country: string | null = null;
  let countryCode: string | null = null;
  if (parts.length > 1) {
    const code = lookupCountry(parts[parts.length - 1]);
    if (code) {
      countryCode = code;
      country = cleanLine(parts[parts.length - 1], LIMITS.country);
      parts = parts.slice(0, -1);
    }
  }
  const raw = (): ParsedLocation => ({ ...empty, country, countryCode, location: cleanLine(parts.join(', '), LIMITS.location) || null });

  let postalAt = -1;
  let city: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const m = POSTAL_PREFIXED.exec(parts[i]) ?? (i > 0 ? POSTAL_DIGITS.exec(parts[i]) : null);
    if (m) {
      postalAt = i;
      city = m[1];
      break;
    }
  }
  let address: string | null = null;
  let region: string | null = null;
  if (postalAt >= 0) {
    address = parts.slice(0, postalAt).join(', ') || null;
    region = parts.slice(postalAt + 1).join(', ') || null;
  } else if (multiline && parts.length >= 2 && US_CITY_STATE.test(parts[parts.length - 1])) {
    const m = US_CITY_STATE.exec(parts[parts.length - 1])!;
    city = m[1];
    region = m[2].toUpperCase();
    address = parts.slice(0, -1).join(', ') || null;
  } else if (countryCode && parts.length === 2) {
    [address, city] = parts;
  } else if (countryCode && parts.length >= 3) {
    address = parts.slice(0, parts.length - 2).join(', ');
    city = parts[parts.length - 2];
    region = parts[parts.length - 1];
  } else {
    return raw();
  }
  city = city ? cleanLine(city, LIMITS.city) : null;
  if (!city) return raw();
  return {
    address: address ? cleanLine(address, LIMITS.address) : null,
    city,
    region: region ? cleanLine(region, LIMITS.region) : null,
    country,
    countryCode,
    location: null,
  };
}

/* ---- Evento -> show -------------------------------------------------------------- */

export function mapsUrl(geo: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}`;
}

export function mapEvent(ev: IcsEvent): Show | null {
  const { title: stripped, status: fromTitle } = parseTitle(ev.summary);
  const loc = parseLocation(ev.location);
  const notesText = cleanMultiline(ev.description, LIMITS.notes);
  const title = cleanLine(stripped, LIMITS.title) || loc.city || 'Show';
  const status: ShowStatus = ev.status === 'CANCELLED' || fromTitle === 'cancelled' ? 'cancelled' : fromTitle === 'soldout' ? 'soldout' : 'scheduled';
  return {
    id: ev.id,
    source: 'calendar',
    title,
    status,
    allDay: ev.allDay,
    start: ev.start,
    end: ev.end,
    tz: ev.tz,
    address: loc.address,
    city: loc.city,
    region: loc.region,
    country: loc.country,
    countryCode: loc.countryCode,
    location: loc.location,
    mapUrl: ev.geo ? mapsUrl(ev.geo) : null,
    url: safeHttpUrl(ev.url) ?? firstHttpUrl(ev.description),
    notes: notesText || null,
  };
}

/** Fecha local de inicio ('YYYY-MM-DD'). */
export const showDate = (s: Pick<Show, 'start'>) => s.start.slice(0, 10);
/** Hora local de inicio ('HH:MM') o null si es de día completo. */
export const showTime = (s: Pick<Show, 'start' | 'allDay'>) => (s.allDay ? null : s.start.slice(11, 16));
/** Hora de fin 'HH:MM' solo si termina el mismo día local; si cruza la medianoche, null. */
export function showEndTime(s: Pick<Show, 'start' | 'end' | 'allDay'>): string | null {
  if (s.allDay || !s.end || s.end.slice(0, 10) !== s.start.slice(0, 10)) return null;
  return s.end.slice(11, 16);
}
