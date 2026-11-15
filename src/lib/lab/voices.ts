/**
 * Voces y bus del Lab: todo el sonido se sintetiza acá con Web Audio, sin archivos ni librerías.
 * Funciona igual sobre un AudioContext (en vivo) y un OfflineAudioContext (exportar WAV, loop del scratch):
 * ninguna función toca el DOM ni usa `window`.
 *
 *   voces percusivas (bombo, clap, hats) ──────────────► bus.dry
 *   voces melódicas (bajo, acid, stab, pad) ► bus.duck ─► bus.dry      (el bombo "agacha" bus.duck: sidechain)
 *   envíos: bus.rev ► convolución (cola oscura) ┐
 *           bus.dly ► eco de corchea con puntillo ┴► mezcla ► filtro subsónico ► limitador ► [analizador] ► volumen ► recorte suave ► salida
 *
 * El diseño sigue el techno de pista: bombo con barrido de tono y saturación, clap con ráfagas y cola, hats de ruido filtrado
 * con choke del abierto, bajo en contratiempo con sidechain, acid con filtro de 24 dB/oct resonante, envolvente y slides.
 */
import { acidMidi, bassMidi, cutoffHz, decaySeconds, driveCurve, driveGain, envOctaves, envPeakHz, midiToHz, resonanceDb, softClipCurve, PAD_CHORD, STAB_CHORD, volumeGain } from './params.ts';
import { stepDuration, swingDelay } from './timing.ts';
import { TRACKS, type AcidParams, type AcidStep, type Pattern, type TrackId } from './pattern.ts';

/* ---------------------------------------------------------------------------
   Bus y cadena maestra
   --------------------------------------------------------------------------- */

export interface Bus {
  /** percusión y todo lo que no se agacha */
  dry: GainNode;
  /** melódicas: se agachan con el bombo */
  duck: GainNode;
  /** envío a la reverberación */
  rev: GainNode;
  /** envío al eco */
  dly: GainNode;
}

export interface Master {
  ctx: BaseAudioContext;
  bus: Bus;
  /** gana el usuario (volumen y silencio) */
  volume: GainNode;
  /** salida final: conectar a ctx.destination */
  output: AudioNode;
  /** nodo del que se toma el AnalyserNode (antes del volumen: el visualizador sigue aunque se silencie) */
  tap: AudioNode;
  delay: DelayNode;
  setTempo(bpm: number, at?: number): void;
  setVolume(v: number, at?: number): void;
}

/** Azar determinista (mulberry32): el ruido y la cola de la reverberación salen iguales en vivo y en el render offline. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    const len = Math.max(1, Math.round(ctx.sampleRate * 1.2));
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = rng(0x5eed);
    for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Respuesta al impulso de una sala oscura: ruido que decae y se va apagando (pasabajos que se cierra con el tiempo). */
function impulse(ctx: BaseAudioContext, seconds = 1.9): AudioBuffer {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    const r = rng(0xa11ce + c * 977);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.55 - 0.5 * t; // coeficiente del pasabajos: más oscuro con el tiempo
      lp += a * ((r() * 2 - 1) - lp);
      d[i] = lp * (1 - t) ** 2.6 * 1.9;
    }
  }
  return b;
}

