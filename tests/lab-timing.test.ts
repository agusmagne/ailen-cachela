import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barsDuration, planSteps, quantizeStep, quantizeTime, stepDuration, stepPosition, swingDelay, type PlanState } from '../src/lib/lab/timing.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('duración de un paso y de compases', () => {
  close(stepDuration(120), 0.125);
  close(stepDuration(130), 60 / 130 / 4);
  close(barsDuration(4, 120), 8);
});

test('swing: solo los pasos impares se retrasan; 0 es recto y 100 lleva al 75 % del par', () => {
  for (let s = 0; s < 16; s += 2) assert.equal(swingDelay(s, 128, 100), 0);
  for (let s = 1; s < 16; s += 2) {
    assert.equal(swingDelay(s, 128, 0), 0);
    close(swingDelay(s, 128, 100), stepDuration(128) / 2);
    close(swingDelay(s, 128, 50), stepDuration(128) / 4);
  }
  // 100 %: el segundo paso cae al 75 % de la duración del par
  const sd = stepDuration(120);
  close((sd + swingDelay(1, 120, 100)) / (2 * sd), 0.75);
  // fuera de rango se acota
  close(swingDelay(1, 120, 500), swingDelay(1, 120, 100));
  close(swingDelay(1, 120, -5), 0);
});

test('planSteps: programa exactamente los pasos del horizonte y no repite ninguno', () => {
  let state: PlanState = { grid: 10, abs: 0 };
  const all: number[] = [];
  let now = 10;
  for (let i = 0; i < 40; i++) {
    const r = planSteps(state, { now, lookahead: 0.14, bpm: 120, swing: 0 });
    state = r.state;
    for (const e of r.events) {
      assert.ok(e.time >= now - 1e-9, 'nunca en el pasado');
      assert.ok(e.time < now + 0.14 + 1e-9, 'dentro del horizonte');
      all.push(e.abs);
    }
    now += 0.025;
  }
  // 1 s de reloj a 120 bpm = 8 pasos de 0,125 s; con el horizonte van unos 9-10 programados
  assert.deepEqual(all, all.map((_, i) => i), 'abs consecutivos sin saltos ni repetidos');
  assert.ok(all.length >= 8 && all.length <= 10, `se programaron ${all.length}`);
});

test('planSteps: tiempos con swing, paso dentro del patrón y duración hasta el próximo', () => {
  const r = planSteps({ grid: 0, abs: 14 }, { now: 0, lookahead: 1, bpm: 120, swing: 100, maxLag: 10 });
  const sd = 0.125;
  assert.deepEqual(r.events.slice(0, 4).map((e) => e.step), [14, 15, 0, 1]);
  close(r.events[0].time, 0);
  close(r.events[1].time, sd + sd / 2); // impar, retrasado
  close(r.events[2].time, 2 * sd);
  // la duración del paso 14 llega hasta el paso 15 (retrasado)
  close(r.events[0].dur, sd + sd / 2);
  // y la del 15 hasta el 0 (recto): más corta
  close(r.events[1].dur, sd - sd / 2);
  // las duraciones de un par suman dos pasos exactos
  close(r.events[0].dur + r.events[1].dur, 2 * sd);
  assert.equal(r.events.every((e) => e.step >= 0 && e.step < 16), true);
});

test('planSteps: tras una pausa larga se re-sincroniza en vez de disparar todo junto', () => {
  const r = planSteps({ grid: 1, abs: 5 }, { now: 100, lookahead: 0.14, bpm: 130, swing: 0 });
  assert.ok(r.events.length <= 3);
  assert.ok(r.events.every((e) => e.time >= 100));
  assert.equal(r.events[0].abs, 5, 'el contador de pasos sigue donde estaba');
});

test('cambio de tempo entre llamadas: sigue consecutivo', () => {
  let state: PlanState = { grid: 0, abs: 0 };
  const a = planSteps(state, { now: 0, lookahead: 0.6, bpm: 100, swing: 0, maxLag: 9 });
  state = a.state;
  const b = planSteps(state, { now: 0.6, lookahead: 0.6, bpm: 160, swing: 0, maxLag: 9 });
  assert.equal(b.events[0].abs, a.events[a.events.length - 1].abs + 1);
  assert.ok(b.events[0].time >= a.events[a.events.length - 1].time);
});

test('cuantización al paso más cercano, con vuelta', () => {
  assert.equal(quantizeStep(3.49), 3);
  assert.equal(quantizeStep(3.5), 4);
  assert.equal(quantizeStep(15.6), 0);
  assert.equal(quantizeStep(-0.4), 0);
  assert.equal(quantizeStep(-1), 15);
  const pos = stepPosition(10.07, { step: 4, time: 10 }, 120); // 0,07 s = 0,56 paso
  assert.equal(quantizeStep(pos), 5);
  assert.equal(quantizeStep(stepPosition(10.05, { step: 4, time: 10 }, 120)), 4);
});

test('quantizeTime respeta el swing', () => {
  const bpm = 120;
  const sd = 0.125;
  close(quantizeTime(0.03, bpm, 0), 0);
  close(quantizeTime(0.1, bpm, 0), sd);
  // con swing 100 el paso 1 cae en sd * 1,5
  close(quantizeTime(sd * 1.45, bpm, 100), sd * 1.5);
  close(quantizeTime(sd * 2.02, bpm, 100), sd * 2);
});
