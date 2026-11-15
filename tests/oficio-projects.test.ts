import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProjects, orphanExtras, editionShow, type SiteProjectLike } from '../src/lib/oficio/projects.ts';
import { flyerSpec } from '../src/lib/flyer.ts';

const p = (id: string, visible = true): SiteProjectLike => ({ id, name: id.toUpperCase(), visible, status: { es: '', en: '' }, text: { es: 'x', en: 'x' }, handle: '', platform: '', url: '' });

test('mergeProjects: orden de site.yaml, solo visibles y con enriquecimiento', () => {
  const merged = mergeProjects([p('a'), p('b', false), p('c'), p('d')], [{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
  assert.deepEqual(merged.map((m) => m.slug), ['a', 'c']);
  assert.equal(merged[0].project.name, 'A');
});

test('orphanExtras detecta enriquecimientos sin proyecto real', () => {
  assert.deepEqual(orphanExtras([p('a')], [{ id: 'a' }, { id: 'zzz' }]), ['zzz']);
});

test('editionShow: misma edición, mismo flyer; ediciones distintas, semillas distintas', () => {
  const e1 = editionShow({ id: 'e1', title: { es: 'Edición 1', en: 'Edition 1' }, date: '2025-04-12' }, 'frag');
  const e1b = editionShow({ id: 'e1', title: { es: 'Edición 1', en: 'Edition 1' }, date: '2025-04-12' }, 'frag');
  const e2 = editionShow({ id: 'e2', title: { es: 'Edición 2', en: 'Edition 2' }, date: '2025-08-23' }, 'frag');
  assert.deepEqual(flyerSpec(e1), flyerSpec(e1b));
  assert.notEqual(flyerSpec(e1).seedA, flyerSpec(e2).seedA);
  assert.match(e1.id, /^demo-frag-/);
});