export function createMaster(ctx: BaseAudioContext, bpm = 130, volume = 0.7): Master {
  const dry = ctx.createGain();
  const duck = ctx.createGain();
  const rev = ctx.createGain();
  const dly = ctx.createGain();
  const mix = ctx.createGain();
  mix.gain.value = 0.8;
  duck.connect(dry);
  dry.connect(mix);

  // Reverberación (cola oscura, retorno bajo)
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  const revRet = ctx.createGain();
  revRet.gain.value = 0.55;
  rev.connect(conv).connect(revRet).connect(mix);

  // Eco de corchea con puntillo, con realimentación oscurecida
  const delay = ctx.createDelay(2);
  delay.delayTime.value = (60 / bpm) * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const fbLp = ctx.createBiquadFilter();
  fbLp.type = 'lowpass';
  fbLp.frequency.value = 2600;
  const dlyRet = ctx.createGain();
  dlyRet.gain.value = 0.5;
  dly.connect(delay);
  delay.connect(fbLp).connect(fb).connect(delay);
  delay.connect(dlyRet).connect(mix);
  dlyRet.connect(rev); // el eco también entra a la sala: más profundidad

  // Subsónico fuera -> volumen del usuario -> limitador -> recorte suave. El analizador se toma antes del volumen:
  // el visualizador sigue moviéndose aunque se silencie, y no depende de lo fuerte que se escuche.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 24;
  hp.Q.value = 0.5;
  mix.connect(hp);
  const vol = ctx.createGain();
  vol.gain.value = volumeGain(volume * 100);
  hp.connect(vol);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  vol.connect(limiter);
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  limiter.connect(clip);

  return {
    ctx,
    bus: { dry, duck, rev, dly },
    volume: vol,
    output: clip,
    tap: hp,
    delay,
    setTempo(b, at) {
      delay.delayTime.setTargetAtTime((60 / b) * 0.75, at ?? ctx.currentTime, 0.04);
    },
    setVolume(v, at) {
      vol.gain.setTargetAtTime(volumeGain(v), at ?? ctx.currentTime, 0.02);
    },
  };
}

/** Agacha las voces melódicas (sidechain falso, programado): el bajo y el acid "respiran" con el bombo. */
export function duckAt(m: Master, t: number, depth = 0.7) {
  const g = m.bus.duck.gain;
  g.setValueAtTime(1 - depth, t);
  g.setTargetAtTime(1, t + 0.012, 0.075);
}

/* ---------------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------------- */

const send = (ctx: BaseAudioContext, from: AudioNode, to: GainNode, amount: number) => {
  if (amount <= 0) return;
  const g = ctx.createGain();
  g.gain.value = amount;
  from.connect(g).connect(to);
};

/** Libera los nodos cuando el origen termina. */
function cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]) {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ya desconectado */
      }
    }
  };
}

const saturator = (ctx: BaseAudioContext, k: number) => {
  const s = ctx.createWaveShaper();
  s.curve = driveCurve(k);
  s.oversample = '2x';
  return s;
};

/* ---------------------------------------------------------------------------
   Percusión
   --------------------------------------------------------------------------- */

export interface Hit {
  /** 0..1 (acento / fuerza) */
  vel?: number;
}

/** Bombo: seno con barrido de tono (~185 a 48 Hz), cuerpo de ~0,4 s, saturación tanh y un clic breve. */
export function kick(ctx: BaseAudioContext, m: Master, t: number, o: Hit = {}) {
  const vel = o.vel ?? 1;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(185, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.05);
  osc.frequency.exponentialRampToValueAtTime(47, t + 0.42);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1 * vel, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.06, 0.09);
  const sat = saturator(ctx, 2.4);
  osc.connect(sat).connect(g).connect(m.bus.dry);
  osc.start(t);
  osc.stop(t + 0.65);
  cleanup(osc, [osc, sat, g]);

  // clic: ruido corto y agudo
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2400;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.28 * vel, t);
  cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
  n.connect(hp).connect(cg).connect(m.bus.dry);
  n.start(t, 0.31);
  n.stop(t + 0.03);
  cleanup(n, [n, hp, cg]);
}

/** Clap: tres ráfagas de ruido con banda en 1,2 kHz y cola más larga, con sala. */
export function clap(ctx: BaseAudioContext, m: Master, t: number, o: Hit = {}) {
  const vel = o.vel ?? 1;
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1250;
  bp.Q.value = 0.9;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 600;
  const g = ctx.createGain();
  const gap = 0.0115;
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 3; i++) {
    const ti = t + i * gap;
    g.gain.linearRampToValueAtTime(1.7 * vel, ti + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.45 * vel, ti + gap - 0.0005);
  }
  const t3 = t + 3 * gap;
  g.gain.linearRampToValueAtTime(1.9 * vel, t3 + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0008, t3 + 0.26);
  n.connect(bp).connect(hp).connect(g);
  g.connect(m.bus.dry);
  send(ctx, g, m.bus.rev, 0.34);
  n.start(t, 0.12);
  n.stop(t + 0.45);
  cleanup(n, [n, bp, hp, g]);
}

