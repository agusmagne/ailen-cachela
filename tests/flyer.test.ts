import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLYER_KINDS, flyerShapes, flyerSpec, showCoords, unit } from '../src/lib/flyer.ts';
import type { Show } from '../src/lib/show-map.ts';
import { byTitle, shows } from './helpers.ts';

const mk = (id: string, p: Partial<Show> = {}) =>
  ({ id, start: '2026-11-28T23:00:00-03:00', allDay: false, mapUrl: null, ...p }) as Pick<Show, 'id' | 'start' | 'allDay' | 'mapUrl'>;

test('determinista: el mismo id da exactamente el mismo flyer; la semilla no depende de fecha ni estado', () => {
  const a = flyerSpec(mk('794EBB2F-9DA4'));
  const b = flyerSpec(mk('794EBB2F-9DA4'));
  assert.deepEqual(a, b);
  assert.deepEqual(flyerShapes(a, 100), flyerShapes(b, 100));
  const moved = flyerSpec(mk('794EBB2F-9DA4', { start: '2027-01-03', allDay: true }));
  assert.equal(moved.seedA, a.seedA);
  assert.equal(moved.seedB, a.seedB);
  assert.equal(moved.kind, a.kind);
});

test('unit() queda en [0, 1) y cambia con el id y con el canal', () => {
  for (const id of ['', 'a', 'b', 'x'.repeat(200)]) assert.ok(unit(id, 'k') >= 0 && unit(id, 'k') < 1);
  assert.notEqual(unit('a', 'k'), unit('b', 'k'));
  assert.notEqual(unit('a', 'k'), unit('a', 'j'));
});

test('variación: seis fechas seguidas no son copias (composición, semilla, foco y geometría)', () => {
  const list = shows('statuses.ics').slice(0, 6);
  assert.equal(list.length, 6);
  const specs = list.map(flyerSpec);
  const distinct = (f: (s: (typeof specs)[number]) => unknown) => new Set(specs.map((s) => JSON.stringify(f(s)))).size;
  assert.equal(distinct((s) => [s.seedA, s.seedB]), 6, 'semillas del shader distintas');
  assert.equal(distinct((s) => [s.fx, s.fy]), 6, 'focos distintos');
  assert.equal(distinct((s) => s.scale), 6);
  assert.ok(distinct((s) => s.kind) >= 2, 'al menos dos composiciones distintas');
  assert.equal(new Set(specs.map((s) => JSON.stringify(flyerShapes(s, 100)))).size, 6);
});

test('con muchos ids salen las cuatro composiciones y los parámetros caen en rango', () => {
  const kinds = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const s = flyerSpec(mk(`uid-${i}`, { start: `2026-12-${String(1 + (i % 28)).padStart(2, '0')}T21:00:00-03:00` }));
    kinds.add(s.kind);
    assert.ok(s.fx >= 0.34 && s.fx <= 0.66 && s.fy >= 0.36 && s.fy <= 0.64);
    assert.ok(s.seedA >= 0 && s.seedA <= 40 && s.t0 >= 2 && s.t0 <= 14 && s.scale >= 1.1 && s.scale <= 1.95);
    assert.ok(s.count >= 7 && s.count <= 30 && s.gap > 0);
    const g = flyerShapes(s, 150);
    for (const n of [...g.ticks.flatMap((t) => [t.x1, t.y1, t.x2, t.y2]), ...g.rings.flatMap((r) => [r.r, r.cx, r.cy])]) assert.ok(Number.isFinite(n));
  }
  assert.deepEqual([...kinds].sort(), [...FLYER_KINDS].sort());
});

test('rasgos de datos reales: día del mes, día de la semana y hora', () => {
  const s = flyerSpec(mk('x', { start: '2026-11-28T23:30:00-03:00' }));
  assert.equal(s.day, 28);
  assert.equal(s.weekday, 6); // sábado
  assert.equal(s.hour, 23.5);
  const g = flyerShapes(s, 100);
  assert.equal(g.ticks.length, 31);
  assert.equal(g.ticks.filter((t) => t.day).length, 1);
  assert.equal(g.ticks.findIndex((t) => t.day), 27, 'la marca de acento es la del día 28');
  assert.ok(g.hour, 'con hora hay muesca de hora');
  const allDay = flyerSpec(mk('x', { start: '2026-12-05', allDay: true }));
  assert.equal(allDay.hour, null);
  assert.equal(flyerShapes(allDay, 100).hour, null, 'de día completo no se inventa una hora');
});

test('coordenadas: salen del mapa del evento y fijan el foco; sin ellas el foco sale del id', () => {
  const real = byTitle(shows('real-event.ics'), 'Amazonia');
  assert.deepEqual(showCoords(real), { lat: -37.316024, lon: -59.144584 });
  const withGeo = flyerSpec(real);
  assert.equal(withGeo.geo, true);
  const noGeo = flyerSpec({ ...real, mapUrl: null });
  assert.equal(noGeo.geo, false);
  assert.notEqual(noGeo.fx, withGeo.fx);
  assert.equal(showCoords({ mapUrl: 'https://example.com/?query=abc' }), null);
  assert.equal(showCoords({ mapUrl: 'https://www.google.com/maps/search/?api=1&query=999,10' }), null);
  assert.equal(showCoords({ mapUrl: null }), null);
});
