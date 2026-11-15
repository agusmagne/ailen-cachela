import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';
import { loadDomain } from '../src/lib/content-loader.ts';
import { countDemo, isDemo } from '../src/lib/demo-core.ts';
import { mergeProjects, orphanExtras } from '../src/lib/oficio/projects.ts';
import { schema as studio } from '../src/lib/schemas/studio.ts';
import { schema as services } from '../src/lib/schemas/services.ts';
import { schema as lessons } from '../src/lib/schemas/lessons.ts';
import { schema as videos } from '../src/lib/schemas/videos.ts';
import { schema as collective } from '../src/lib/schemas/collective.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const dom = { studio, services, lessons, videos, collective } as const;
const raw = (n: string) => read(`src/content/${n}.yaml`);
const on = (n: keyof typeof dom) => loadDomain(n, raw(n), dom[n], true) as Record<string, any>;
const off = (n: keyof typeof dom) => loadDomain(n, raw(n), dom[n], false) as Record<string, any>;
const site = parse(read('src/content/site.yaml')) as { projects: { id: string; name: string; visible: boolean; status: any; text: any; handle: string; platform: string; url: string }[] };

test('studio, servicios, clases y videos: todo ítem de lista es de ejemplo y con el interruptor apagado no queda nada', () => {
  for (const [name, keys] of [['studio', ['gear', 'tour', 'workflow', 'notes']], ['services', ['items', 'process', 'faq']], ['lessons', ['items', 'levels', 'faq']], ['videos', ['items']]] as const) {
    const d = on(name);
    for (const k of keys) {
      assert.ok(d[k].length > 0, `${name}.${k} no puede estar vacío`);
      for (const it of d[k]) assert.ok(isDemo(it), `${name}.${k}.${it.id} debe llevar demo: true`);
    }
    const o = off(name);
    for (const k of keys) assert.equal(o[k].length, 0, `${name}.${k} debe vaciarse con el interruptor apagado`);
  }
});

test('ids únicos por lista', () => {
  for (const name of ['studio', 'services', 'lessons', 'videos'] as const) {
    const d = on(name);
    for (const [k, list] of Object.entries(d)) {
      const ids = (list as { id: string }[]).map((x) => x.id);
      assert.equal(new Set(ids).size, ids.length, `${name}.${k} tiene ids repetidos`);
    }
  }
});

test('collective: los tres proyectos reales siguen con el interruptor apagado, sin duplicar datos reales', () => {
  const o = off('collective');
  assert.deepEqual(
    o.items.map((i: { id: string }) => i.id).sort(),
    site.projects.map((p) => p.id).sort(),
  );
  assert.deepEqual(orphanExtras(site.projects, o.items), []);
  for (const it of o.items) {
    assert.ok(!isDemo(it), `${it.id}: el ítem real no puede ser demo`);
    assert.equal(countDemo(it), 0);
    for (const k of ['manifesto', 'editions', 'residents', 'log', 'calls']) assert.equal(it[k].length, 0, `${it.id}.${k} debe vaciarse`);
    // el enriquecimiento no copia datos reales de site.yaml
    for (const forbidden of ['name', 'handle', 'url', 'platform', 'status', 'text']) assert.ok(!(forbidden in it), `${it.id} no puede repetir "${forbidden}"`);
  }
  assert.equal(mergeProjects(site.projects, o.items).length, site.projects.filter((p) => p.visible).length);
  const full = on('collective');
  assert.ok(countDemo(full) > 0);
  for (const it of full.items) for (const k of ['manifesto', 'editions', 'residents', 'log', 'calls']) for (const x of it[k]) assert.ok(isDemo(x));
});

test('contenido de ejemplo: sin marcas ni medios reales, sin enlaces, sin relleno', () => {
  const text = ['studio', 'services', 'lessons', 'videos', 'collective'].map(raw).join('\n').replace(/^\s*#.*$/gm, '');
  const banned = /\b(pioneer|cdj|djm|roland|moog|korg|ableton|genelec|yamaha|focusrite|native instruments|elektron|behringer|serato|technics|neumann|eventide|teenage engineering|sequential|novation|arturia|akai|sennheiser|shure|boiler room|cercle|h[öo]r berlin|berghain|tresor|resident advisor|beatport|spotify|youtube|soundcloud|bandcamp|mixcloud)\b/i;
  assert.doesNotMatch(text, banned);
  assert.doesNotMatch(text, /https?:\/\//i, 'ningún enlace en los datos de ejemplo');
  assert.doesNotMatch(text, /lorem|ipsum|xxx/i);
  assert.doesNotMatch(text, /\bTODO\b|\bTBD\b|\bFIXME\b/);
  assert.doesNotMatch(text, /[$€]\s?\d|\b\d+\s?(usd|ars|eur)\b/i, 'sin precios: solo "a consultar"');
});

test('videos de ejemplo: sin id ni URL de plataforma', () => {
  for (const v of on('videos').items) {
    assert.deepEqual(Object.keys(v).sort(), ['category', 'demo', 'duration', 'featured', 'id', 'place', 'summary', 'title', 'year']);
  }
  assert.equal(on('videos').items.filter((v: { featured: boolean }) => v.featured).length, 1);
});

test('clases: fechas futuras respecto del día del plan y cupos positivos', () => {
  for (const p of on('lessons').items) for (const s of p.sessions) assert.ok(s.date >= '2026-11-15' && s.spots > 0, `${p.id}`);
});

test('textos de interfaz es/en completos', () => {
  const ui = parse(read('src/content/ui/oficio.yaml')) as Record<string, { es: string; en: string }>;
  for (const [k, v] of Object.entries(ui)) {
    assert.ok(k.startsWith('oficio_'));
    assert.ok(v.es.trim() && v.en.trim(), k);
  }
});
