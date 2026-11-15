/**
 * Parser mínimo de iCalendar (RFC 5545) para leer eventos (VEVENT) de un calendario público.
 * Sin dependencias, sin acceso a la red ni a Astro: se prueba solo con `node --test`.
 *
 * Qué entiende:
 * - Desplegado de líneas, parámetros (con comillas) y escapes de texto (\n \, \; \\).
 * - DTSTART/DTEND/DURATION con VALUE=DATE (día completo), hora local con TZID (zona IANA),
 *   hora flotante (se toma en la zona por defecto) y UTC (Z).
 * - STATUS, URL, LOCATION, DESCRIPTION y coordenadas (GEO o X-APPLE-STRUCTURED-LOCATION "geo:").
 * - Recurrencias SIMPLES: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY con INTERVAL, COUNT, UNTIL, EXDATE,
 *   BYDAY (solo semanal, sin ordinales), BYMONTHDAY (solo mensual) y BYMONTH (solo anual); y
 *   excepciones por RECURRENCE-ID. Una regla más compleja NO se expande: queda solo la primera
 *   ocurrencia y se agrega un aviso en `warnings`. RDATE se ignora.
 *
 * Lo que NO hace: adjuntos (ATTACH), alarmas y VTIMEZONE se ignoran por completo; las zonas se
 * resuelven con la base IANA de Node (Intl), nunca con las reglas embebidas en el archivo.
 *
 * Todo el texto del archivo es un dato no confiable: acá solo se decodifica; el saneado y el
 * límite de largos están en show-map.ts.
 */

export class IcsError extends Error {}

export interface IcsEvent {
  /** UID del evento (más la fecha de la ocurrencia si viene de una recurrencia). */
  id: string;
  summary: string;
  description: string;
  location: string;
  url: string;
  /** STATUS en mayúsculas ('' si no viene). */
  status: string;
  allDay: boolean;
  /** Día completo: 'YYYY-MM-DD'. Con hora: ISO local con offset, p. ej. '2026-11-28T23:00:00-03:00'. */
  start: string;
  /** Día completo: último día INCLUSIVO si dura más de uno. Con hora: fin ISO con offset. Si no hay: null. */
  end: string | null;
  /** Zona del evento (IANA). */
  tz: string;
  geo: { lat: number; lon: number } | null;
}

export interface ParseOptions {
  /** Zona para horas flotantes, día completo y UTC. */
  defaultTz: string;
  /** Instante de referencia (ms) para acotar la expansión de recurrencias. */
  now?: number;
}

export interface ParseResult {
  events: IcsEvent[];
  warnings: string[];
}

type DateOnly = { kind: 'date'; y: number; m: number; d: number };
type DateTime = { kind: 'local' | 'utc'; y: number; m: number; d: number; h: number; mi: number; s: number; tzid: string | null };
type IcsDate = DateOnly | DateTime;

interface Line {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface RawEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  url: string;
  status: string;
  dtstart: IcsDate | null;
  dtend: IcsDate | null;
  duration: string;
  rrule: string;
  exdates: IcsDate[];
  recurrenceId: IcsDate | null;
  geo: { lat: number; lon: number } | null;
}

/* ---- Zonas horarias (Intl, base IANA de Node) --------------------------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    dtf(tz);
    return true;
  } catch {
    return false;
  }
}

/** Diferencia (ms) entre la hora local de `tz` y UTC en el instante `utcMs`. */
function offsetAt(tz: string, utcMs: number): number {
  const sec = Math.floor(utcMs / 1000) * 1000;
  const parts = dtf(tz).formatToParts(new Date(sec));
  const g = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - sec;
}

