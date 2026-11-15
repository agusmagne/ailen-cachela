/**
 * Escritor de calendarios .ics (RFC 5545) para "agregar al calendario" y para suscribirse por webcal://.
 * El parser del calendario de iCloud está en src/lib/ics.ts; este archivo solo ESCRIBE.
 * Determinista: `now` (DTSTAMP) se inyecta; por defecto es el momento del build.
 */
import { fold } from './vcard.ts';

export interface IcsEvent {
  uid: string;
  summary: string;
  /** 'YYYY-MM-DD' (todo el día) o ISO con offset ('2026-11-28T23:00:00-03:00'). */
  start: string;
  /** Mismo formato que start. En todo el día: último día INCLUSIVO. */
  end?: string | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
}

export interface IcsOptions {
  /** Nombre del calendario (X-WR-CALNAME). */
  name: string;
  /** Identificador del productor: -//Ailén Cachela//Sitio//ES */
  prodId?: string;
  now?: Date;
  /** Zona horaria mostrada por los clientes que la leen (X-WR-TIMEZONE). */
  tz?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const pad = (n: number) => String(n).padStart(2, '0');
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

function utc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
const ymd = (iso: string) => iso.replace(/-/g, '');
/** Día siguiente de una fecha 'YYYY-MM-DD' (DTEND de los eventos de todo el día es exclusivo). */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export function buildIcs(events: readonly IcsEvent[], opts: IcsOptions): string {
  const stamp = utc(opts.now ?? new Date());
  const lines: (string | false | null | undefined)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${opts.prodId ?? '-//Ailen Cachela//Sitio oficial//ES'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`,
    opts.tz && `X-WR-TIMEZONE:${opts.tz}`,
  ];
  for (const e of events) {
    const allDay = dateOnly.test(e.start);
    const t0 = new Date(e.start);
    if (!allDay && Number.isNaN(t0.getTime())) throw new Error(`buildIcs: fecha inválida "${e.start}" (${e.uid})`);
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.start)}`, `DTEND;VALUE=DATE:${nextDay(e.end && dateOnly.test(e.end) ? e.end : e.start)}`);
    } else {
      // Sin hora de fin: 3 horas (duración típica de un set largo en el calendario del invitado)
      const t1 = e.end ? new Date(e.end) : new Date(t0.getTime() + 3 * 3600_000);
      lines.push(`DTSTART:${utc(t0)}`, `DTEND:${utc(t1)}`);
    }
    lines.push(
      `SUMMARY:${esc(e.summary)}`,
      e.location && `LOCATION:${esc(e.location)}`,
      e.description && `DESCRIPTION:${esc(e.description)}`,
      e.url && `URL:${e.url}`,
      e.status && `STATUS:${e.status}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return (lines.filter(Boolean) as string[]).map(fold).join('\r\n') + '\r\n';
}