/** Choke del hat abierto: cada compás nuevo con hat (cerrado o abierto) lo corta. Un estado por contexto. */
const openChoke = new WeakMap<BaseAudioContext, { node: GainNode; at: number }>();

/** Hat: ruido blanco filtrado. Cerrado ~40 ms, abierto ~300 ms; el cerrado corta al abierto. */
export function hat(ctx: BaseAudioContext, m: Master, t: number, o: Hit & { open?: boolean } = {}) {
  const vel = o.vel ?? 1;
  const open = o.open === true;
  const prev = openChoke.get(ctx);
  if (prev && prev.at < t) {
    try {
      prev.node.gain.setTargetAtTime(0, t, 0.006);
    } catch {
      /* nodo ya liberado */
    }
    openChoke.delete(ctx);
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = open ? 6200 : 7400;
  hp.Q.value = 0.6;
  const bp = ctx.createBiquadFilter();
  bp.type = 'peaking';
  bp.frequency.value = 10200;
  bp.Q.value = 1.1;
  bp.gain.value = 6;
  const g = ctx.createGain();
  const peak = (open ? 0.34 : 0.3) * vel;
  const len = open ? 0.3 : 0.042 + 0.03 * vel;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.0012);
  g.gain.exponentialRampToValueAtTime(0.0006, t + len);
  const choke = ctx.createGain();
  n.connect(hp).connect(bp).connect(g).connect(choke).connect(m.bus.dry);
  if (open) {
    send(ctx, choke, m.bus.rev, 0.1);
    openChoke.set(ctx, { node: choke, at: t });
  }
  n.start(t, 0.5 + (t % 0.37));
  n.stop(t + len + 0.05);
  cleanup(n, [n, hp, bp, g, choke]);
}

/* ---------------------------------------------------------------------------
   Melódicas
   --------------------------------------------------------------------------- */

/** Bajo del contratiempo: seno + sierra filtrada, ataque seco y cola corta. Se agacha con el bombo. */
export function bass(ctx: BaseAudioContext, m: Master, t: number, o: { key: number; len?: number; vel?: number }) {
  const f = midiToHz(bassMidi(o.key));
  const len = Math.max(0.05, o.len ?? 0.14);
  const vel = o.vel ?? 1;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3;
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.exponentialRampToValueAtTime(150, t + 0.12);
  const sawG = ctx.createGain();
  sawG.gain.value = 0.32;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.6 * vel, t + 0.005);
  g.gain.setTargetAtTime(0, t + len, 0.035);
  sub.connect(g);
  saw.connect(lp).connect(sawG).connect(g);
  g.connect(m.bus.duck);
  const end = t + len + 0.3;
  sub.start(t);
  saw.start(t);
  sub.stop(end);
  saw.stop(end);
  cleanup(sub, [sub, saw, lp, sawG, g]);
}

/** Monosinte tipo 303. Un oscilador siempre encendido (sierra o cuadrada) -> dos pasabajos en cascada (24 dB/oct, resonancia) -> saturador -> envolvente de volumen. */
export class AcidVoice {
  private osc: OscillatorNode;
  private f1: BiquadFilterNode;
  private f2: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private amp: GainNode;
  private drive = -1;
  private started = false;
  private stopped = false;
  params: AcidParams;

