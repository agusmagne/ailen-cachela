import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { ENDPOINTS, GROUPS, RESERVED_PATTERNS, ROUTES, createRouter, pagePatterns, type RouteDef } from '../src/lib/routes-core.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

const mk = (pages: string[], content: Record<string, boolean> = {}, base = '') =>
  // `pages`: patrones ya resueltos (ver pagePatterns)
  createRouter(ROUTES, ENDPOINTS, { pages: () => new Set(pages), hasContent: (d) => content[d] ?? false, base });

test('pagePatterns: convierte archivos de src/pages en patrones de URL', () => {
  const p = pagePatterns(['index.astro', 'en/index.astro', 'musica/index.astro', 'musica/[slug].astro', 'en/music/feed.xml.ts', 'robots.txt.ts', '_privado/x.astro', 'img/logo.png', 'a/[...rest].astro']);
  assert.deepEqual([...p].sort(), ['', 'a/*rest', 'en', 'en/music/feed.xml', 'musica', 'musica/:slug', 'robots.txt']);
});

test('path: es y en, BASE_PATH y parámetros', () => {
  const r = mk([], {}, '/ailen');
  assert.equal(r.path('press', 'es'), '/ailen/prensa/');
  assert.equal(r.path('press', 'en'), '/ailen/en/press/');
  assert.equal(r.path('release', 'en', { slug: 'ahogo ep' }), '/ailen/en/music/ahogo%20ep/');
  assert.equal(r.home('es'), '/ailen/');
  assert.equal(r.home('en'), '/ailen/en/');
  assert.throws(() => r.path('release', 'es'), /Falta el parámetro "slug"/);
  assert.throws(() => r.path('no-existe', 'es'), /Ruta desconocida/);
  assert.deepEqual(r.alternates('booking-terms'), { es: '/ailen/booking/condiciones/', en: '/ailen/en/booking/terms/' });
});

test('una ruta existe solo si están las páginas de los dos idiomas; hasta entonces no se enlaza', () => {
  assert.equal(mk([]).exists('press'), false);
  assert.equal(mk(['prensa']).exists('press'), false, 'solo es');
  const r = mk(['prensa', 'en/press']);
  assert.equal(r.exists('press'), true);
  assert.deepEqual(r.main().map((x) => x.id), ['press']);
  assert.deepEqual(r.index().map((x) => x.id), ['press']);
});

test('requires: oculta de la navegación si el dominio está vacío (p. ej. demo apagado), la página sigue existiendo', () => {
  const pages = ['mixes', 'en/mixes'];
  assert.equal(mk(pages, { mixes: false }).listed('mixes'), false);
  assert.equal(mk(pages, { mixes: false }).exists('mixes'), true);
  assert.equal(mk(pages, { mixes: true }).listed('mixes'), true);
  assert.deepEqual(mk(pages, { mixes: false }).main(), []);
});

test('menú principal: páginas bare y con parámetros quedan fuera; el índice solo trae rutas de primer nivel', () => {
  const r = mk(['lab', 'en/lab', 'lab/en-vivo', 'en/lab/live', 'musica/:slug', 'en/music/:slug', 'musica', 'en/music', 'booking', 'en/booking', 'booking/condiciones', 'en/booking/terms'], { lab: true, releases: true });
  assert.deepEqual(r.main().map((x) => x.id), ['music', 'booking', 'lab']);
  assert.deepEqual(r.index().map((x) => x.id), ['music', 'booking', 'lab']);
  assert.equal(r.exists('booking-terms'), true);
  assert.equal(r.index().some((x) => x.id === 'booking-terms'), false);
});

test('trail y numeral', () => {
  const r = mk([]);
  assert.deepEqual(r.trail('shows-year').map((x) => x.id), ['shows', 'shows-archive', 'shows-year']);
  assert.equal(r.numeral('shows'), 3);
  assert.equal(r.numeral('lab'), 6);
  assert.equal(r.numeral('shows-year'), 3, 'hereda el de su ruta madre');
  assert.equal(r.numeral('privacy'), null);
});

