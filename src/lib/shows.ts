/**
 * Fechas del sitio: calendario público de iCloud (leído al compilar) + fechas manuales del YAML.
 * Variables de entorno (todas opcionales):
 * - SHOWS_CALENDAR_URL: pisa `shows.calendar_url` de site.yaml ("off" lo desactiva).
 * - SHOWS_STRICT=1: si el calendario falla, el build falla (lo usan las corridas programadas).
 * - SHOWS_ICS_FILE: lee un .ics local en vez de la red (pruebas visuales; nunca toca la copia en caché).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { site } from './content';
import { loadCalendarShows, type SourceDeps } from './show-source';
import { mergeShows, splitShows, SHOWS_TZ } from './show-list';
import type { Show } from './show-map';

export interface ShowData {
  upcoming: Show[];
  past: Show[];
  /** 'calendar' | 'snapshot' | 'manual' (solo fechas del YAML). */
  source: 'calendar' | 'snapshot' | 'manual';
}

const SNAPSHOT_PATH = resolve(process.cwd(), 'src/content/shows.snapshot.json');

const env = (k: string) => (process.env[k] ?? '').trim();

function calendarUrl(): { url: string | null; overridden: boolean } {
  const fromEnv = env('SHOWS_CALENDAR_URL');
  if (fromEnv) {
    if (fromEnv.toLowerCase() === 'off') return { url: null, overridden: true };
    return { url: fromEnv.replace(/^webcal:\/\//i, 'https://'), overridden: true };
  }
  return { url: site.shows.calendar_url.replace(/^webcal:\/\//i, 'https://') || null, overridden: false };
}

const deps: SourceDeps = {
  async fetchText(url, timeoutMs) {
    const file = env('SHOWS_ICS_FILE');
    if (file) return readFileSync(file, 'utf8');
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'text/calendar, text/plain;q=0.5' } }).catch((e: Error & { cause?: { code?: string } }) => {
      throw new Error(e.cause?.code ?? (e.name === 'TimeoutError' ? `sin respuesta en ${timeoutMs / 1000} s` : e.message));
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error('el calendario pesa más de 2 MB');
    return text;
  },
  readSnapshot() {
    try {
      return readFileSync(SNAPSHOT_PATH, 'utf8');
    } catch {
      return null;
    }
  },
  writeSnapshot(contents) {
    writeFileSync(SNAPSHOT_PATH, contents);
  },
  warn: (m) => console.warn(`[fechas] ${m}`),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function manualShows(): Show[] {
  return site.shows.manual.map((m) => ({
    id: `manual-${m.date}-${m.venue}`,
    source: 'manual' as const,
    title: m.venue,
    status: 'scheduled' as const,
    allDay: true,
    start: m.date,
    end: null,
    tz: SHOWS_TZ,
    address: null,
    city: m.city,
    region: null,
    country: null,
    countryCode: m.country,
    location: null,
    mapUrl: null,
    url: m.url || null,
    notes: null,
  }));
}

async function load(): Promise<ShowData> {
  const { url, overridden } = calendarUrl();
  const file = env('SHOWS_ICS_FILE');
  const now = Date.now();
  const res = await loadCalendarShows(
    {
      url: file ? file : url,
      strict: env('SHOWS_STRICT') === '1',
      // Solo se actualiza la copia versionada en un build local de producción con la URL real del YAML.
      persist: import.meta.env.PROD && !process.env.CI && !overridden && !file,
      defaultTz: SHOWS_TZ,
      now,
    },
    deps,
  );
  const merged = mergeShows(res.shows, manualShows());
  return { ...splitShows(merged, now), source: res.from === 'none' ? 'manual' : res.from };
}

let memo: { at: number; value: Promise<ShowData> } | null = null;

/** Una sola lectura por build (las páginas es/en comparten el resultado). En dev se refresca cada 60 s. */
export function getShows(): Promise<ShowData> {
  if (!memo || (import.meta.env.DEV && Date.now() - memo.at > 60_000)) {
    memo = { at: Date.now(), value: load() };
  }
  return memo.value;
}