  constructor(
    ctx: BaseAudioContext,
    m: Master,
    params: AcidParams,
  ) {
    this.params = { ...params };
    this.osc = ctx.createOscillator();
    this.osc.type = params.wave === 1 ? 'square' : 'sawtooth';
    this.f1 = ctx.createBiquadFilter();
    this.f1.type = 'lowpass';
    this.f2 = ctx.createBiquadFilter();
    this.f2.type = 'lowpass';
    this.f2.Q.value = -3; // 0,7 lineal: sin segunda resonancia
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '2x';
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.f1.frequency.value = this.f2.frequency.value = cutoffHz(params.cutoff);
    this.osc.connect(this.f1).connect(this.f2).connect(this.shaper).connect(this.amp).connect(m.bus.duck);
    send(ctx, this.amp, m.bus.dly, 0.34);
    send(ctx, this.amp, m.bus.rev, 0.1);
    this.applyDrive(params.drive);
  }

  private applyDrive(v: number) {
    if (Math.abs(v - this.drive) < 2 && this.drive >= 0) return;
    this.drive = v;
    this.shaper.curve = driveCurve(driveGain(v));
  }

  /** Cambia las perillas: se aplican a las notas siguientes. */
  setParams(p: AcidParams) {
    this.params = { ...p };
    this.osc.type = p.wave === 1 ? 'square' : 'sawtooth';
    this.applyDrive(p.drive);
  }

  /**
   * Una nota. `len` es el largo de la compuerta en segundos; `tied` = viene ligada de la nota anterior (slide):
   * el tono se desliza y la envolvente de volumen no se vuelve a disparar.
   */
  play(t: number, midi: number, len: number, o: { accent?: boolean; tied?: boolean } = {}) {
    if (this.stopped) return;
    const p = this.params;
    const accent = o.accent === true;
    const hz = midiToHz(midi);
    if (!this.started) {
      this.started = true;
      this.osc.frequency.setValueAtTime(hz, Math.max(0, t - 0.01));
      this.osc.start(Math.max(0, t - 0.01));
    }
    if (o.tied) this.osc.frequency.setTargetAtTime(hz, t, 0.028);
    else this.osc.frequency.setValueAtTime(hz, t);

    const base = cutoffHz(p.cutoff);
    const peak = envPeakHz(base, envOctaves(p.env), accent);
    const dec = decaySeconds(p.decay) * (accent ? 0.62 : 1);
    for (const f of [this.f1, this.f2]) {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setValueAtTime(peak, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, base), t + dec);
    }
    this.f1.Q.cancelScheduledValues(t);
    this.f1.Q.setValueAtTime(resonanceDb(p.res) + (accent ? 3 : 0), t);

    const level = accent ? 0.5 : 0.34;
    const g = this.amp.gain;
    g.cancelScheduledValues(t); // quita la liberación de la nota anterior si esta la sigue ligada
    if (!o.tied) {
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(level, t + 0.004);
    } else {
      g.setValueAtTime(level, t);
    }
    g.setTargetAtTime(0, t + Math.max(0.02, len), 0.014);
  }

  /** Silencia y libera el oscilador. */
  dispose(at: number) {
    if (this.stopped) return;
    this.stopped = true;
    const t = Math.max(at, 0);
    try {
      this.amp.gain.cancelScheduledValues(t);
      this.amp.gain.setTargetAtTime(0, t, 0.02);
      if (this.started) {
        this.osc.stop(t + 0.3);
        cleanup(this.osc, [this.osc, this.f1, this.f2, this.shaper, this.amp]);
      }
    } catch {
      /* ya detenido */
    }
  }
}

/** Acorde seco con eco y sala (el "stab" del dub techno): dos sierras desafinadas por nota, filtro que se cierra. */
export function stab(ctx: BaseAudioContext, m: Master, t: number, o: { key: number; vel?: number; len?: number }) {
  const vel = o.vel ?? 1;
  const len = o.len ?? 0.32;
  const root = bassMidi(o.key) + 24;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(650, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09 * vel, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.04, len * 0.4);
  const nodes: AudioNode[] = [lp, g];
  let last: OscillatorNode | null = null;
  for (const semi of STAB_CHORD) {
    for (const det of [-9, 9]) {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = midiToHz(root + semi);
      o1.detune.value = det;
      o1.connect(lp);
      o1.start(t);
      o1.stop(t + len * 3 + 0.2);
      nodes.push(o1);
      last = o1;
    }
  }
  lp.connect(g).connect(m.bus.duck);
  send(ctx, g, m.bus.dly, 0.5);
  send(ctx, g, m.bus.rev, 0.4);
  if (last) cleanup(last, nodes);
}

