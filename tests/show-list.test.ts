import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeShows, splitShows } from '../src/lib/show-list.ts';
import type { Show } from '../src/lib/show-map.ts';
import { NOW, TZ, shows } from './helpers.ts';

const base: Show = {
  id: 'x', source: 'manual', title: 'X', status: 'scheduled', allDay: true, start: '2026-11-20', end: null, tz: TZ,
  address: null, city: 'Tandil', region: null, country: null, countryCode: 'AR', location: null, mapUrl: null, url: null, notes: null,
};
const mk = (p: Partial<Show>): Show => ({ ...base, ...p });

test('próximas ascendentes y pasadas descendentes, según el FIN del evento en hora argentina', () => {
  const list = [
    mk({ id: 'a', title: 'A', start: '2026-11-14' }), // ayer: pasada
    mk({ id: 'b', title: 'B', start: '2026-11-15' }), // hoy (día completo): sigue vigente hasta las 23:59
    mk({ id: 'c', title: 'C', allDay: false, start: '2026-11-15T09:00:00-03:00', end: '2026-11-15T11:00:00-03:00' }), // terminó
    mk({ id: 'd', title: 'D', allDay: false, start: '2026-11-15T10:00:00-03:00', end: '2026-11-15T13:00:00-03:00' }), // en curso
    mk({ id: 'e', title: 'E', allDay: false, start: '2026-11-14T23:00:00-03:00', end: '2026-11-15T02:00:00-03:00' }), // pasada
    mk({ id: 'f', title: 'F', start: '2026-12-01' }),
    mk({ id: 'g', title: 'G', allDay: false, start: '2026-11-15T22:00:00-03:00', end: null }), // sin fin: hasta fin del día
  ];
  const { upcoming, past } = splitShows(list, NOW);
  assert.deepEqual(upcoming.map((s) => s.title), ['B', 'D', 'G', 'F']);
  assert.deepEqual(past.map((s) => s.title), ['C', 'E', 'A']);
});

test('un evento de día completo se vuelve pasado al terminar el día argentino, no el UTC', () => {
  const s = mk({ start: '2026-11-15' });
  assert.equal(splitShows([s], Date.parse('2026-11-16T01:30:00-03:00')).past.length, 1);
  assert.equal(splitShows([s], Date.parse('2026-11-15T23:30:00-03:00')).upcoming.length, 1);
  // 02:00 UTC del 16 = 23:00 del 15 en Argentina: todavía vigente
  assert.equal(splitShows([s], Date.parse('2026-11-16T02:00:00Z')).upcoming.length, 1);
});

test('mergeShows: sin duplicados por UID ni por fecha+nombre; gana el calendario', () => {
  const cal = mk({ id: 'uid-1', source: 'calendar', title: 'Amazonía', start: '2026-11-28T23:00:00-03:00', allDay: false });
  const manual = mk({ id: 'manual-1', title: 'amazonia', start: '2026-11-28' });
  const other = mk({ id: 'manual-2', title: 'Otro', start: '2026-11-28' });
  const merged = mergeShows([cal, cal], [manual, other]);
  assert.deepEqual(merged.map((s) => s.id), ['uid-1', 'manual-2']);
});

test('feed real: la fecha del ejemplo es próxima', () => {
  const { upcoming, past } = splitShows(shows('real-event.ics'), NOW);
  assert.equal(upcoming.length, 1);
  assert.equal(past.length, 0);
});
