import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { ROUTES } from '../src/lib/routes-core.ts';
import { loadDomain } from '../src/lib/content-loader.ts';
import { countDemo } from '../src/lib/demo-core.ts';
import { schema as shop } from '../src/lib/schemas/shop.ts';
import { schema as newsletter } from '../src/lib/schemas/newsletter.ts';
import { schema as community } from '../src/lib/schemas/community.ts';
import { schema as links } from '../src/lib/schemas/links.ts';
import { schema as legal } from '../src/lib/schemas/legal.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(root + p, 'utf8');
const yaml = (p: string) => parse(read(p));
const ui = yaml('src/content/ui/fans.yaml') as Record<string, { es: string; en: string }>;
const site = yaml('src/content/site.yaml') as { links: { id: string; url: string }[]; ui: Record<string, unknown> };

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const ownFiles = () =>
  [
    ...walk(root + 'src/components/fans'),
    ...walk(root + 'src/lib/fans'),
    ...walk(root + 'src/scripts/fans'),
    ...walk(root + 'src/scripts/modules').filter((f) => /\/fans-/.test(f)),
    root + 'src/pages/404.astro',
    root + 'src/pages/manifest.webmanifest.ts',
    ...['tienda', 'newsletter', 'comunidad', 'links', 'privacidad', 'accesibilidad', 'creditos', 'aviso-legal'].flatMap((d) => walk(root + `src/pages/${d}`)),
    ...['shop', 'newsletter', 'community', 'links', 'privacy', 'accessibility', 'credits', 'legal-notice'].flatMap((d) => walk(root + `src/pages/en/${d}`)),
  ].filter((f) => /\.(astro|ts|css)$/.test(f));

test('textos de interfaz fans: todos con es y en, sin vacíos, y todas las claves usadas existen', () => {
  for (const [k, v] of Object.entries(ui)) {
    assert.ok(k.startsWith('fans_'), k);
    assert.ok(v.es.trim() && v.en.trim(), `${k}: falta un idioma`);
  }
  const used = new Set<string>();
  for (const f of ownFiles()) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*['"](fans_[a-z0-9_]+)['"]/g)) used.add(m[1]);
  // claves armadas con plantilla (fans_status_${...}, fans_kind_..., fans_format_..., fans_drop_..., fans_step_...)
  for (const f of ownFiles()) for (const m of readFileSync(f, 'utf8').matchAll(/t\(\s*`(fans_[a-z0-9_]+)\$\{/g)) for (const k of Object.keys(ui)) if (k.startsWith(m[1])) used.add(k);
  const missing = [...used].filter((k) => !(k in ui) && !(k in (site.ui as object)));
  assert.deepEqual(missing, [], 'claves que no existen en fans.yaml');
});

test('sin relleno: ningún "lorem", "TODO" ni "XXX" en textos, datos ni plantillas del paquete', () => {
  const files = [...ownFiles(), root + 'src/content/ui/fans.yaml', ...['shop', 'newsletter', 'community', 'links', 'legal'].map((d) => root + `src/content/${d}.yaml`), root + 'public/offline.htm'];
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    assert.ok(!/lorem|ipsum/i.test(txt) && !/\bTODO\b|\bXXX\b|\bFIXME\b/.test(txt), f);
  }
});

test('dominios del paquete: validan con demo encendido y apagado; los ejemplos están marcados', () => {
  const cases = [['shop', shop], ['newsletter', newsletter], ['community', community], ['links', links], ['legal', legal]] as const;
  for (const [name, schema] of cases) {
    const raw = read(`src/content/${name}.yaml`);
    const on = loadDomain(name, raw, schema, true);
    const off = loadDomain(name, raw, schema, false);
    assert.equal(countDemo(off), 0, name);
    assert.ok(countDemo(on) >= countDemo(off));
  }
  const shopOn = loadDomain('shop', read('src/content/shop.yaml'), shop, true);
  assert.ok(shopOn.items.length >= 8 && shopOn.items.every((p) => p.demo), 'todos los productos son de ejemplo');
  assert.equal(loadDomain('shop', read('src/content/shop.yaml'), shop, false).items.length, 0, 'sin demo, la tienda queda vacía (y se oculta)');
  assert.ok(loadDomain('links', read('src/content/links.yaml'), links, false).items.length > 5, 'los links siguen con demo apagado');
  assert.ok(loadDomain('community', read('src/content/community.yaml'), community, false).channels.length > 0, 'los canales siguen con demo apagado');
  assert.ok(loadDomain('newsletter', read('src/content/newsletter.yaml'), newsletter, false).topics.length > 0);
  assert.ok(Object.keys(loadDomain('legal', read('src/content/legal.yaml'), legal, false).docs).length === 4);
});

test('tienda: sin precios reales ni marcas ni sellos reales; las fechas del drop son futuras respecto de la redacción', () => {
  const raw = read('src/content/shop.yaml');
  assert.ok(!/\b(ars|usd|eur)\b|\$\s?\d|€\s?\d/i.test(raw), 'no hay precios');
  assert.ok(!/ROOM|fragmento|SENKA|Bandcamp|Printful|Shopify/i.test(raw), 'nada atribuido a marcas o sellos reales');
  const d = loadDomain('shop', raw, shop, true).drops[0];
  assert.ok(Date.parse(d.opens) > Date.parse('2026-11-15T00:00:00Z'));
});

test('links: los destinos existen (enlaces de site.yaml o rutas del registro) y las legales no se duplican', () => {
  const data = loadDomain('links', read('src/content/links.yaml'), links, true);
  const ids = new Set(site.links.map((l) => l.id));
  const routes = new Set(ROUTES.map((r) => r.id));
  for (const i of data.items) {
    if (i.kind === 'link') assert.ok(ids.has(i.ref), `${i.id}: enlace ${i.ref} no existe en site.yaml`);
    if (i.kind === 'route') assert.ok(routes.has(i.ref), `${i.id}: ruta ${i.ref} no existe`);
  }
  const c = loadDomain('community', read('src/content/community.yaml'), community, true);
  for (const ch of c.channels.filter((x) => x.siteLink)) assert.ok(ids.has(ch.siteLink), ch.id);
  for (const ch of c.channels.filter((x) => x.status === 'pending')) assert.equal(ch.url, '', `${ch.id}: pendiente = sin enlace`);
});

test('legal: los enlaces internos apuntan a rutas del registro y los datos de la titular no están inventados', () => {
  const d = loadDomain('legal', read('src/content/legal.yaml'), legal, true);
  const routes = new Set(ROUTES.map((r) => r.id));
  for (const doc of Object.values(d.docs)) for (const s of doc.sections) if (s.link) assert.ok(routes.has(s.link.route), s.link.route);
  assert.ok(d.items.length >= 5 && d.items.every((f) => f.value === ''), 'campos de la titular: a completar');
  for (const id of ['privacy', 'accessibility', 'legal-notice', 'credits']) assert.ok(id in d.docs && existsSync(root + 'src/content/legal.yaml'));
});
