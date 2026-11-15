import { readFileSync } from 'node:fs';
import { parseIcs } from '../src/lib/ics.ts';
import { mapEvent, type Show } from '../src/lib/show-map.ts';

export const TZ = 'America/Argentina/Buenos_Aires';
/** "Ahora" fijo de las pruebas: 15/11/2026 12:00 en Buenos Aires. */
export const NOW = Date.parse('2026-11-15T12:00:00-03:00');

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

export function shows(name: string): Show[] {
  const { events } = parseIcs(fixture(name), { defaultTz: TZ, now: NOW });
  return events.map(mapEvent).filter((s): s is Show => s !== null);
}

export const byTitle = (list: Show[], title: string) => {
  const s = list.find((x) => x.title === title);
  if (!s) throw new Error(`No hay show "${title}" en ${list.map((x) => x.title).join(' | ')}`);
  return s;
};
