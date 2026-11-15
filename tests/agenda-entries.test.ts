import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { byDateDesc, cityKey, computeStats, entryFromShow, entryFromTour, groupByYear, mapPoints, showSlug } from '../src/lib/agenda/entries.ts';
import { cityCoords } from '../src/lib/agenda/places.ts';
import { LAND, MAP_H, MAP_W, graticule, inRing, isLand, landCells, landDots, project } from '../src/lib/agenda/land.ts';
import { schema } from '../src/lib/schemas/tour.ts';
import { pruneDemo } from '../src/lib/demo-core.ts';
import { byTitle, shows } from './helpers.ts';

const tour = () => schema.parse(parse(readFileSync(new URL('../src/content/tour.yaml', import.meta.url), 'utf8')));

test('tour.yaml: válido, todo es de ejemplo y con venues evidentemente ficticios', () => {
  const t = tour();
  assert.ok(t.items.length >= 20);
  assert.ok(t.residencies.length >= 2);
  for (const i of [...t.items, ...t.residencies]) assert.equal(i.demo, true, i.id);
  for (const i of t.items) assert.match(i.venue, /Ejemplo/, `${i.id}: el venue tiene que decir "Ejemplo"`);
  for (const r of t.residencies) assert.match(r.venue, /Ejemplo/);
  assert.equal(new Set(t.items.map((i) => i.id)).size, t.items.length, 'ids únicos');
  assert.ok(t.items.every((i) => i.date <= '2026-11-01'), 'las de ejemplo son pasadas');
});

test('con el interruptor apagado no queda ninguna fecha ni residencia de ejemplo', () => {
  const off = pruneDemo(tour(), false);
  assert.deepEqual(off.items, []);
  assert.deepEqual(off.residencies, []);
  assert.deepEqual(schema.parse({}), { items: [], residencies: [] }, 'dominio vacío válido');
});

test('entryFromShow: coordenadas del GEO del evento; si no, de la ciudad conocida; si no, ninguna', () => {
  const list = shows('agenda/shows.ics');
  const geo = entryFromShow(byTitle(list, 'Nave Prueba; Sala 2'));
  assert.equal(geo.lat, -34.6037);
  assert.equal(geo.demo, false);
  assert.equal(geo.date, '2026-11-28');
  const city = entryFromShow(byTitle(list, 'Club Prueba'));
  assert.equal(city.city, 'Tandil');
  assert.ok(city.lat !== null && city.lat < -36);
  assert.equal(city.status, 'cancelled');
  const none = entryFromShow({ ...byTitle(list, 'Festival Prueba'), city: 'Ciudad Inexistente', mapUrl: null });
  assert.equal(none.lat, null);
});

test('groupByYear, estadísticas y puntos: sin contar canceladas, una marca por ciudad', () => {
  const t = tour();
  const entries = t.items.map(entryFromTour);
  const years = groupByYear(entries);
  assert.deepEqual(years.map((y) => y.year), [...new Set(years.map((y) => y.year))].sort((a, b) => b - a));
  for (const y of years) assert.deepEqual(y.entries, [...y.entries].sort(byDateDesc));
  const st = computeStats(entries);
  const canc = entries.filter((e) => e.status === 'cancelled').length;
  assert.equal(st.dates, entries.length - canc);
  assert.equal(st.hasDemo, true);
  assert.equal(st.byYear.reduce((n, y) => n + y.count, 0), st.dates);
  const pts = mapPoints(entries);
  assert.equal(pts.length, new Set(entries.filter((e) => e.status !== 'cancelled').map(cityKey)).size);
  assert.equal(pts.reduce((n, p) => n + p.count, 0), st.dates);
  assert.ok(pts.every((p) => p.demo));
  assert.equal(computeStats([]).dates, 0);
});

test('un punto con fechas reales y de ejemplo cuenta como real; "upcoming" marca las futuras', () => {
  const real = entryFromShow(byTitle(shows('agenda/shows.ics'), 'Nave Prueba; Sala 2'));
  const demo = entryFromTour({ id: 'x', date: '2025-01-01', venue: 'Club Ejemplo', city: 'Buenos Aires', country: 'AR', lat: -34.6, lon: -58.38, status: 'played', demo: true });
  const [p] = mapPoints([real, demo], new Set([real.key]));
  assert.equal(p.count, 2);
  assert.equal(p.demo, false);
  assert.equal(p.upcoming, true);
  assert.deepEqual(p.years, [2025, 2026]);
});

test('cityCoords: sin acentos ni mayúsculas, alias, y el país desambigua', () => {
  assert.deepEqual(cityCoords('CABA', 'AR'), { lat: -34.6, lon: -58.38 });
  assert.ok(cityCoords('sao paulo'));
  assert.equal(cityCoords('Buenos Aires', 'ES'), null);
  assert.equal(cityCoords('Nowhere'), null);
  assert.equal(cityCoords(null), null);
});

test('showSlug: determinista, ancla válida y distinta por id', () => {
  const a = showSlug({ id: 'abc', start: '2026-11-28T23:00:00-03:00', title: 'Cuartel Ñandú' });
  assert.match(a, /^2026-11-28-cuartel-nandu-[0-9a-z]{4}$/);
  assert.equal(showSlug({ id: 'abc', start: '2026-11-28T23:00:00-03:00', title: 'Cuartel Ñandú' }), a);
  assert.notEqual(showSlug({ id: 'abd', start: '2026-11-28T23:00:00-03:00', title: 'Cuartel Ñandú' }), a);
  assert.match(showSlug({ id: 'z', start: '2026-11-28', title: '***' }), /^2026-11-28-[0-9a-z]{4}$/);
});

test('mapa: la proyección cubre el viewBox y las ciudades conocidas caen sobre tierra o muy cerca de ella', () => {
  const nw = project(82, -170);
  const se = project(-58, 180);
  assert.deepEqual([nw.x, nw.y, se.x, se.y], [0, 0, MAP_W, MAP_H]);
  const ba = project(-34.6, -58.38);
  assert.ok(ba.x > 300 && ba.x < 360 && ba.y > 280 && ba.y < 340);
  assert.equal(isLand(-64, -32), true, 'Argentina central');
  assert.equal(isLand(13.4, 52.5), true, 'Berlín');
  assert.equal(isLand(20, 15), true, 'Sahel');
  assert.equal(isLand(-30, 30), false, 'Atlántico');
  assert.equal(isLand(-150, 0), false, 'Pacífico');
  assert.equal(isLand(34, 43.5), false, 'mar Negro');
  assert.equal(isLand(51, 42), false, 'mar Caspio');
  assert.equal(isLand(135, -25), true, 'Australia');
});

test('mapa: trama de puntos liviana y determinista; polígonos cerrados y válidos', () => {
  const d = landDots();
  assert.equal(landDots(), d);
  assert.ok(landCells(3).length > 1200 && landCells(3).length < 3500);
  assert.ok(d.length < 40_000, `trazo de ${d.length} caracteres`);
  assert.match(d, /^M[\d.]+ [\d.]+h0/);
  assert.match(graticule(30), /^M/);
  for (const ring of LAND) {
    assert.ok(ring.length >= 4);
    for (const [lon, lat] of ring) assert.ok(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
  }
  assert.equal(inRing(0, 0, [[-1, -1], [1, -1], [1, 1], [-1, 1]]), true);
  assert.equal(inRing(2, 0, [[-1, -1], [1, -1], [1, 1], [-1, 1]]), false);
});
