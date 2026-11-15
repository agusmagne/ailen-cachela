import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'astro/zod';
import { domainHasContent, loadDomain, mergeUi } from '../src/lib/content-loader.ts';
import { item, items, slug } from '../src/lib/schemas/_shared.ts';

const base = { nav_x: { es: 'X', en: 'X' } };

test('mergeUi fusiona archivos de paquetes y respeta el prefijo', () => {
  const out = mergeUi(base, { press: 'press_title: { es: "Prensa", en: "Press" }\npress_desc: { es: "d", en: "d" }\n', booking: 'booking_title: { es: "B", en: "B" }\n' });
  assert.equal(out.press_title.en, 'Press');
  assert.equal(out.booking_title.es, 'B');
  assert.equal(out.nav_x.es, 'X');
});

test('mergeUi: una clave sin el prefijo del archivo frena el build', () => {
  assert.throws(() => mergeUi(base, { press: 'title: { es: "a", en: "a" }' }), /debe empezar con "press_"/);
});

test('mergeUi: una clave repetida (contra site.yaml o entre archivos) frena el build', () => {
  assert.throws(() => mergeUi({ press_title: { es: 'a', en: 'a' } }, { press: 'press_title: { es: "b", en: "b" }' }), /ya existe en site\.yaml/);
});

test('mergeUi: falta un idioma = error', () => {
  assert.throws(() => mergeUi(base, { press: 'press_a: { es: "solo es" }' }), /inválido/);
});

const schema = z.object({ items: items(item({ id: slug, title: z.string() })) });
const yamlText = `items:
  - { id: real, title: Real }
  - { id: fake, title: Falso, demo: true }
`;

test('loadDomain valida siempre el dato completo y poda según el interruptor', () => {
  assert.equal(loadDomain('x', yamlText, schema, true).items.length, 2);
  const off = loadDomain('x', yamlText, schema, false);
  assert.deepEqual(off.items.map((i) => i.id), ['real']);
});

test('loadDomain: un error en un ítem demo se ve también con el interruptor apagado', () => {
  const bad = 'items:\n  - { id: "Mal Slug", title: x, demo: true }\n';
  assert.throws(() => loadDomain('x', bad, schema, false), /x\.yaml inválido/);
});

test('loadDomain: archivo ausente o vacío = dominio vacío válido', () => {
  assert.deepEqual(loadDomain('x', undefined, schema, true).items, []);
  assert.deepEqual(loadDomain('x', '', schema, true).items, []);
});

test('domainHasContent respeta el interruptor', () => {
  assert.equal(domainHasContent(yamlText, ['items'], false), true);
  assert.equal(domainHasContent('items:\n  - { id: a, demo: true }\n', ['items'], false), false);
  assert.equal(domainHasContent('items:\n  - { id: a, demo: true }\n', ['items'], true), true);
  assert.equal(domainHasContent(undefined, ['items'], true), false);
  assert.equal(domainHasContent('items: []', ['items'], true), false);
  assert.equal(domainHasContent('gear: []\nnotes:\n  - { id: n }\n', ['gear', 'notes'], true), true);
});