/** Pad: cuatro notas con sierras desafinadas, ataque lento, filtro que respira con un LFO lento y mucha sala. */
export function pad(ctx: BaseAudioContext, m: Master, t: number, o: { key: number; vel?: number; len?: number }) {
  const vel = o.vel ?? 1;
  const len = o.len ?? 2.2;
  const root = bassMidi(o.key) + 24;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.value = 820;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.21;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 260;
  lfo.connect(lfoG).connect(lp.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.55);
  g.gain.setTargetAtTime(0, t + len, 0.5);
  const end = t + len + 3.2;
  const nodes: AudioNode[] = [lp, lfo, lfoG, g];
  lfo.start(t);
  lfo.stop(end);
  let last: OscillatorNode = lfo;
  for (const semi of PAD_CHORD) {
    for (const det of [-12, 0, 12]) {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = midiToHz(root + semi);
      o1.detune.value = det;
      o1.connect(lp);
      o1.start(t);
      o1.stop(end);
      nodes.push(o1);
      last = o1;
    }
  }
  lp.connect(g).connect(m.bus.duck);
  send(ctx, g, m.bus.rev, 0.65);
  cleanup(last, nodes);
}

/* ---------------------------------------------------------------------------
   Reproductor de patrones (compartido por el secuenciador, el visualizador, el scratch y la exportación)
   --------------------------------------------------------------------------- */

export interface Player {
  ctx: BaseAudioContext;
  master: Master;
  acid: AcidVoice;
  /** pistas silenciadas por la persona (no forman parte del patrón compartido) */
  muted: Set<TrackId | 'acid'>;
  /** fin del último paso del acid: sirve para saber si una nota nueva viene ligada */
  tiedUntil: number;
}

export function createPlayer(ctx: BaseAudioContext, master: Master, acidParams: AcidParams): Player {
  return { ctx, master, acid: new AcidVoice(ctx, master, acidParams), muted: new Set(), tiedUntil: -1 };
}

export function disposePlayer(p: Player, at: number) {
  p.acid.dispose(at);
}

/** Programa todo lo que suena en un paso del patrón. `dur` = hasta el próximo paso (con swing). */
export function playStep(p: Player, pat: Pattern, step: number, t: number, dur: number) {
  const { ctx, master: m } = p;
  const on = (id: TrackId) => pat.tracks[id][step] && !p.muted.has(id);
  const accentHat = step % 4 === 2;
  if (on('kick')) {
    duckAt(m, t, 0.72);
    kick(ctx, m, t);
  }
  if (on('clap')) clap(ctx, m, t);
  // hat cerrado y abierto: el cerrado corta al abierto; si coinciden en el mismo paso, suena solo el abierto
  if (on('open')) hat(ctx, m, t, { open: true, vel: 0.9 });
  else if (on('hat')) hat(ctx, m, t, { vel: accentHat ? 1 : 0.7 });
  if (on('bass')) bass(ctx, m, t, { key: pat.key, len: Math.min(0.2, dur * 0.75) });

  const a: AcidStep = pat.acid[step];
  if (a.note > 0 && !p.muted.has('acid')) {
    p.acid.setParams(pat.acidParams);
    const next = pat.acid[(step + 1) % pat.acid.length];
    const tieNext = next.note > 0 && next.slide;
    const tied = t <= p.tiedUntil + 0.005 && a.slide;
    // compuerta: hasta el próximo paso si el siguiente está ligado; si no, ~60 % del paso
    const len = tieNext ? dur * 1.04 : dur * 0.58;
    p.acid.play(t, acidMidi(a.note, pat.key), len, { accent: a.accent, tied });
    p.tiedUntil = tieNext ? t + dur : -1;
  } else {
    p.tiedUntil = -1;
  }
}

