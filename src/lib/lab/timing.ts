/**
 * Tiempo del secuenciador: duración de un paso, swing, planificación con anticipación (lookahead) y cuantización.
 * PURO: el reloj de audio y los timers viven en transport.ts; acá solo cuentas.
 *
 * Swing: estilo MPC sobre corcheas de semicorchea. Los pasos impares (el "y" de cada par) se retrasan
 * `stepDur * swing / 200`. Con swing 0 queda recto (50 %); con 100 el segundo paso cae al 75 % del par (shuffle fuerte).
 * Los pasos pares nunca se mueven, así el bombo en 0, 4, 8 y 12 queda siempre firme.
 */
import { STEPS } from './pattern.ts';

/** Duración de un paso (semicorchea) en segundos. */
export const stepDuration = (bpm: number) => 60 / bpm / 4;

/** Retraso de un paso por swing (segundos). Solo los impares. */
export const swingDelay = (step: number, bpm: number, swing: number) => (step % 2 === 1 ? (stepDuration(bpm) * Math.min(100, Math.max(0, swing))) / 200 : 0);

export interface PlanState {
  /** tiempo del próximo paso sin swing (reloj de audio, segundos) */
  grid: number;
  /** contador absoluto de pasos (0, 1, 2, ...) */
  abs: number;
}

export interface PlannedStep {
  /** paso dentro del patrón, 0..15 */
  step: number;
  abs: number;
  /** cuándo suena (con swing) */
  time: number;
  /** hasta el próximo paso (con swing): sirve para la duración de las notas y los slides */
  dur: number;
}

export interface PlanOptions {
  now: number;
  /** cuánto por delante se programa (s) */
  lookahead: number;
  bpm: number;
  swing: number;
  /** si el reloj quedó más atrás que esto (pestaña dormida), se re-sincroniza en vez de disparar todo junto */
  maxLag?: number;
}

/**
 * Programa todos los pasos que caen antes de `now + lookahead`. No muta el estado: devuelve el nuevo.
 * Un paso se programa una sola vez: el estado avanza `grid` por cada uno.
 */
export function planSteps(state: PlanState, o: PlanOptions): { events: PlannedStep[]; state: PlanState } {
  const events: PlannedStep[] = [];
  let { grid, abs } = state;
  const maxLag = o.maxLag ?? 0.25;
  if (grid < o.now - maxLag) grid = o.now + 0.02; // re-sincronizar tras una pausa larga
  const horizon = o.now + o.lookahead;
  let guard = 0;
  while (guard++ < 64) {
    const step = ((abs % STEPS) + STEPS) % STEPS;
    const time = grid + swingDelay(step, o.bpm, o.swing);
    if (time >= horizon) break;
    const sd = stepDuration(o.bpm);
    const nextStep = (step + 1) % STEPS;
    const dur = grid + sd + swingDelay(nextStep, o.bpm, o.swing) - time;
    events.push({ step, abs, time, dur });
    grid += sd;
    abs += 1;
  }
  return { events, state: { grid, abs } };
}

/** Posición fraccionaria en pasos a partir del último paso programado que ya sonó (para cuantizar una pulsación). */
export function stepPosition(now: number, last: { step: number; time: number }, bpm: number): number {
  return last.step + (now - last.time) / stepDuration(bpm);
}

/** Cuantiza una posición fraccionaria al paso más cercano (0..15). */
export const quantizeStep = (pos: number) => (((Math.round(pos) % STEPS) + STEPS) % STEPS);

/** Redondea un tiempo (s desde el inicio del patrón) a la grilla de pasos más cercana, con swing. */
export function quantizeTime(t: number, bpm: number, swing: number): number {
  const sd = stepDuration(bpm);
  const base = Math.round(t / sd);
  let best = base * sd + swingDelay(((base % STEPS) + STEPS) % STEPS, bpm, swing);
  for (const k of [base - 1, base + 1]) {
    const c = k * sd + swingDelay(((k % STEPS) + STEPS) % STEPS, bpm, swing);
    if (Math.abs(c - t) < Math.abs(best - t)) best = c;
  }
  return best;
}

/** Duración de `bars` compases de 4/4 en segundos. */
export const barsDuration = (bars: number, bpm: number) => bars * 4 * (60 / bpm);
