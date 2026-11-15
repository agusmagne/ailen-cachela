import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acidMidi, bassMidi, cutoffHz, decaySeconds, driveCurve, driveGain, envOctaves, envPeakHz, keyName, midiName, midiToHz, resonanceDb, softClipCurve, volumeGain } from '../src/lib/lab/params.ts';
import { encodeWav, normalizePeak, peakOf, silentWav } from '../src/lib/lab/wav.ts';
import { BeatDetector, bandsFromSpectrum, binRange, follow, logBins } from '../src/lib/lab/bands.ts';
import { DEAD_ZONE, MAX_RATE, REF_DEG_PER_SEC, advancePos, directionOf, peaksOf, rateFromVelocity, rateLabel, reversedCopy, reversedOffset, smoothRate, wrapPos } from '../src/lib/lab/scratch.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('notas: La = 440 Hz, nombres y tonalidades', () => {
  close(midiToHz(69), 440);
  close(midiToHz(57), 220);
  assert.equal(midiName(69), 'A4');
  assert.equal(midiName(60), 'C4');
  assert.equal(midiName(33), 'A1');
  assert.equal(keyName(0), 'A');
  assert.equal(keyName(3), 'C');
  assert.equal(keyName(11), 'G#');
  assert.equal(bassMidi(0), 33);
  assert.equal(acidMidi(1, 0), 45, 'la nota 1 del acid es la tónica una octava sobre el bajo');
  assert.equal(acidMidi(25, 0), 69);
  assert.equal(acidMidi(1, 5), 50);
});

test('perillas: extremos y monotonía', () => {
  close(cutoffHz(0), 90);
  assert.ok(Math.abs(cutoffHz(100) - 90 * 2 ** 5.3) < 1e-6);
  close(resonanceDb(0), 0.5);
  close(resonanceDb(100), 22);
  close(envOctaves(100), 5);
  close(decaySeconds(0), 0.09);
  assert.ok(Math.abs(decaySeconds(100) - 0.945) < 1e-9);
  close(driveGain(0), 1);
  close(driveGain(100), 10);
  for (const f of [cutoffHz, resonanceDb, envOctaves, decaySeconds, driveGain]) {
    let prev = -Infinity;
    for (let v = 0; v <= 100; v += 5) {
      const x = f(v);
      assert.ok(x >= prev, `${f.name} crece`);
      prev = x;
    }
    assert.equal(f(-20), f(0));
    assert.equal(f(400), f(100));
  }
  assert.equal(envPeakHz(5000, 5, true), 12000, 'el pico se acota a 12 kHz');
  assert.ok(envPeakHz(100, 2, true) > envPeakHz(100, 2, false), 'el acento abre más el filtro');
});

test('volumen: 0 es silencio y crece sin pasar de un tope', () => {
  assert.equal(volumeGain(0), 0);
  assert.ok(volumeGain(50) < volumeGain(70) && volumeGain(70) < volumeGain(100));
  assert.equal(volumeGain(1000), volumeGain(100));
});

test('curvas de saturación y recorte: acotadas, simétricas y monótonas', () => {
  const clip = softClipCurve();
  const drive = driveCurve(5);
  for (const c of [clip, drive]) {
    for (let i = 0; i < c.length; i++) {
      assert.ok(Math.abs(c[i]) <= 1 + 1e-9);
      if (i > 0) assert.ok(c[i] >= c[i - 1] - 1e-12, 'monótona');
    }
    close(c[0], -c[c.length - 1]);
  }
  // recorte: lineal por debajo de 0,7
  const mid = clip[Math.round(((0.5 + 1) / 2) * (clip.length - 1))];
  assert.ok(Math.abs(mid - 0.5) < 0.002);
  close(drive[drive.length - 1], 1);
});

test('WAV: cabecera, tamaño y muestras', () => {
  const l = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]);
  const r = Float32Array.from([0, 0, 0, 0, 0, 0, 0]);
  const buf = encodeWav([l, r], 44100);
  assert.equal(buf.byteLength, 44 + l.length * 2 * 2);
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(tag(12), 'fmt ');
  assert.equal(tag(36), 'data');
  assert.equal(v.getUint32(4, true), buf.byteLength - 8);
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 44100 * 4);
  assert.equal(v.getUint16(32, true), 4);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), l.length * 4);
  assert.equal(v.getInt16(44, true), 0);
  assert.equal(v.getInt16(48, true), Math.round(0.5 * 32767));
  assert.equal(v.getInt16(52, true), Math.round(-0.5 * 32768));
  assert.equal(v.getInt16(56, true), 32767, '1 → máximo');
  assert.equal(v.getInt16(60, true), -32768, '-1 → mínimo');
  assert.equal(v.getInt16(64, true), 32767, 'recorta por encima de 1');
  assert.equal(v.getInt16(68, true), -32768, 'recorta por debajo de -1');
  assert.equal(v.getInt16(46, true), 0, 'canal derecho intercalado');
});

test('WAV mono y silencio', () => {
  const m = encodeWav([new Float32Array(10)], 8000);
  assert.equal(m.byteLength, 44 + 20);
  const s = silentWav(0.5, 8000);
  assert.equal(s.byteLength, 44 + 4000 * 2);
  assert.equal(new Uint8Array(s).slice(44).every((b) => b === 0), true);
  assert.equal(encodeWav([], 44100).byteLength, 44);
});

test('normalización de pico', () => {
  const a = Float32Array.from([0.1, -0.2, 0.05]);
  const b = Float32Array.from([0.02, 0.01, -0.4]);
  close(peakOf([a, b]), 0.4, 1e-6);
  const g = normalizePeak([a, b], 0.8);
  close(g, 2);
  close(peakOf([a, b]), 0.8);
  const z = [new Float32Array(4)];
  assert.equal(normalizePeak(z), 1, 'silencio: no toca nada');
});