/** Los ocho pads táctiles. */
export const PAD_IDS = ['kick', 'clap', 'hat', 'open', 'bass', 'acid', 'stab', 'pad'] as const;
export type PadId = (typeof PAD_IDS)[number];

/** Dispara un pad ahora (o en `t`). Los cinco primeros se pueden grabar en el patrón. */
export function triggerPad(p: Player, id: PadId, pat: Pattern, t: number) {
  const { ctx, master: m } = p;
  switch (id) {
    case 'kick':
      duckAt(m, t, 0.72);
      kick(ctx, m, t);
      break;
    case 'clap':
      clap(ctx, m, t);
      break;
    case 'hat':
      hat(ctx, m, t, { vel: 0.9 });
      break;
    case 'open':
      hat(ctx, m, t, { open: true });
      break;
    case 'bass':
      bass(ctx, m, t, { key: pat.key, len: 0.32 });
      break;
    case 'acid': {
      // una nota suelta con una voz propia (no pisa la del secuenciador)
      const v = new AcidVoice(ctx, m, pat.acidParams);
      v.play(t, acidMidi(1, pat.key), 0.26, { accent: true });
      v.dispose(t + 0.7);
      break;
    }
    case 'stab':
      stab(ctx, m, t, { key: pat.key });
      break;
    case 'pad':
      pad(ctx, m, t, { key: pat.key, len: 1.8 });
      break;
  }
}

/** Pista del patrón a la que escribe cada pad al grabar (solo los primeros cinco). */
export const padTrack = (id: PadId): TrackId | null => (TRACKS as readonly string[]).includes(id) ? (id as TrackId) : null;

/* ---------------------------------------------------------------------------
   Render offline de un patrón (exportar WAV y loop del scratch)
   --------------------------------------------------------------------------- */

export interface RenderOptions {
  bars: number;
  sampleRate: number;
  /** cola extra al final (reverberación, eco) */
  tail?: number;
  /** volumen del bus maestro 0..1 (por defecto 0,8) */
  volume?: number;
  /** si es true, la cola se pliega sobre el principio para que el loop no tenga hueco ni corte */
  loop?: boolean;
}

export async function renderPattern(pat: Pattern, o: RenderOptions): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext | undefined = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('offline-audio');
  const sd = stepDuration(pat.bpm);
  const body = o.bars * 16 * sd;
  const tail = o.tail ?? 1.6;
  const frames = Math.ceil((body + tail) * o.sampleRate);
  const ctx = new Offline(2, frames, o.sampleRate);
  const master = createMaster(ctx, pat.bpm, o.volume ?? 0.8);
  master.output.connect(ctx.destination);
  const player = createPlayer(ctx, master, pat.acidParams);
  const lead = 0.02;
  let grid = lead;
  for (let i = 0; i < o.bars * 16; i++) {
    const step = i % 16;
    const time = grid + swingDelay(step, pat.bpm, pat.swing);
    const nextTime = grid + sd + swingDelay((step + 1) % 16, pat.bpm, pat.swing);
    playStep(player, pat, step, time, nextTime - time);
    grid += sd;
  }
  disposePlayer(player, body + lead);
  const buf = await ctx.startRendering();
  if (!o.loop) return buf;
  // loop sin hueco: la cola (que cae después del final) se suma al principio
  const loopFrames = Math.round((body) * o.sampleRate);
  const out = ctx.createBuffer(2, loopFrames, o.sampleRate);
  for (let c = 0; c < 2; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    const start = Math.round(lead * o.sampleRate);
    for (let i = 0; i < loopFrames; i++) dst[i] = src[start + i] ?? 0;
    for (let i = 0; start + loopFrames + i < src.length && i < loopFrames; i++) dst[i] += src[start + loopFrames + i];
  }
  return out;
}

export type { Pattern };
