/**
 * Análisis del espectro para el visualizador. PURO: recibe los bytes de `AnalyserNode.getByteFrequencyData`
 * (0..255 por bin, el bin i cubre i * sampleRate / fftSize Hz) y devuelve magnitudes 0..1.
 */

export interface Bands {
  bass: number;
  mid: number;
  high: number;
  /** promedio ponderado de las tres */
  energy: number;
}

export const BAND_EDGES_HZ = { bass: [30, 150], mid: [150, 2500], high: [2500, 12000] } as const;

/** Rango de bins [lo, hi) para un rango de frecuencias; siempre al menos un bin. */
export function binRange(hzLo: number, hzHi: number, sampleRate: number, fftSize: number, binCount = fftSize / 2): [number, number] {
  const hz = sampleRate / fftSize;
  const lo = Math.max(0, Math.min(binCount - 1, Math.floor(hzLo / hz)));
  const hi = Math.max(lo + 1, Math.min(binCount, Math.ceil(hzHi / hz)));
  return [lo, hi];
}

function avg(data: ArrayLike<number>, lo: number, hi: number): number {
  let s = 0;
  for (let i = lo; i < hi; i++) s += data[i];
  return s / Math.max(1, hi - lo) / 255;
}

/** Bandas a partir de un espectro. `gain` es la sensibilidad (1 = neutra). */
export function bandsFromSpectrum(data: ArrayLike<number>, sampleRate: number, fftSize: number, gain = 1): Bands {
  const n = data.length;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const [bl, bh] = binRange(...BAND_EDGES_HZ.bass, sampleRate, fftSize, n);
  const [ml, mh] = binRange(...BAND_EDGES_HZ.mid, sampleRate, fftSize, n);
  const [hl, hh] = binRange(...BAND_EDGES_HZ.high, sampleRate, fftSize, n);
  // Curva de potencia: las magnitudes de Analyser son logarítmicas (dB) y el ojo agradece un poco más de contraste
  const shape = (x: number) => clamp01(x * gain) ** 1.6;
  const bass = shape(avg(data, bl, bh));
  const mid = shape(avg(data, ml, mh) * 1.35);
  const high = shape(avg(data, hl, hh) * 2.2);
  return { bass, mid, high, energy: bass * 0.5 + mid * 0.3 + high * 0.2 };
}

/** Seguidor de envolvente: sube rápido (attack) y cae lento (release). Coeficientes 0..1 por cuadro. */
export const follow = (prev: number, x: number, attack = 0.5, release = 0.12) => prev + (x - prev) * (x > prev ? attack : release);

/** Detector de golpes sobre la banda grave: umbral adaptativo (media móvil) y tiempo mínimo entre golpes. */
export class BeatDetector {
  private avg = 0;
  private prev = 0;
  private lastMs = -1e9;
  private ratio: number;
  private minGapMs: number;
  private floor: number;
  constructor(ratio = 1.28, minGapMs = 190, floor = 0.12) {
    this.ratio = ratio;
    this.minGapMs = minGapMs;
    this.floor = floor;
  }
  /** Devuelve 1 si hay un golpe en esta muestra, 0 si no. */
  update(bass: number, nowMs: number): number {
    const rising = bass - this.prev > 0.035;
    const hit = bass > this.floor && bass > this.avg * this.ratio && rising && nowMs - this.lastMs >= this.minGapMs;
    this.avg += (bass - this.avg) * 0.06;
    this.prev = bass;
    if (hit) {
      this.lastMs = nowMs;
      return 1;
    }
    return 0;
  }
  reset() {
    this.avg = 0;
    this.prev = 0;
    this.lastMs = -1e9;
  }
}

/** Remuestrea el espectro a `n` valores 0..1 con escala logarítmica de frecuencia (para el anillo del visualizador). */
export function logBins(data: ArrayLike<number>, n: number, sampleRate: number, fftSize: number, fMin = 40, fMax = 14000): Float32Array {
  const out = new Float32Array(n);
  const count = data.length;
  for (let i = 0; i < n; i++) {
    const f0 = fMin * (fMax / fMin) ** (i / n);
    const f1 = fMin * (fMax / fMin) ** ((i + 1) / n);
    const [lo, hi] = binRange(f0, f1, sampleRate, fftSize, count);
    out[i] = avg(data, lo, hi);
  }
  return out;
}