test('endpoints: se anuncian solo si existen', () => {
  const r = mk(['en/mixes/feed.xml', 'manifest.webmanifest']);
  assert.equal(r.endpointExists('feed-mixes', 'en'), true);
  assert.equal(r.endpointExists('feed-mixes', 'es'), false);
  assert.equal(r.endpointExists('manifest', 'es'), true);
  assert.equal(r.endpointExists('manifest', 'en'), true);
  assert.equal(r.endpointHref('calendar', 'en'), '/en/shows/calendar.ics');
});

test('RESERVED_PATTERNS: vistas de impresión y descargables sí; rutas inventadas no', () => {
  const ok = (p: string) => RESERVED_PATTERNS.some((re) => re.test(p));
  for (const p of ['prensa/imprimir', 'en/press/print', 'booking/rider-tecnico/imprimir', 'downloads/press/kit.zip', 'kit/en', '404']) assert.ok(ok(p), p);
  for (const p of ['prensa/extra', 'en/press/imprimir', 'tienda2', 'print']) assert.ok(!ok(p), p);
});

test('registro: ids y rutas únicos, grupos válidos, madres existentes, sin pisar reservas', () => {
  const ids = new Set(ROUTES.map((r) => r.id));
  assert.equal(ids.size, ROUTES.length, 'id repetido');
  const paths = ROUTES.flatMap((r) => [r.path.es, `en/${r.path.en}`]);
  assert.equal(new Set(paths).size, paths.length, 'path repetido');
  for (const r of ROUTES) {
    assert.ok(GROUPS.includes(r.group), `${r.id}: grupo`);
    if (r.parent) assert.ok(ids.has(r.parent), `${r.id}: madre ${r.parent}`);
    assert.equal(r.path.es.split(':').length, r.path.en.split(':').length, `${r.id}: mismos parámetros en es y en`);
    assert.ok(!/^\/|\/$/.test(r.path.es + r.path.en), `${r.id}: sin barras extremas`);
  }
  assert.ok(ROUTES.filter((r) => r.main && !r.bare).length <= 6, 'menú principal: 6 como máximo');
});

/* ---- Contra el repositorio real: src/pages ---------------------------------------------------- */

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [relative(join(root, 'src/pages'), join(dir, e.name)).split(sep).join('/')]));
}
const real = pagePatterns(walk(join(root, 'src/pages')));
const known = new Set<string>();
for (const r of ROUTES as RouteDef[]) {
  known.add(r.path.es);
  known.add(`en/${r.path.en}`);
}
for (const e of ENDPOINTS) {
  known.add(e.path.es);
  if (!e.shared) known.add(`en/${e.path.en}`);
}

test('src/pages: toda página pertenece al registro (o es una reserva): nadie crea rutas por su cuenta', () => {
  const stray = [...real].filter((p) => !known.has(p) && !RESERVED_PATTERNS.some((re) => re.test(p)));
  assert.deepEqual(stray, [], 'Páginas que no están en src/lib/routes-core.ts: ' + stray.join(', '));
});

test('src/pages: cada página existe en los dos idiomas (es y en)', () => {
  const missing: string[] = [];
  for (const r of ROUTES) {
    const es = real.has(r.path.es);
    const en = real.has(`en/${r.path.en}`);
    if (es !== en) missing.push(`${r.id}: ${es ? 'falta la página en inglés' : 'falta la página en español'}`);
  }
  assert.deepEqual(missing, []);
});

test('textos de interfaz: cada ruta del registro tiene su nombre en src/content/ui/base.yaml', () => {
  const ui = parse(readFileSync(join(root, 'src/content/ui/base.yaml'), 'utf8')) as Record<string, { es: string; en: string }>;
  for (const r of ROUTES) assert.ok(ui[`base_route_${r.id.replaceAll('-', '_')}`], `falta base_route_${r.id.replaceAll('-', '_')}`);
  for (const g of GROUPS) assert.ok(ui[`base_group_${g}`], `falta base_group_${g}`);
  for (const e of ENDPOINTS) if (e.titleKey) assert.ok(ui[e.titleKey], `falta ${e.titleKey}`);
});

test('existe el archivo de textos de cada paquete que ya tiene páginas', () => {
  const pkgs = new Set(ROUTES.filter((r) => real.has(r.path.es)).map((r) => r.pkg));
  for (const p of pkgs) assert.ok(existsSync(join(root, `src/content/ui/${p}.yaml`)), `falta src/content/ui/${p}.yaml`);
});
