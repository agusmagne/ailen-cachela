import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACID_MAX_NOTE, BPM_MAX, BPM_MIN, PATTERN_BYTES, STEPS, TRACKS, clonePattern, decodePattern, emptyPattern, encodePattern, fromBase64Url, patternFromHash, patternToHash, toBase64Url,
} from '../src/lib/lab/pattern.ts';
import { PRESETS, buildPreset, parseAcid, parseSteps, presetPattern } from '../src/lib/lab/presets.ts';

function sample() {
  const p = emptyPattern();
  p.bpm = 137;
  p.swing = 42;
  p.key = 7;
  p.tracks.kick = [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, true];
  p.tracks.open[2] = p.tracks.open[14] = true;
  p.tracks.bass[15] = true;
  p.acid[0] = { note: 1, accent: true, slide: false };
  p.acid[3] = { note: 25, accent: false, slide: true };
  p.acid[15] = { note: 13, accent: true, slide: true };
  p.acidParams = { cutoff: 11, res: 99, env: 0, decay: 100, drive: 57, wave: 1 };
  return p;
}

test('base64url: ida y vuelta de todos los largos y rechazo de basura', () => {
  for (let n = 0; n < 40; n++) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n * 11) & 255);
    const s = toBase64Url(b);
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual(Array.from(fromBase64Url(s)!), Array.from(b));
  }
  assert.equal(fromBase64Url('abc+'), null);
  assert.equal(fromBase64Url('a'), null); // longitud imposible
  assert.equal(fromBase64Url('ab cd'), null);
});

test('el patrón codificado mide 36 bytes y vuelve idéntico', () => {
  const p = sample();
  const code = encodePattern(p);
  assert.equal(fromBase64Url(code)!.length, PATTERN_BYTES);
  assert.equal(code.length, 48);
  assert.deepEqual(decodePattern(code), p);
  assert.equal(encodePattern(decodePattern(code)!), code, 'estable: codificar lo decodificado da el mismo texto');
});

test('el patrón vacío y los extremos de rango se conservan', () => {
  const e = emptyPattern();
  assert.deepEqual(decodePattern(encodePattern(e)), e);
  const lo = emptyPattern();
  lo.bpm = BPM_MIN;
  const hi = emptyPattern();
  hi.bpm = BPM_MAX;
  hi.swing = 100;
  hi.key = 11;
  hi.acid[5] = { note: ACID_MAX_NOTE, accent: true, slide: true };
  assert.deepEqual(decodePattern(encodePattern(lo)), lo);
  assert.deepEqual(decodePattern(encodePattern(hi)), hi);
});

test('rechaza enlaces inválidos: vacío, truncado, otra versión, suma de control, rangos', () => {
  const good = encodePattern(sample());
  assert.equal(decodePattern(''), null);
  assert.equal(decodePattern(good.slice(0, -4)), null);
  assert.equal(decodePattern(good + 'AAAA'), null);
  assert.equal(decodePattern('x'.repeat(500)), null);
  assert.equal(decodePattern('%%%'), null);
  const bytes = fromBase64Url(good)!;
  const mutate = (i: number, v: number, fixSum = true) => {
    const b = Uint8Array.from(bytes);
    b[i] = v;
    if (fixSum) {
      let s = 0;
      for (let k = 0; k < 35; k++) s = (s + b[k]) & 255;
      b[35] = s ^ 0xa5;
    }
    return toBase64Url(b);
  };
  assert.equal(decodePattern(mutate(0, 2)), null, 'versión 2');
  assert.equal(decodePattern(mutate(0, 0)), null, 'versión 0');
  assert.equal(decodePattern(mutate(1, 255)), null, 'bpm fuera de rango');
  assert.equal(decodePattern(mutate(2, 101)), null, 'swing > 100');
  assert.equal(decodePattern(mutate(3, 12)), null, 'tonalidad 12');
  assert.equal(decodePattern(mutate(3, 0x20)), null, 'bit reservado');
  assert.equal(decodePattern(mutate(4, 101)), null, 'perilla > 100');
  assert.equal(decodePattern(mutate(19, 26)), null, 'nota 26');
  assert.equal(decodePattern(mutate(19, 0x80)), null, 'bit 7 del acid');
  assert.equal(decodePattern(mutate(9, 0xff, false)), null, 'suma de control rota');
  assert.notEqual(decodePattern(mutate(9, 0xff)), null, 'con la suma corregida es válido (los bits de pasos son libres)');
});

test('hash: #p=, con otros parámetros y rechazo si falta o es inválido', () => {
  const p = sample();
  const h = patternToHash(p);
  assert.match(h, /^#p=[A-Za-z0-9_-]{48}$/);
  assert.deepEqual(patternFromHash(h), p);
  assert.deepEqual(patternFromHash(`#x=1&p=${encodePattern(p)}`), p);
  assert.equal(patternFromHash(''), null);
  assert.equal(patternFromHash('#otra-cosa'), null);
  assert.equal(patternFromHash('#p=AAAA'), null);
});

test('clonePattern no comparte referencias', () => {
  const a = sample();
  const b = clonePattern(a);
  b.tracks.kick[1] = true;
  b.acid[0].note = 9;
  b.acidParams.cutoff = 1;
  assert.equal(a.tracks.kick[1], false);
  assert.equal(a.acid[0].note, 1);
  assert.equal(a.acidParams.cutoff, 11);
});

test('presets: todos válidos, con 16 pasos, tempo en rango y ida y vuelta por la URL', () => {
  assert.ok(PRESETS.length >= 5);
  const ids = new Set<string>();
  for (const def of PRESETS) {
    assert.ok(!ids.has(def.id), `id repetido ${def.id}`);
    ids.add(def.id);
    assert.ok(def.name.es && def.name.en);
    const p = buildPreset(def);
    assert.ok(p.bpm >= BPM_MIN && p.bpm <= BPM_MAX);
    for (const t of TRACKS) assert.equal(p.tracks[t].length, STEPS);
    assert.equal(p.acid.length, STEPS);
    assert.deepEqual(decodePattern(encodePattern(p)), p, def.id);
    assert.ok(p.tracks.kick.filter(Boolean).length >= 4, `${def.id}: bombo en negras como mínimo`);
  }
  assert.equal(presetPattern('no-existe'), null);
});

test('texto de presets: pasos y acid', () => {
  assert.deepEqual(parseSteps('x...x...x...x...').map(Number).join(''), '1000100010001000');
  assert.throws(() => parseSteps('x..'));
  const a = parseAcid('0 . 12a 3s 7as . . . . . . . . . . 24');
  assert.deepEqual(a[0], { note: 1, accent: false, slide: false });
  assert.deepEqual(a[2], { note: 13, accent: true, slide: false });
  assert.deepEqual(a[3], { note: 4, accent: false, slide: true });
  assert.deepEqual(a[4], { note: 8, accent: true, slide: true });
  assert.equal(a[15].note, 25);
  assert.throws(() => parseAcid('0 . 25'));
  assert.throws(() => parseAcid('x '.repeat(16)));
});
