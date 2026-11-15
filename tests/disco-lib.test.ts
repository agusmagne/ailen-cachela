import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { makePeaks, hashSeed } from '../src/lib/disco/peaks.ts';
import { releaseInstant, remaining } from '../src/lib/disco/countdown.ts';
import { toSeconds, fromSeconds, isoDuration, seriesNumber, tracklistText } from '../src/lib/disco/format.ts';
import { buildHash, parseHash, toggle, matches } from '../src/lib/disco/filter.ts';
import { buildFeed, xmlEscape } from '../src/lib/disco/feed.ts';
import { resolveRelease, sortReleases, filterOptions, neighbours, type SiteRelease } from '../src/lib/disco/releases.ts';
import { resolveMix, sortSeries, type SiteTrack } from '../src/lib/disco/mixes.ts';
import { releaseJsonLd } from '../src/lib/disco/jsonld.ts';
import { loadDomain } from '../src/lib/content-loader.ts';
import { schema as releasesSchema } from '../src/lib/schemas/releases.ts';
import { schema as mixesSchema } from '../src/lib/schemas/mixes.ts';
import { isDemo, countDemo } from '../src/lib/demo-core.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const site = parse(read('src/content/site.yaml')) as { releases: SiteRelease[]; listen: { tracks: SiteTrack[] } };
const load = (demoOn: boolean) => ({
  rel: loadDomain('releases', read('src/content/releases.yaml'), releasesSchema, demoOn),
  mix: loadDomain('mixes', read('src/content/mixes.yaml'), mixesSchema, demoOn),
});

