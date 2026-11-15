import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, KIND_CHOICES, LIMITS, dateFromSeed, dateParts, fileName, fitFont, formatById, parseIsoDate, randomSeed, sanitize, sanitizeState, seedId, shaderSize, specFor, wrapLines, DEFAULT_STATE } from '../src/lib/lab/generator.ts';
import { FLYER_KINDS, flyerShapes } from '../src/lib/flyer.ts';

test('formatos: medidas del encargo y del A3 a 200 dpi', () => {
  const dims = Object.fromEntries(FORMATS.map((f) => [f.id, [f.w, f.h]]));
  assert.deepEqual(dims.story, [1080, 1920]);
  assert.deepEqual(dims.square, [1080, 1080]);
  assert.deepEqual(dims.phone, [1170, 2532]);
  assert.deepEqual(dims.post, [1080, 1350]);
  assert.deepEqual(dims.poster, [2339, 3307]);
  for (const f of FORMATS) {
    assert.ok(f.w * f.h < 16_000_000, `${f.id} entra en el límite de canvas de iOS`);
    assert.ok(f.safeTop >= 0 && f.safeBottom >= 0 && f.safeTop + f.safeBottom < 0.6);
  }
  assert.equal(formatById('nope').id, 'story');
});

test('sanitize: control, espacios, largo y puntos de código', () => {
  assert.equal(sanitize('  hola\u0007   mundo \n x ', 50), 'hola mundo x');
  assert.equal(sanitize(undefined, 10), '');
  assert.equal(sanitize('abcdef', 3), 'abc');
  assert.equal(sanitize('aé😀b', 3), 'aé😀', 'no parte un par sustituto');
  assert.equal(sanitize('x'.repeat(500), LIMITS.title).length, LIMITS.title);
});

test('sanitizeState: valores inválidos vuelven a los permitidos', () => {
  const s = sanitizeState({ title: ' Hola ', date: '2026-02-30', kind: 'raro', format: 'cuadrado', seed: 'ab' });
  assert.equal(s.title, 'Hola');
  assert.equal(s.date, '');
  assert.equal(s.kind, 'auto');
  assert.equal(s.format, 'story');
  assert.equal(s.seed, 'ab');
  const ok = sanitizeState({ date: '2026-11-28', kind: 'moire', format: 'phone' });
  assert.equal(ok.date, '2026-11-28');
  assert.equal(ok.kind, 'moire');
  assert.equal(ok.format, 'phone');
});

test('fechas: validación real y partes en es y en', () => {
  assert.deepEqual(parseIsoDate('2026-11-28'), { y: 2026, m: 11, d: 28 });
  assert.equal(parseIsoDate('2026-02-29'), null);
  assert.equal(parseIsoDate('2024-02-29')?.d, 29);
  assert.equal(parseIsoDate('28/11/2026'), null);
  assert.equal(parseIsoDate(''), null);
  assert.deepEqual(dateParts('2026-11-28', 'es'), { day: '28', month: 'NOV', weekday: 'SAB', year: '2026' });
  assert.deepEqual(dateParts('2026-12-05', 'en'), { day: '5', month: 'DEC', weekday: 'SAT', year: '2026' });
  assert.equal(dateParts('mal', 'es'), null);
});