test('bandas: rangos de bins y reparto de energía', () => {
  const [lo, hi] = binRange(30, 150, 48000, 1024); // bin = 46,875 Hz
  assert.equal(lo, 0);
  assert.ok(hi >= 3 && hi <= 5);
  assert.deepEqual(binRange(100000, 200000, 48000, 1024, 512), [511, 512]);
  const data = new Uint8Array(512);
  for (let i = 0; i < 3; i++) data[i] = 255; // solo grave (el bin 3 es el borde compartido con los medios)
  const b = bandsFromSpectrum(data, 48000, 1024);
  assert.ok(b.bass > 0.5 && b.mid === 0 && b.high === 0);
  const h = new Uint8Array(512);
  h.fill(255, 60, 250); // agudos
  const hb = bandsFromSpectrum(h, 48000, 1024);
  assert.ok(hb.high > 0.9 && hb.bass === 0);
  const silent = bandsFromSpectrum(new Uint8Array(512), 44100, 1024);
  assert.deepEqual(silent, { bass: 0, mid: 0, high: 0, energy: 0 });
  const loud = bandsFromSpectrum(new Uint8Array(512).fill(255), 44100, 1024, 3);
  for (const k of ['bass', 'mid', 'high', 'energy'] as const) assert.ok(loud[k] >= 0 && loud[k] <= 1);
  // la sensibilidad sube la señal
  const half = new Uint8Array(512).fill(60);
  assert.ok(bandsFromSpectrum(half, 44100, 1024, 2).bass > bandsFromSpectrum(half, 44100, 1024, 1).bass);
});

test('seguidor y detector de golpes', () => {
  assert.ok(follow(0, 1, 0.5, 0.1) === 0.5);
  assert.ok(follow(1, 0, 0.5, 0.1) === 0.9);
  const d = new BeatDetector();
  let hits = 0;
  // 4 golpes por segundo (cada 250 ms) sobre un piso bajo; se muestrea cada 16 ms
  for (let t = 0; t < 2000; t += 16) {
    const phase = t % 250;
    const bass = phase < 48 ? 0.9 : 0.15;
    hits += d.update(bass, t);
  }
  assert.ok(hits >= 6 && hits <= 8, `golpes detectados: ${hits}`);
  const flat = new BeatDetector();
  let n = 0;
  for (let t = 0; t < 2000; t += 16) n += flat.update(0.5, t);
  assert.ok(n <= 1, 'una señal constante no genera golpes');
  const quiet = new BeatDetector();
  let q = 0;
  for (let t = 0; t < 2000; t += 16) q += quiet.update(t % 250 < 48 ? 0.06 : 0.01, t);
  assert.equal(q, 0, 'por debajo del piso no hay golpes');
});

test('espectro logarítmico: n valores en 0..1', () => {
  const data = new Uint8Array(512).map((_, i) => (i * 3) & 255);
  const out = logBins(data, 48, 48000, 1024);
  assert.equal(out.length, 48);
  for (const v of out) assert.ok(v >= 0 && v <= 1);
});

test('scratch: velocidad del plato a velocidad de reproducción', () => {
  close(rateFromVelocity(REF_DEG_PER_SEC), 1);
  close(rateFromVelocity(-REF_DEG_PER_SEC), -1);
  close(rateFromVelocity(0), 0);
  close(rateFromVelocity(REF_DEG_PER_SEC, 1.08), 1.08);
  assert.equal(rateFromVelocity(1e6), MAX_RATE);
  assert.equal(rateFromVelocity(-1e6), -MAX_RATE);
  assert.equal(directionOf(0.01), 0);
  assert.equal(directionOf(-DEAD_ZONE * 0.9), 0);
  assert.equal(directionOf(0.5), 1);
  assert.equal(directionOf(-0.5), -1);
});

test('scratch: suavizado, posición con vuelta y copia invertida', () => {
  close(smoothRate(0, 1, 0, 0.03), 0);
  assert.ok(smoothRate(0, 1, 0.03, 0.03) > 0.6 && smoothRate(0, 1, 0.03, 0.03) < 0.7);
  close(smoothRate(0, 1, 10, 0.03), 1, 1e-9);
  close(wrapPos(5.5, 4), 1.5);
  close(wrapPos(-0.5, 4), 3.5);
  assert.equal(wrapPos(1, 0), 0);
  close(advancePos(3.9, 1, 0.2, 4), 0.1, 1e-9);
  close(advancePos(0.1, -1, 0.2, 4), 3.9, 1e-9);
  close(reversedOffset(1, 4), 3);
  close(reversedOffset(0, 4), 0);
  const r = reversedCopy(Float32Array.from([1, 2, 3, 4]));
  assert.deepEqual(Array.from(r), [4, 3, 2, 1]);
  // la posición reflejada: leer la copia invertida desde (dur - pos) coincide con ir hacia atrás desde pos
  const dur = 8;
  const pos = 2.5;
  close(wrapPos(reversedOffset(pos, dur) + 1, dur), dur - (pos - 1));
});

test('scratch: picos por columna y texto de velocidad', () => {
  const data = Float32Array.from([0, 0.2, -0.9, 0.1, 0.3, -0.4, 0, 0]);
  const p = peaksOf(data, 4);
  assert.equal(p.length, 4);
  close(p[1], 0.9);
  close(p[2], 0.4);
  assert.equal(peaksOf(new Float32Array(0), 3).length, 3);
  assert.equal(rateLabel(1, 'es'), '+1,00×');
  assert.equal(rateLabel(-0.5, 'en'), '−0.50×');
  assert.equal(rateLabel(0.001, 'es'), '0,00×');
});
