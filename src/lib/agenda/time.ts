/**
 * Tiempo de las fechas: cuenta regresiva, estados (por venir / en curso / pasada) y conversión de
 * una fecha a otras zonas horarias. Puro (solo `Intl`): se prueba con `node --test` y lo importan
 * tanto las páginas (en el build) como el módulo de cliente (en el navegador), así que el texto
 * estático y el vivo salen del mismo código.
 */

/** Zona de las fechas del sitio (la de la artista). Argentina no tiene horario de verano. */
export const EVENT_TZ = 'America/Argentina/Buenos_Aires';

export type Phase = 'upcoming' | 'live' | 'past';

export interface Countdown {
  phase: Phase;
  /** Milisegundos hasta el inicio (0 si ya empezó). */
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function countdown(startMs: number, endMs: number, nowMs: number): Countdown {
  const phase: Phase = nowMs < startMs ? 'upcoming' : nowMs <= endMs ? 'live' : 'past';
  const total = phase === 'upcoming' ? startMs - nowMs : 0;
  return {
    phase,
    totalMs: total,
    days: Math.floor(total / DAY),
    hours: Math.floor((total % DAY) / HOUR),
    minutes: Math.floor((total % HOUR) / MIN),
    seconds: Math.floor((total % MIN) / SEC),
  };
}

/* ---- Zonas ------------------------------------------------------------------------------------ */

export interface ZoneDef {
  tz: string;
  es: string;
  en: string;
}

/** Zonas fijas de la tabla "hora en otras zonas" (se calcula en el build: se lee igual sin JS). */
export const ZONES: readonly ZoneDef[] = [
  { tz: 'America/Argentina/Buenos_Aires', es: 'Buenos Aires', en: 'Buenos Aires' },
  { tz: 'America/Sao_Paulo', es: 'São Paulo', en: 'São Paulo' },
  { tz: 'America/Mexico_City', es: 'Ciudad de México', en: 'Mexico City' },
  { tz: 'America/New_York', es: 'Nueva York', en: 'New York' },
  { tz: 'America/Los_Angeles', es: 'Los Ángeles', en: 'Los Angeles' },
  { tz: 'Europe/London', es: 'Londres', en: 'London' },
  { tz: 'Europe/Madrid', es: 'Madrid', en: 'Madrid' },
  { tz: 'Europe/Berlin', es: 'Berlín', en: 'Berlin' },
  { tz: 'Asia/Tokyo', es: 'Tokio', en: 'Tokyo' },
  { tz: 'Australia/Sydney', es: 'Sídney', en: 'Sydney' },
  { tz: 'UTC', es: 'UTC', en: 'UTC' },
];

export function zoneLabel(tz: string, lang: 'es' | 'en'): string {
  const z = ZONES.find((x) => x.tz === tz);
  if (z) return z[lang];
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ');
}

export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Fecha y hora de pared de un instante en una zona. */
export function zoneParts(ms: number, tz: string): ZoneParts {
  const out: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute };
}

/** Desfase con UTC en minutos (positivo al este). */
export function zoneOffsetMinutes(ms: number, tz: string): number {
  const p = zoneParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(ms / MIN) * MIN) / MIN);
}

/** 'UTC−3', 'UTC+5:30', 'UTC'. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? '−' : '+';
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

const dayNumber = (p: ZoneParts) => Math.floor(Date.UTC(p.year, p.month - 1, p.day) / DAY);

/** Diferencia en días de calendario entre la fecha local en `tz` y la fecha local en `baseTz` para el mismo instante. */
export function dayDelta(ms: number, tz: string, baseTz: string): number {
  return dayNumber(zoneParts(ms, tz)) - dayNumber(zoneParts(ms, baseTz));
}

/** Días de calendario (en `tz`) entre "ahora" y el instante objetivo: 0 = hoy, 1 = mañana. */
export function calendarDaysUntil(nowMs: number, targetMs: number, tz: string): number {
  return dayNumber(zoneParts(targetMs, tz)) - dayNumber(zoneParts(nowMs, tz));
}

export interface ZoneView {
  tz: string;
  label: string;
  /** 'sáb 28 nov' */
  date: string;
  /** '23:00' */
  time: string;
  offset: string;
  /** -1, 0 o +1 (a veces más) respecto del día en la zona base. */
  dayDelta: number;
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
function dateFmt(tz: string, lang: 'es' | 'en') {
  const k = `${tz}|${lang}`;
  let f = dateCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
    dateCache.set(k, f);
  }
  return f;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Cómo se ve un instante en una zona (fecha corta, hora 24 h, desfase, cambio de día respecto de la zona base). */
export function convert(ms: number, tz: string, baseTz: string, lang: 'es' | 'en', label?: string): ZoneView {
  const p = zoneParts(ms, tz);
  return {
    tz,
    label: label ?? zoneLabel(tz, lang),
    date: dateFmt(tz, lang).format(new Date(ms)).replace(/\./g, '').replace(/,/g, ''),
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    offset: formatOffset(zoneOffsetMinutes(ms, tz)),
    dayDelta: dayDelta(ms, tz, baseTz),
  };
}
