/**
 * Las voces del Lab usan Web Audio, que Node no trae. Se prueban contra un contexto FALSO que registra cada llamada a un AudioParam
 * y a los orígenes, y verifica lo que un navegador real rechazaría o pondría mal: rampas exponenciales a 0 o a negativos, tiempos
 * negativos o no finitos, constantes de tiempo en 0, `stop` antes de `start`, offsets fuera del buffer, rampas que arrancan antes
 * del evento anterior. No juzga cómo suena: eso se escucha en el navegador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreset, PRESETS } from '../src/lib/lab/presets.ts';
import { createMaster, createPlayer, disposePlayer, playStep, triggerPad, PAD_IDS, AcidVoice, kick, clap, hat, bass, stab, pad } from '../src/lib/lab/voices.ts';
import { planSteps } from '../src/lib/lab/timing.ts';
import { emptyPattern, DEFAULT_ACID_PARAMS } from '../src/lib/lab/pattern.ts';

type Ev = { type: string; time: number; value?: number; tc?: number };
const problems: string[] = [];
const bad = (msg: string) => problems.push(msg);

class FakeParam {
  events: Ev[] = [];
  name: string;
  private v: number;
  constructor(name: string, init = 0) {
    this.name = name;
    this.v = init;
  }
  get value() {
    return this.v;
  }
  set value(x: number) {
    if (!Number.isFinite(x)) bad(`${this.name}.value no finito: ${x}`);
    this.v = x;
  }
  private chk(kind: string, time: number, value?: number) {
    if (!Number.isFinite(time) || time < 0) bad(`${this.name}.${kind}: tiempo inválido ${time}`);
    if (value !== undefined && !Number.isFinite(value)) bad(`${this.name}.${kind}: valor no finito ${value}`);
  }
  setValueAtTime(value: number, time: number) {
    this.chk('setValueAtTime', time, value);
    this.events.push({ type: 'set', time, value });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.chk('linearRamp', time, value);
    const last = this.events.at(-1);
    if (last && time < last.time - 1e-12) bad(`${this.name}: rampa lineal termina (${time}) antes del evento anterior (${last.time})`);
    this.events.push({ type: 'lin', time, value });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.chk('expRamp', time, value);
    if (!(value > 0)) bad(`${this.name}: rampa exponencial a ${value} (debe ser > 0)`);
    const last = this.events.at(-1);
    if (last && time < last.time - 1e-12) bad(`${this.name}: rampa exp termina (${time}) antes del evento anterior (${last.time})`);
    if (last && last.value !== undefined && !(last.value > 0) && last.type !== 'target') bad(`${this.name}: rampa exp desde ${last.value}`);
    this.events.push({ type: 'exp', time, value });
    return this;
  }
  setTargetAtTime(value: number, time: number, tc: number) {
    this.chk('setTarget', time, value);
    if (!(tc > 0) || !Number.isFinite(tc)) bad(`${this.name}: constante de tiempo inválida ${tc}`);
    this.events.push({ type: 'target', time, value, tc });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.chk('cancel', time);
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
}

const sources: FakeNode[] = [];
class FakeNode {
  connected: FakeNode[] = [];
  started = -1;
  stopped = -1;
  onended: (() => void) | null = null;
  type = '';
  loop = false;
  curve: Float32Array | null = null;
  buffer: { duration: number } | null = null;
  oversample = 'none';
  [k: string]: unknown;
  kind: string;
  constructor(kind: string, params: Record<string, number> = {}) {
    this.kind = kind;
    for (const [k, v] of Object.entries(params)) (this as Record<string, unknown>)[k] = new FakeParam(`${kind}.${k}`, v);
  }
  connect(n: FakeNode) {
    this.connected.push(n);
    return n;
  }
  disconnect() {}
  start(when = 0, offset = 0) {
    if (!Number.isFinite(when) || when < 0) bad(`${this.kind}.start: tiempo inválido ${when}`);
    if (this.buffer && (offset < 0 || offset >= this.buffer.duration)) bad(`${this.kind}.start: offset ${offset} fuera del buffer (${this.buffer.duration})`);
    this.started = when;
  }
  stop(when = 0) {
    if (this.started < 0) bad(`${this.kind}.stop sin start`);
    if (when < this.started - 1e-9) bad(`${this.kind}.stop (${when}) antes de start (${this.started})`);
    this.stopped = when;
  }
}

class FakeCtx {
  sampleRate = 48000;
  currentTime = 0;
  destination = new FakeNode('destination');
  createGain() {
    return new FakeNode('gain', { gain: 1 });
  }
  createOscillator() {
    const n = new FakeNode('osc', { frequency: 440, detune: 0 });
    sources.push(n);
    return n;
  }
  createBufferSource() {
    const n = new FakeNode('bufsrc', { playbackRate: 1 });
    sources.push(n);
    return n;
  }
  createBiquadFilter() {
    return new FakeNode('biquad', { frequency: 350, Q: 1, gain: 0, detune: 0 });
  }
  createWaveShaper() {
    return new FakeNode('shaper');
  }
  createDelay() {
    return new FakeNode('delay', { delayTime: 0 });
  }
  createConvolver() {
    return new FakeNode('convolver');
  }
  createDynamicsCompressor() {
    return new FakeNode('comp', { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25 });
  }
  createBuffer(ch: number, len: number, sr: number) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i: number) => data[i] };
  }
}

const mkEnv = () => {
  problems.length = 0;
  sources.length = 0;
  const ctx = new FakeCtx() as unknown as BaseAudioContext;
  const master = createMaster(ctx, 130, 0.7);
  return { ctx, master };
};

test('voces sueltas: sin parámetros inválidos ni orígenes mal programados', () => {
  const { ctx, master } = mkEnv();
  const t = 1.25;
  kick(ctx, master, t);
  kick(ctx, master, t + 0.1, { vel: 0.4 });
  clap(ctx, master, t + 0.2);
  hat(ctx, master, t + 0.3);
  hat(ctx, master, t + 0.4, { open: true });
  hat(ctx, master, t + 0.7); // corta al abierto
  bass(ctx, master, t + 0.5, { key: 3, len: 0.12 });
  stab(ctx, master, t + 0.6, { key: 0 });
  pad(ctx, master, t + 0.7, { key: 11, len: 1.6 });
  assert.deepEqual(problems, []);
  assert.ok(sources.length > 20);
  for (const s of sources) assert.ok(s.started >= 0 && s.stopped >= s.started, `${s.kind} arrancado y detenido`);
});

test('voz acid: notas sueltas, acento, slide y cambios de perillas', () => {
  const { ctx, master } = mkEnv();
  const v = new AcidVoice(ctx, master, DEFAULT_ACID_PARAMS);
  v.play(0.5, 45, 0.07);
  v.play(0.62, 57, 0.07, { accent: true });
  v.play(0.74, 60, 0.13, { tied: false });
  v.play(0.86, 62, 0.07, { tied: true });
  v.setParams({ cutoff: 100, res: 100, env: 100, decay: 0, drive: 100, wave: 1 });
  v.play(1.0, 69, 0.1, { accent: true, tied: true });
  v.setParams({ cutoff: 0, res: 0, env: 0, decay: 100, drive: 0, wave: 0 });
  v.play(1.2, 45, 0.1);
  v.dispose(1.5);
  v.dispose(1.6); // idempotente
  v.play(2, 45, 0.1); // después de dispose: no hace nada
  assert.deepEqual(problems, []);
});

test('todos los presets: dos compases con el reloj real, todo bien programado', () => {
  for (const def of PRESETS) {
    const { ctx, master } = mkEnv();
    const pat = buildPreset(def);
    const player = createPlayer(ctx, master, pat.acidParams);
    let state = { grid: 0.05, abs: 0 };
    let now = 0;
    while (state.abs < 64) {
      const r = planSteps(state, { now, lookahead: 0.14, bpm: pat.bpm, swing: pat.swing });
      state = r.state;
      for (const e of r.events) playStep(player, pat, e.step, e.time, e.dur);
      now += 0.025;
    }
    disposePlayer(player, now + 0.5);
    assert.deepEqual(problems, [], def.id);
    assert.ok(sources.length > 50, `${def.id}: suena`);
  }
});

test('pads y patrón vacío', () => {
  const { ctx, master } = mkEnv();
  const pat = buildPreset(PRESETS[0]);
  const player = createPlayer(ctx, master, pat.acidParams);
  for (const id of PAD_IDS) triggerPad(player, id, pat, 3);
  const empty = emptyPattern();
  for (let s = 0; s < 16; s++) playStep(player, empty, s, 4 + s * 0.1, 0.1);
  assert.deepEqual(problems, []);
});

test('cadena maestra: el limitador está conectado y el volumen se puede cambiar', () => {
  const { master } = mkEnv();
  master.setVolume(0, 1);
  master.setVolume(100, 2);
  master.setTempo(90, 2);
  master.setTempo(180, 3);
  assert.deepEqual(problems, []);
  assert.ok(master.output && master.tap && master.volume);
});

test('el contexto falso detecta de verdad los errores que dice detectar', () => {
  problems.length = 0;
  const p = new FakeParam('p', 1);
  p.setValueAtTime(1, 1);
  p.exponentialRampToValueAtTime(0, 2);
  p.linearRampToValueAtTime(1, 0.5);
  p.setTargetAtTime(0, -1, 0);
  const src = new FakeNode('osc', { frequency: 1 });
  src.stop(1);
  src.start(2);
  src.stop(1);
  const n = problems.length;
  assert.ok(n >= 6, `se detectaron ${n} problemas`);
  problems.length = 0;
});