/** Hora local (campos) de `tz` -> instante UTC en ms. */
function localToUtc(f: { y: number; m: number; d: number; h: number; mi: number; s: number }, tz: string): number {
  const guess = Date.UTC(f.y, f.m - 1, f.d, f.h, f.mi, f.s);
  const o1 = offsetAt(tz, guess);
  const utc = guess - o1;
  const o2 = offsetAt(tz, utc);
  return o2 === o1 ? utc : guess - o2;
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Instante -> ISO con la hora de `tz` y su offset. */
export function toIsoInZone(utcMs: number, tz: string): string {
  const off = offsetAt(tz, utcMs);
  const l = new Date(utcMs + off);
  const total = Math.round(Math.abs(off) / 60000);
  const sign = off < 0 ? '-' : '+';
  return `${l.getUTCFullYear()}-${p2(l.getUTCMonth() + 1)}-${p2(l.getUTCDate())}T${p2(l.getUTCHours())}:${p2(l.getUTCMinutes())}:${p2(l.getUTCSeconds())}${sign}${p2(Math.floor(total / 60))}:${p2(total % 60)}`;
}

/** Fin del día (23:59:59) de 'YYYY-MM-DD' en `tz`, en ms. */
export function endOfDayMs(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return localToUtc({ y, m, d, h: 23, mi: 59, s: 59 }, tz);
}

/** Inicio del día de 'YYYY-MM-DD' en `tz`, en ms. */
export function startOfDayMs(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return localToUtc({ y, m, d, h: 0, mi: 0, s: 0 }, tz);
}

/* ---- Líneas de contenido ------------------------------------------------- */

function splitOutsideQuotes(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (const c of s) {
    if (c === '"') inQ = !inQ;
    if (c === sep && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseLine(raw: string): Line | null {
  let inQ = false;
  let idx = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') inQ = !inQ;
    else if (c === ':' && !inQ) {
      idx = i;
      break;
    }
  }
  if (idx < 1) return null;
  const [name, ...rest] = splitOutsideQuotes(raw.slice(0, idx), ';');
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf('=');
    if (eq < 1) continue;
    const key = p.slice(0, eq).trim().toUpperCase();
    const val = p.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    if (!(key in params)) params[key] = val;
  }
  return { name: name.trim().toUpperCase(), params, value: raw.slice(idx + 1) };
}

/** \n \N \, \; \\ -> caracteres reales. Una sola pasada: no hay doble decodificación. */
export function unescapeText(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/* ---- Fechas --------------------------------------------------------------- */

const dayNum = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const fromDayNum = (n: number): { y: number; m: number; d: number } => {
  const dt = new Date(n * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const weekday = (n: number) => (((n + 4) % 7) + 7) % 7; // 0 = domingo (el día 0 fue jueves)
const ymd = (f: { y: number; m: number; d: number }) => `${f.y}-${p2(f.m)}-${p2(f.d)}`;

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseDateValue(value: string, params: Record<string, string>): IcsDate | null {
  const v = value.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m && (params.VALUE === 'DATE' || !params.VALUE)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? { kind: 'date', y, m: mo, d } : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (!validYmd(y, mo, d) || h > 23 || mi > 59 || s > 60) return null;
  return { kind: m[7] ? 'utc' : 'local', y, m: mo, d, h, mi, s: Math.min(s, 59), tzid: params.TZID?.trim() || null };
}

function parseDurationMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim());
  if (!m) return null;
  const n = (x?: string) => Number(x ?? 0);
  const ms = ((n(m[2]) * 7 + n(m[3])) * 86400 + n(m[4]) * 3600 + n(m[5]) * 60 + n(m[6])) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseGeo(value: string): { lat: number; lon: number } | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(value.trim()) ?? /^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
  return { lat, lon };
}

/* ---- Lectura del archivo -------------------------------------------------- */

function readEvents(text: string): { events: RawEvent[]; warnings: string[] } {
  const warnings: string[] = [];
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') ?? '';
  if (first.trim().toUpperCase() !== 'BEGIN:VCALENDAR') {
    throw new IcsError('El archivo no es un calendario iCalendar (falta BEGIN:VCALENDAR).');
  }
  const lines = src.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');

  const stack: string[] = [];
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let closedCalendar = false;

  for (const raw of lines) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) continue;

    if (line.name === 'BEGIN') {
      const comp = line.value.trim().toUpperCase();
      if (stack.length === 0 && comp !== 'VCALENDAR') throw new IcsError('Estructura inválida: se esperaba VCALENDAR.');
      stack.push(comp);
      if (comp === 'VEVENT' && stack.length === 2) {
        cur = {
          uid: '', summary: '', description: '', location: '', url: '', status: '',
          dtstart: null, dtend: null, duration: '', rrule: '', exdates: [], recurrenceId: null, geo: null,
        };
      }
      continue;
    }
    if (line.name === 'END') {
      const comp = line.value.trim().toUpperCase();
      if (stack.pop() !== comp) throw new IcsError(`Estructura inválida: END:${comp} sin su BEGIN.`);
      if (comp === 'VEVENT' && cur && stack.length === 1) {
        events.push(cur);
        cur = null;
      }
      if (comp === 'VCALENDAR' && stack.length === 0) closedCalendar = true;
      continue;
    }
    // Solo se leen propiedades que cuelgan directo del VEVENT (no de VALARM, etc.).
    if (!cur || stack[stack.length - 1] !== 'VEVENT') continue;

    switch (line.name) {
      case 'UID': cur.uid = line.value.trim(); break;
      case 'SUMMARY': cur.summary = unescapeText(line.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(line.value); break;
      case 'LOCATION': cur.location = unescapeText(line.value); break;
      case 'URL': cur.url = line.value.trim(); break;
      case 'STATUS': cur.status = line.value.trim().toUpperCase(); break;
      case 'DTSTART': cur.dtstart = parseDateValue(line.value, line.params); break;
      case 'DTEND': cur.dtend = parseDateValue(line.value, line.params); break;
      case 'DURATION': cur.duration = line.value.trim(); break;
      case 'RRULE': cur.rrule = line.value.trim(); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(line.value, line.params); break;
      case 'EXDATE':
        for (const v of line.value.split(',')) {
          const d = parseDateValue(v, line.params);
          if (d) cur.exdates.push(d);
        }
        break;
      case 'GEO': cur.geo = parseGeo(line.value) ?? cur.geo; break;
      case 'X-APPLE-STRUCTURED-LOCATION': cur.geo = parseGeo(line.value) ?? cur.geo; break;
      default: break; // ATTACH y el resto se ignoran a propósito
    }
  }
  if (stack.length !== 0 || !closedCalendar) {
    throw new IcsError('El calendario está cortado o corrupto (faltan cierres END).');
  }
  return { events, warnings };
}

/* ---- Resolución de fechas y recurrencias --------------------------------- */

interface Ctx {
  defaultTz: string;
  warnings: string[];
}

function instantOf(d: IcsDate, ctx: Ctx): { ms: number; tz: string } {
  if (d.kind === 'utc') return { ms: Date.UTC(d.y, d.m - 1, d.d, d.h, d.mi, d.s), tz: ctx.defaultTz };
  if (d.kind === 'date') return { ms: localToUtc({ y: d.y, m: d.m, d: d.d, h: 0, mi: 0, s: 0 }, ctx.defaultTz), tz: ctx.defaultTz };
  let tz = ctx.defaultTz;
  if (d.tzid) {
    if (isValidTimeZone(d.tzid)) tz = d.tzid;
    else ctx.warnings.push(`Zona horaria desconocida "${d.tzid.slice(0, 60)}": se usa ${ctx.defaultTz}.`);
  }
  return { ms: localToUtc(d, tz), tz };
}

const keyOf = (d: IcsDate, ctx: Ctx) => (d.kind === 'date' ? `D${d.y}${p2(d.m)}${p2(d.d)}` : `T${instantOf(d, ctx).ms}`);

/** Duración del evento: días (día completo) o milisegundos (con hora; null si no hay fin). */
function spanOf(raw: RawEvent, ctx: Ctx): number | null {
  const s = raw.dtstart!;
  if (s.kind === 'date') {
    if (raw.dtend && raw.dtend.kind === 'date') {
      return Math.max(1, dayNum(raw.dtend.y, raw.dtend.m, raw.dtend.d) - dayNum(s.y, s.m, s.d));
    }
    const dur = raw.duration ? parseDurationMs(raw.duration) : null;
    return dur && dur > 0 ? Math.max(1, Math.round(dur / 86400000)) : 1;
  }
  if (raw.dtend && raw.dtend.kind !== 'date') {
    const ms = instantOf(raw.dtend, ctx).ms - instantOf(s, ctx).ms;
    if (ms > 0) return ms;
    ctx.warnings.push(`El evento "${raw.summary.slice(0, 40)}" termina antes de empezar: se ignora el fin.`);
    return null;
  }
  const dur = raw.duration ? parseDurationMs(raw.duration) : null;
  return dur && dur > 0 ? dur : null;
}

function buildEvent(raw: RawEvent, start: IcsDate, span: number | null, id: string, ctx: Ctx): IcsEvent {
  const base = {
    id,
    summary: raw.summary,
    description: raw.description,
    location: raw.location,
    url: raw.url,
    status: raw.status,
    geo: raw.geo,
  };
  if (start.kind === 'date') {
    const days = span ?? 1;
    const n = dayNum(start.y, start.m, start.d);
    return { ...base, allDay: true, start: ymd(start), end: days > 1 ? ymd(fromDayNum(n + days - 1)) : null, tz: ctx.defaultTz };
  }
  const { ms, tz } = instantOf(start, ctx);
  return { ...base, allDay: false, start: toIsoInZone(ms, tz), end: span && span > 0 ? toIsoInZone(ms + span, tz) : null, tz };
}

const MAX_DAYS_SCANNED = 20000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Expande una regla simple. Devuelve null si la regla no está soportada. */
function expand(raw: RawEvent, winStart: number, winEnd: number, ctx: Ctx): IcsDate[] | null {
  const rule: Record<string, string> = {};
  for (const part of raw.rrule.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  const freq = rule.FREQ?.toUpperCase();
  const supportedFreq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
  if (!freq || !supportedFreq.includes(freq)) return null;
  for (const k of Object.keys(rule)) {
    if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'WKST'].includes(k)) return null;
  }
  const byDay = rule.BYDAY ? rule.BYDAY.toUpperCase().split(',') : null;
  if (byDay && (freq !== 'WEEKLY' || byDay.some((x) => !WEEKDAYS.includes(x)))) return null;
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null;
  if (byMonthDay && (freq !== 'MONTHLY' || byMonthDay.some((x) => !(x >= 1 && x <= 31)))) return null;
  const byMonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : null;
  if (byMonth && (freq !== 'YEARLY' || byMonth.some((x) => !(x >= 1 && x <= 12)))) return null;
  const interval = Math.max(1, parseInt(rule.INTERVAL ?? '1', 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;
  const until = rule.UNTIL ? parseDateValue(rule.UNTIL, {}) : null;
  const wkst = Math.max(0, WEEKDAYS.indexOf((rule.WKST ?? 'MO').toUpperCase()));

  const s = raw.dtstart!;
  const d0 = dayNum(s.y, s.m, s.d);
  const wd0 = weekday(d0);
  const weekStart = (n: number) => n - ((weekday(n) - wkst + 7) % 7);
  const ws0 = weekStart(d0);
  const days = byDay ? byDay.map((x) => WEEKDAYS.indexOf(x)) : [wd0];

  const lastDay = Math.min(Math.floor(winEnd / 86400000) + 1, until ? dayNum(until.y, until.m, until.d) + 1 : Infinity);
  const firstShown = Math.floor(winStart / 86400000) - 1;
  const out: IcsDate[] = [];
  let k = 0;
  for (let n = d0, steps = 0; n <= lastDay && steps < MAX_DAYS_SCANNED; n++, steps++) {
    const f = fromDayNum(n);
    let match = n === d0;
    if (!match) {
      if (freq === 'DAILY') match = (n - d0) % interval === 0;
      else if (freq === 'WEEKLY') match = Math.floor((weekStart(n) - ws0) / 7) % interval === 0 && days.includes(weekday(n));
      else if (freq === 'MONTHLY') {
        const monthDiff = (f.y - s.y) * 12 + (f.m - s.m);
        match = monthDiff % interval === 0 && (byMonthDay ?? [s.d]).includes(f.d);
      } else match = (f.y - s.y) % interval === 0 && (byMonth ?? [s.m]).includes(f.m) && f.d === s.d;
    }
    if (!match) continue;
    k++;
    if (count !== null && k > count) break;
    const occ: IcsDate = s.kind === 'date' ? { kind: 'date', ...f } : { ...s, ...f };
    if (until && until.kind !== 'date' && instantOf(occ, ctx).ms > instantOf(until, ctx).ms) break;
    if (n >= firstShown) out.push(occ);
  }
  return out;
}

/* ---- API ------------------------------------------------------------------ */

export function parseIcs(text: string, opts: ParseOptions): ParseResult {
  const { events: raws, warnings } = readEvents(text);
  const ctx: Ctx = { defaultTz: opts.defaultTz, warnings };
  const now = opts.now ?? Date.now();
  const winStart = now - 400 * 86400000;
  const winEnd = now + 600 * 86400000;

  const valid = raws.filter((r) => {
    if (r.dtstart) return true;
    warnings.push(`Se omite un evento sin fecha de inicio válida ("${r.summary.slice(0, 40)}").`);
    return false;
  });

  // Excepciones de una serie (RECURRENCE-ID), agrupadas por UID
  const overrides = new Map<string, RawEvent[]>();
  for (const r of valid) {
    if (r.recurrenceId && r.uid) overrides.set(r.uid, [...(overrides.get(r.uid) ?? []), r]);
  }
  const used = new Set<RawEvent>();
  const out = new Map<string, IcsEvent>();
  const add = (e: IcsEvent) => out.set(e.id, e);
  const uidOf = (r: RawEvent, i: number) => r.uid || `sin-uid-${i}`;

  valid.forEach((r, i) => {
    if (r.recurrenceId) return; // se procesa junto con su serie (o al final, si queda huérfana)
    const uid = uidOf(r, i);
    const span = spanOf(r, ctx);
    if (!r.rrule) {
      add(buildEvent(r, r.dtstart!, span, uid, ctx));
      return;
    }
    const occurrences = expand(r, winStart, winEnd, ctx);
    if (!occurrences) {
      warnings.push(`Recurrencia no soportada (${r.rrule.slice(0, 60)}): se muestra solo la primera fecha.`);
      add(buildEvent(r, r.dtstart!, span, uid, ctx));
      return;
    }
    const skip = new Set(r.exdates.map((d) => keyOf(d, ctx)));
    const mine = overrides.get(r.uid) ?? [];
    for (const occ of occurrences) {
      const key = keyOf(occ, ctx);
      if (skip.has(key)) continue;
      const ov = mine.find((o) => o.recurrenceId && keyOf(o.recurrenceId, ctx) === key);
      const id = `${uid}@${occ.kind === 'date' ? ymd(occ) : toIsoInZone(instantOf(occ, ctx).ms, instantOf(occ, ctx).tz)}`;
      if (ov) {
        used.add(ov);
        add(buildEvent(ov, ov.dtstart!, spanOf(ov, ctx), id, ctx));
      } else {
        add(buildEvent(r, occ, span, id, ctx));
      }
    }
  });
  valid.forEach((r, i) => {
    if (r.recurrenceId && !used.has(r)) add(buildEvent(r, r.dtstart!, spanOf(r, ctx), `${uidOf(r, i)}@override-${keyOf(r.recurrenceId, ctx)}`, ctx));
  });

  const events = [...out.values()].sort((a, b) => Date.parse(a.start.length === 10 ? `${a.start}T00:00:00Z` : a.start) - Date.parse(b.start.length === 10 ? `${b.start}T00:00:00Z` : b.start));
  return { events, warnings };
}
