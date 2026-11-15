import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countDemo, demoFromEnv, filterDemo, isDemo, pruneDemo, shown } from '../src/lib/demo-core.ts';

const data = {
  title: 'x',
  bio: { demo: true, es: 'ejemplo', en: 'sample' },
  items: [
    { id: 'real', demo: false },
    { id: 'fake', demo: true, tracks: [{ n: 1 }, { n: 2, demo: true }] },
    { id: 'real2', tracks: [{ n: 1, demo: true }, { n: 2 }] },
  ],
};

test('isDemo solo es verdadero con demo: true', () => {
  assert.equal(isDemo({ demo: true }), true);
  assert.equal(isDemo({ demo: false }), false);
  assert.equal(isDemo({}), false);
  assert.equal(isDemo(null), false);
  assert.equal(isDemo('demo'), false);
});

test('pruneDemo encendido devuelve el mismo dato', () => {
  assert.equal(pruneDemo(data, true), data);
});

test('pruneDemo apagado saca los elementos demo de los arreglos, a cualquier profundidad', () => {
  const out = pruneDemo(data, false);
  assert.deepEqual(out.items.map((i) => i.id), ['real', 'real2']);
  assert.deepEqual(out.items[1].tracks, [{ n: 2 }]);
  assert.equal(countDemo(out), 0);
  // el original no se muta
  assert.equal(data.items.length, 3);
});

test('los objetos sueltos demo se conservan: el componente decide con shown()', () => {
  const out = pruneDemo(data, false);
  assert.equal(out.bio.demo, true);
  assert.equal(shown(out.bio, false), null);
  assert.equal(shown(out.bio, true), out.bio);
  assert.equal(shown({ id: 'real' }, false)?.id, 'real');
});

test('countDemo cuenta todos los ítems de ejemplo', () => {
  assert.equal(countDemo(data), 3);
  assert.equal(countDemo({ a: [] }), 0);
});

test('filterDemo', () => {
  assert.deepEqual(filterDemo([{ demo: true }, { x: 1 }], false), [{ x: 1 }]);
  assert.equal(filterDemo([{ demo: true }, { x: 1 }], true).length, 2);
});

test('demoFromEnv', () => {
  assert.equal(demoFromEnv('0'), false);
  assert.equal(demoFromEnv(' OFF '), false);
  assert.equal(demoFromEnv('1'), true);
  assert.equal(demoFromEnv('true'), true);
  assert.equal(demoFromEnv(''), null);
  assert.equal(demoFromEnv(undefined), null);
  assert.equal(demoFromEnv('quizás'), null);
});