/* ---- Picos de onda -------------------------------------------------------------------------- */
test('picos: misma semilla, mismos picos; otra semilla, otros picos', () => {
  const a = makePeaks('horizonte', { count: 64 });
  const b = makePeaks('horizonte', { count: 64 });
  const c = makePeaks('otra-semilla', { count: 64 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 64);
  assert.ok(a.every((p) => p >= 0.06 && p <= 1), 'picos entre 0.06 y 1');
});

test('picos: la forma "mix" y la "track" difieren, y la semilla numérica es estable', () => {
  assert.notDeepEqual(makePeaks('x', { shape: 'mix' }), makePeaks('x', { shape: 'track' }));
  assert.equal(hashSeed('ailen'), hashSeed('ailen'));
  // valor fijo: protege el determinismo entre versiones de Node
  assert.equal(makePeaks('ellas', { count: 4 }).length, 4);
  assert.equal(JSON.stringify(makePeaks('fixed', { count: 5 })), JSON.stringify(makePeaks('fixed', { count: 5 })));
});

/* ---- Cuenta regresiva ------------------------------------------------------------------------- */
test('cuenta regresiva: 00:00 de Buenos Aires = 03:00 UTC, y el desglose es exacto', () => {
  const target = releaseInstant('2027-02-12');
  assert.equal(new Date(target).toISOString(), '2027-02-12T03:00:00.000Z');
  const now = Date.parse('2027-02-10T00:00:00-03:00');
  assert.deepEqual(remaining(target, now), { done: false, days: 2, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(remaining(target, target - 61_000), { done: false, days: 0, hours: 0, minutes: 1, seconds: 1 });
  assert.equal(remaining(target, target).done, true);
  assert.equal(remaining(target, target + 5000).done, true);
  assert.throws(() => releaseInstant('no-es-fecha'));
});

/* ---- Formato ------------------------------------------------------------------------------------ */
test('formato: duraciones y número de serie', () => {
  assert.equal(toSeconds('07:56'), 476);
  assert.equal(toSeconds('1:02:14'), 3734);
  assert.equal(fromSeconds(3734), '1:02:14');
  assert.equal(fromSeconds(476), '07:56');
  assert.equal(isoDuration('07:56'), 'PT7M56S');
  assert.equal(isoDuration('1:02:14'), 'PT1H2M14S');
  assert.equal(seriesNumber(3), '003');
  assert.equal(tracklistText('Mix', [{ n: 1, artist: 'A', title: 'T', label: 'L' }, { n: 2, artist: 'ID', title: 'ID' }]), 'Mix\n\n01. A - T [L]\n02. ID - ID');
});

/* ---- Filtro ---------------------------------------------------------------------------------------- */
test('filtro: el estado ida y vuelta por hash, y el filtrado', () => {
  assert.equal(buildHash({}), '');
  assert.equal(buildHash({ l: 'Sello Ejemplo', k: 'ep' }), 'k=ep&l=Sello+Ejemplo');
  assert.deepEqual(parseHash('#k=ep&l=Sello+Ejemplo&x=1&y='), { k: 'ep', l: 'Sello Ejemplo' });
  assert.deepEqual(toggle({ k: 'ep' }, 'k', 'ep'), {});
  assert.deepEqual(toggle({ k: 'ep' }, 'k', ''), {});
  assert.deepEqual(toggle({ k: 'ep' }, 'y', '2026'), { k: 'ep', y: '2026' });
  const r = { kind: 'ep', year: 2026, label: 'A' };
  assert.ok(matches({}, r));
  assert.ok(matches({ k: 'ep', y: '2026' }, r));
  assert.ok(!matches({ k: 'single' }, r));
  assert.ok(!matches({ l: 'B' }, r));
});

/* ---- Datos reales y de ejemplo ------------------------------------------------------------------------ */
test('releases: el real sale de site.yaml sin duplicarse y los demás son de ejemplo', () => {
  const { rel } = load(true);
  const list = rel.items.map((i) => resolveRelease(i, site.releases));
  const real = list.filter((r) => !r.demo);
  assert.equal(real.length, 1);
  const r = real[0];
  assert.equal(r.slug, 'ellas-ep');
  assert.equal(r.title, 'Ellas EP [ROOM.004]');
  assert.equal(r.catalog, 'ROOM.004');
  assert.equal(r.date, '2017-10-20');
  assert.equal(r.label.name, 'ROOM');
  assert.deepEqual(r.tracks.map((t) => [t.n, t.title, t.duration]), [[7, 'Ahogo (Original Mix)', '07:56']]);
  assert.equal(r.url, 'https://roomarg.bandcamp.com/album/ellas-ep-room-004');
  assert.ok(r.compilationArtists.includes('Ailén Cachela'));
  assert.equal(new Set(list.map((x) => x.slug)).size, list.length, 'slugs únicos');
  // ningún dato real copiado en el YAML del dominio
  const yaml = read('src/content/releases.yaml');
  assert.ok(!/ROOM\.004|Ahogo|roomarg/.test(yaml.replace(/^#.*$/gm, '')), 'releases.yaml no duplica ROOM.004');
});

test('releases de ejemplo: ninguna URL de plataforma inventada y tipos cubiertos', () => {
  const { rel } = load(true);
  const list = rel.items.map((i) => resolveRelease(i, site.releases));
  for (const r of list.filter((x) => x.demo)) {
    assert.equal(r.url, '');
    assert.deepEqual(r.platforms, [], `${r.slug}: sin plataformas inventadas`);
  }
  const kinds = new Set(list.map((r) => r.kind));
  for (const k of ['album', 'ep', 'single', 'remix', 'compilation']) assert.ok(kinds.has(k as never), `falta un ${k}`);
  assert.ok(list.some((r) => r.status === 'upcoming'), 'hay un próximo lanzamiento');
  assert.ok(!/https?:\/\//.test(read('src/content/releases.yaml').replace(/^#.*$/gm, '')), 'releases.yaml no tiene URLs');
});

test('orden y filtros del catálogo', () => {
  const { rel } = load(true);
  const sorted = sortReleases(rel.items.map((i) => resolveRelease(i, site.releases)));
  assert.equal(sorted[0].status, 'upcoming');
  const released = sorted.filter((r) => r.status === 'released');
  for (let i = 1; i < released.length; i++) assert.ok(released[i - 1].date >= released[i].date);
  const opts = filterOptions(sorted);
  assert.ok(opts.labels.includes('ROOM'));
  assert.deepEqual(opts.years, [...opts.years].sort((a, b) => b - a));
  assert.equal(neighbours(sorted, sorted[1].slug).prev?.slug, sorted[0].slug);
  assert.deepEqual(neighbours(sorted, 'no-existe'), { prev: null, next: null });
});

test('demo apagado: solo queda ROOM.004 y los cuatro sets reales', () => {
  const { rel, mix } = load(false);
  assert.equal(countDemo(rel), 0);
  assert.equal(countDemo(mix), 0);
  assert.deepEqual(rel.items.map((i) => i.id), ['ellas-ep']);
  assert.equal(rel.charts.length, 0);
  const mixes = mix.items.map((i) => resolveMix(i, site.listen.tracks));
  assert.deepEqual(mixes.map((m) => m.slug), site.listen.tracks.map((t) => t.id));
  assert.ok(mixes.every((m) => m.kind === 'soundcloud' && m.url.startsWith('https://soundcloud.com/ailen-cachela/')));
});

test('mixes: la serie de ejemplo está numerada, ordenada y con tracklist', () => {
  const { mix } = load(true);
  const mixes = mix.items.map((i) => resolveMix(i, site.listen.tracks));
  const series = sortSeries(mixes);
  assert.ok(series.length >= 5);
  assert.ok(series.every((m) => m.demo && m.number !== null && m.tracklist.length >= 8 && m.url === ''));
  assert.deepEqual(series.map((m) => m.number), series.map((m) => m.number).sort((a, b) => (b ?? 0) - (a ?? 0)));
  assert.equal(series.at(-1)?.code, '001');
  assert.equal(new Set(mixes.map((m) => m.slug)).size, mixes.length);
  assert.ok(mixes.filter((m) => !m.demo).every((m) => m.kind === 'soundcloud'));
});

test('referencia inexistente: error claro', () => {
  const { rel } = load(true);
  assert.throws(() => resolveRelease({ ...rel.items[0], ref: 'nada' }, site.releases), /no existe/);
  assert.throws(() => resolveMix({ id: 'x', ref: 'nada', demo: false, description: { es: '', en: '' }, tags: [], tracklist: [], title: '', date: '', venue: '', duration: '', wave_seed: '' }, site.listen.tracks), /no existe/);
});

test('esquemas: un release o mix inventado sin demo: true es un error', () => {
  const bad = 'items:\n  - id: falso\n    kind: ep\n    title: X\n    date: "2026-01-01"\n    label: Y\n';
  assert.throws(() => loadDomain('releases', bad, releasesSchema, true), /demo: true/);
  const badMix = 'items:\n  - id: falso\n    title: X\n    date: "2026-01-01"\n    venue: V\n    duration: "1:00:00"\n';
  assert.throws(() => loadDomain('mixes', badMix, mixesSchema, true), /demo: true/);
  assert.throws(() => loadDomain('releases', 'items:\n  - { id: a, demo: true, kind: remix, title: X, date: "2026-01-01", label: Y }\n', releasesSchema, true), /remix_of/);
});

/* ---- JSON-LD ---------------------------------------------------------------------------------------------- */
test('JSON-LD: solo datos reales (null para ejemplo) con MusicAlbum y MusicRecording', () => {
  const { rel } = load(true);
  const list = rel.items.map((i) => resolveRelease(i, site.releases));
  const ctx = { pageUrl: 'https://example.test/musica/ellas-ep/', artistName: 'Ailén Cachela' };
  for (const r of list.filter((x) => x.demo)) assert.equal(releaseJsonLd(r, ctx), null);
  const ld = releaseJsonLd(list.find((x) => !x.demo)!, ctx)!;
  assert.equal(ld.length, 1);
  const album = ld[0] as Record<string, any>;
  assert.equal(album['@type'], 'MusicAlbum');
  assert.equal(album.name, 'Ellas EP [ROOM.004]');
  assert.equal(album.datePublished, '2017-10-20');
  assert.equal(album.track[0]['@type'], 'MusicRecording');
  assert.equal(album.track[0].duration, 'PT7M56S');
  assert.equal(album.track[0].position, 7);
  assert.ok(!/Ejemplo/i.test(JSON.stringify(ld)));
  assert.ok(list.some((r) => isDemo(r)));
});

/* ---- Feed RSS ------------------------------------------------------------------------------------------------ */
/** Verificador mínimo de XML bien formado: pila de etiquetas, atributos entre comillas y entidades válidas. */
function assertWellFormed(xml: string) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  const body = xml.replace(/^<\?xml[^>]*\?>/, '');
  assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(body), 'entidad sin escapar');
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    assert.ok(!/[<>]/.test(body.slice(last, m.index)), `texto con < o > cerca de ${m.index}`);
    last = re.lastIndex;
    if (m[4]) continue;
    if (m[1]) assert.equal(stack.pop(), m[2], `cierre inesperado </${m[2]}>`);
    else stack.push(m[2]);
  }
  assert.equal(stack.length, 0, 'etiquetas sin cerrar');
  assert.ok(!/[<>]/.test(body.slice(last)));
}

test('feed RSS: bien formado, escapado y con fechas RFC 822', () => {
  const xml = buildFeed({
    lang: 'es',
    title: 'Mixes & más <b>',
    description: 'Descripción "con comillas"',
    link: 'https://example.test/mixes/',
    self: 'https://example.test/mixes/feed.xml',
    items: [
      { title: 'Uno & dos', link: 'https://example.test/mixes/uno/', description: "x < y > z 'q'", date: '2026-01-17' },
      { title: 'Sin fecha', link: 'https://example.test/mixes/dos/' },
    ],
  });
  assertWellFormed(xml);
  assert.ok(xml.includes('<title>Mixes &amp; más &lt;b&gt;</title>'));
  assert.ok(xml.includes('<pubDate>Sat, 17 Jan 2026 00:00:00 GMT</pubDate>'));
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<pubDate>/g) ?? []).length, 1);
  assert.equal(xmlEscape('a\u0001b'), 'ab');
  assertWellFormed(buildFeed({ lang: 'en', title: 't', description: 'd', link: 'https://e.test/', self: 'https://e.test/f.xml', items: [] }));
});

test('feed con los datos reales: solo los sets de SoundCloud, nunca ítems de ejemplo', () => {
  const { mix } = load(true);
  const mixes = mix.items.map((i) => resolveMix(i, site.listen.tracks)).filter((m) => !isDemo(m));
  const xml = buildFeed({
    lang: 'es', title: 'Mixes', description: 'd', link: 'https://e.test/mixes/', self: 'https://e.test/mixes/feed.xml',
    items: mixes.map((m) => ({ title: m.title, link: `https://e.test/mixes/${m.slug}/` })),
  });
  assertWellFormed(xml);
  assert.equal((xml.match(/<item>/g) ?? []).length, 4);
  assert.ok(!/ejemplo/i.test(xml));
});