test('semillas: deterministas, distintas entre sí y con el dado en el alfabeto esperado', () => {
  const a = specFor({ seed: 'ailen', title: '', date: '2026-11-28', kind: 'auto' });
  const b = specFor({ seed: 'ailen', title: 'otro título', date: '2026-11-28', kind: 'auto' });
  assert.deepEqual(a, b, 'con semilla escrita el título no cambia el arte');
  assert.equal(a.day, 28);
  assert.equal(a.weekday, 6);
  const c = specFor({ seed: 'otra', title: '', date: '2026-11-28', kind: 'auto' });
  assert.notDeepEqual([a.seedA, a.seedB], [c.seedA, c.seedB]);
  // sin semilla se usa el título; sin ambos, una fija
  assert.equal(seedId({ seed: '', title: 'Noche' }), 'lab:Noche');
  assert.equal(seedId({ seed: '', title: '' }), 'lab:ailen');
  // sin fecha, el día sale de la semilla y es estable
  assert.equal(dateFromSeed('lab:x'), dateFromSeed('lab:x'));
  const noDate = specFor({ seed: 'zzz', title: '', date: '', kind: 'auto' });
  assert.ok(noDate.day >= 1 && noDate.day <= 28);
  let n = 0;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const seeds = new Set(Array.from({ length: 50 }, () => randomSeed(rng)));
  assert.ok(seeds.size > 40);
  for (const s of seeds) assert.match(s, /^[A-HJ-NP-Z2-9]{6}$/);
});

test('composición forzada: cada tipo se alcanza, de forma determinista, y la geometría es finita', () => {
  for (const kind of FLYER_KINDS) {
    const base = { seed: 'ailen', title: '', date: '2026-11-28', kind } as const;
    const s1 = specFor(base);
    const s2 = specFor(base);
    assert.equal(s1.kind, kind);
    assert.deepEqual(s1, s2);
    const g = flyerShapes(s1, 56.25, 100);
    for (const n of [...g.ticks.flatMap((t) => [t.x1, t.y1, t.x2, t.y2]), ...g.rings.flatMap((r) => [r.r, r.cx, r.cy])]) assert.ok(Number.isFinite(n));
    assert.equal(g.ticks.filter((t) => t.day).length, 1);
  }
  assert.deepEqual([...KIND_CHOICES], ['auto', ...FLYER_KINDS]);
  assert.equal(DEFAULT_STATE.format, 'story');
});

test('tamaño del fondo de shader: acotado y proporcional', () => {
  const small = shaderSize(1080, 1080);
  assert.deepEqual(small, { w: 1080, h: 1080 }.w * 1080 <= 2_300_000 ? { w: 1080, h: 1080 } : small);
  const big = shaderSize(2339, 3307);
  assert.ok(big.w * big.h <= 2_300_000 * 1.02);
  assert.ok(Math.abs(big.w / big.h - 2339 / 3307) < 0.01);
  assert.ok(shaderSize(1170, 2532).w * shaderSize(1170, 2532).h <= 2_300_000 * 1.02);
});

test('tipografía: ajuste de tamaño y corte de renglones con una medida falsa', () => {
  const widthAt = (px: number) => px * 10; // 10 caracteres por px
  assert.equal(fitFont(widthAt, 500, 100, 10), 50);
  assert.equal(fitFont(widthAt, 5000, 100, 10), 100, 'entra: devuelve el máximo');
  assert.equal(fitFont(widthAt, 5, 100, 10), 10, 'nunca baja del mínimo');
  const m = (t: string) => t.length;
  assert.deepEqual(wrapLines(m, 'hola mundo cruel', 10), ['hola mundo', 'cruel']);
  assert.deepEqual(wrapLines(m, 'abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
  assert.deepEqual(wrapLines(m, '', 5), []);
  const cut = wrapLines(m, 'uno dos tres cuatro cinco seis', 8, 2);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith('…') && cut[1].length <= 8);
  for (const l of wrapLines(m, 'una frase bastante larga para romper en renglones', 12)) assert.ok(l.length <= 12);
});

test('nombre de archivo: sin tildes ni símbolos y con las medidas', () => {
  const f = formatById('story');
  assert.equal(fileName({ title: 'Noche Ñandú — Vol. 2!', seed: 'x' }, f), 'ailen-cachela-lab-noche-nandu-vol-2-1080x1920.png');
  assert.equal(fileName({ title: '', seed: 'ABC123' }, formatById('phone')), 'ailen-cachela-lab-abc123-1170x2532.png');
  assert.equal(fileName({ title: '', seed: '' }, formatById('square')), 'ailen-cachela-lab-flyer-1080x1080.png');
});
