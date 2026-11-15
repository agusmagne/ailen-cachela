/**
 * Carga de fechas desde el calendario público con respaldo. Las dependencias de entorno
 * (red, disco, avisos) se inyectan, así la política de fallos se prueba sin red.
 *
 * Política:
 * - Descarga con timeout y reintentos; un archivo que no es iCalendar o viene cortado cuenta como falla.
 * - Éxito: devuelve los shows y (si `persist`) actualiza la copia en caché versionada en el repo.
 * - Falla en modo normal: usa la copia en caché y deja un warning claro; sin copia, devuelve vacío.
 * - Falla en modo estricto: lanza el error (el build falla y queda publicado el sitio anterior).
 * - Un calendario válido pero sin eventos NO es una falla: es el estado real ("sin fechas").
 */
import { parseIcs } from './ics.ts';
import { mapEvent, safeHttpUrl, type Show } from './show-map.ts';

export interface SourceDeps {
  fetchText(url: string, timeoutMs: number): Promise<string>;
  readSnapshot(): string | null;
  writeSnapshot(contents: string): void;
  warn(message: string): void;
  sleep(ms: number): Promise<void>;
}

export interface SourceOptions {
  url: string | null;
  strict: boolean;
  /** Escribir la copia en caché si la lectura funcionó (solo build local). */
  persist: boolean;
  defaultTz: string;
  now: number;
  attempts?: number;
  timeoutMs?: number;
}

export interface SourceResult {
  shows: Show[];
  /** De dónde salieron: 'calendar' (en vivo), 'snapshot' (respaldo) o 'none'. */
  from: 'calendar' | 'snapshot' | 'none';
}

const SNAPSHOT_VERSION = 1;

export function serializeSnapshot(shows: Show[]): string {
  return `${JSON.stringify({ version: SNAPSHOT_VERSION, shows }, null, 2)}\n`;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function isShow(x: unknown): x is Show {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    isStr(s.id) && s.source === 'calendar' && isStr(s.title) &&
    (s.status === 'scheduled' || s.status === 'soldout' || s.status === 'cancelled') &&
    typeof s.allDay === 'boolean' && isStr(s.start) && /^\d{4}-\d{2}-\d{2}/.test(s.start) &&
    isStrOrNull(s.end) && isStr(s.tz) &&
    isStrOrNull(s.address) && isStrOrNull(s.city) && isStrOrNull(s.region) && isStrOrNull(s.country) &&
    isStrOrNull(s.countryCode) && isStrOrNull(s.location) && isStrOrNull(s.mapUrl) && isStrOrNull(s.url) && isStrOrNull(s.notes) &&
    (s.url === null || safeHttpUrl(s.url as string) !== null) &&
    (s.mapUrl === null || safeHttpUrl(s.mapUrl as string) !== null)
  );
}

export function parseSnapshot(text: string | null): Show[] | null {
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { version?: unknown; shows?: unknown };
    if (data.version !== SNAPSHOT_VERSION || !Array.isArray(data.shows) || !data.shows.every(isShow)) return null;
    return data.shows;
  } catch {
    return null;
  }
}

export async function loadCalendarShows(opts: SourceOptions, deps: SourceDeps): Promise<SourceResult> {
  if (!opts.url) return { shows: [], from: 'none' };
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 10000;
  let failure = 'sin detalle';

  for (let i = 1; i <= attempts; i++) {
    try {
      const text = await deps.fetchText(opts.url, timeoutMs);
      const { events, warnings } = parseIcs(text, { defaultTz: opts.defaultTz, now: opts.now });
      for (const w of warnings) deps.warn(`Calendario: ${w}`);
      const shows = events.map(mapEvent).filter((s): s is Show => s !== null);
      if (opts.persist) {
        const next = serializeSnapshot(shows);
        if (deps.readSnapshot() !== next) deps.writeSnapshot(next);
      }
      return { shows, from: 'calendar' };
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      if (i < attempts) await deps.sleep(1000 * 3 ** (i - 1));
    }
  }

  if (opts.strict) {
    throw new Error(`No se pudo leer el calendario de fechas (modo estricto, se conserva el sitio publicado): ${failure}`);
  }
  const snap = parseSnapshot(deps.readSnapshot());
  if (snap) {
    deps.warn(`No se pudo leer el calendario (${failure}). Se usa la copia guardada (src/content/shows.snapshot.json): puede estar desactualizada.`);
    return { shows: snap, from: 'snapshot' };
  }
  deps.warn(`No se pudo leer el calendario (${failure}) y no hay copia guardada: la sección Fechas usa solo las fechas manuales.`);
  return { shows: [], from: 'none' };
}
