/**
 * Datos de las páginas de agenda: fechas reales del calendario (src/lib/shows.ts, solo se importa) más las fechas
 * pasadas y residencias de ejemplo (dominio `tour`, ya sin ejemplos si el interruptor global está apagado).
 */
import { getShows } from '../../lib/shows';
import { domain } from '../../lib/data';
import { schema } from '../../lib/schemas/tour';
import { byDateDesc, computeStats, entryFromShow, entryFromTour, groupByYear, mapPoints, type Entry } from '../../lib/agenda/entries';
import type { Show } from '../../lib/show-map';

export interface AgendaData {
  upcoming: Show[];
  past: Show[];
  residencies: ReturnType<typeof domain<typeof schema>>['residencies'];
  /** Próximas (reales). */
  upEntries: Entry[];
  /** Pasadas: reales + de ejemplo, la más reciente primero. */
  pastEntries: Entry[];
  /** Todas (para el mapa). */
  all: Entry[];
}

let memo: Promise<AgendaData> | null = null;

export function loadAgenda(): Promise<AgendaData> {
  memo ??= (async () => {
    const { upcoming, past } = await getShows();
    const tour = domain('tour', schema);
    const upEntries = upcoming.map(entryFromShow);
    const pastEntries = [...past.map(entryFromShow), ...tour.items.map(entryFromTour)].sort(byDateDesc);
    return { upcoming, past, residencies: tour.residencies, upEntries, pastEntries, all: [...upEntries, ...pastEntries] };
  })();
  return memo;
}

/** Puntos del mapa y fechas que no se pudieron ubicar, para un conjunto de entradas. */
export function mapFor(entries: readonly Entry[], upcomingKeys: ReadonlySet<string> = new Set()) {
  return {
    points: mapPoints(entries, upcomingKeys),
    unplaced: entries.filter((e) => e.status !== 'cancelled' && (e.lat === null || e.lon === null)).length,
  };
}

/** Años del archivo: los que tienen fechas visibles más el año en curso (así la ruta siempre genera al menos una página). */
export async function archiveYears(): Promise<number[]> {
  const { pastEntries } = await loadAgenda();
  const years = new Set(groupByYear(pastEntries).map((g) => g.year));
  years.add(new Date().getUTCFullYear());
  return [...years].sort((a, b) => b - a);
}

export { computeStats, groupByYear };
