/**
 * Cuentas del scratch: velocidad del plato -> velocidad de reproducción, posición dentro del loop, picos para dibujar la onda. PURO.
 *
 * Técnica (la más compatible: sin AudioWorklet): un AudioBufferSourceNode en loop cuyo `playbackRate` sigue al plato.
 * Web Audio no reproduce hacia atrás: se usa una copia invertida del buffer y se cambia de una a otra, con un fundido de ~10 ms,
 * cuando el plato invierte el sentido. La posición del loop se integra acá (el nodo no la expone).
 */

/** 33 1/3 rpm = una vuelta cada 1,8 s = 200 grados por segundo (igual que --disc-live de tokens.css). */
export const REF_DEG_PER_SEC = 200;
export const MAX_RATE = 4;
/** Por debajo de esta velocidad (en valor absoluto) el plato se considera detenido: silencio, sin ruido. */
export const DEAD_ZONE = 0.05;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Velocidad angular (grados/s, con signo) a velocidad de reproducción (1 = normal, negativo = hacia atrás). `pitch` es el fader de pitch (0,92..1,08). */
export const rateFromVelocity = (velDegPerSec: number, pitch = 1, ref = REF_DEG_PER_SEC) => clamp((velDegPerSec / ref) * pitch, -MAX_RATE, MAX_RATE);

export const directionOf = (rate: number): -1 | 0 | 1 => (Math.abs(rate) < DEAD_ZONE ? 0 : rate < 0 ? -1 : 1);

/** Suavizado exponencial hacia un objetivo (tau en segundos). */
export const smoothRate = (prev: number, target: number, dt: number, tau = 0.03) => prev + (target - prev) * (1 - Math.exp(-Math.max(0, dt) / Math.max(1e-6, tau)));

/** Posición dentro de [0, dur) con vuelta. */
export function wrapPos(pos: number, dur: number): number {
  if (!(dur > 0)) return 0;
  const m = pos % dur;
  return m < 0 ? m + dur : m;
}

/** Avanza la posición `rate` * `dt` segundos de loop. */
export const advancePos = (pos: number, rate: number, dt: number, dur: number) => wrapPos(pos + rate * dt, dur);

/** Offset de arranque en la copia invertida para una posición dada en el original. */
export const reversedOffset = (pos: number, dur: number) => wrapPos(dur - pos, dur);

/** Un valor por columna: el pico absoluto del tramo de muestras (para dibujar la onda). 0..1. */
export function peaksOf(data: ArrayLike<number>, n: number): Float32Array {
  const out = new Float32Array(n);
  const len = data.length;
  if (!len || n <= 0) return out;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * len) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * len) / n));
    let m = 0;
    for (let j = a; j < b && j < len; j++) m = Math.max(m, Math.abs(data[j]));
    out[i] = Math.min(1, m);
  }
  return out;
}

export function reversedCopy(data: Float32Array): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0, j = data.length - 1; i < data.length; i++, j--) out[i] = data[j];
  return out;
}

/** Texto de la velocidad para la lectura: "+1,00×", "−0,50×", "0,00×". */
export function rateLabel(rate: number, lang: 'es' | 'en' = 'es'): string {
  const r = Math.abs(rate) < 0.005 ? 0 : rate;
  const s = Math.abs(r).toFixed(2);
  const num = lang === 'es' ? s.replace('.', ',') : s;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${num}×`;
}
