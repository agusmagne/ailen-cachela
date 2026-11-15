/**
 * Mapeo de perillas (0..100) a magnitudes de audio, y notas. PURO.
 * Todo el Lab usa estas funciones: el motor en vivo y el render offline suenan igual.
 */

export const ROOT_MIDI = 33; // La1 (55 Hz): tónica del bajo con tonalidad 0
const NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const keyName = (k: number) => NAMES[((k % 12) + 12) % 12];
/** Nombre con octava de una nota MIDI: "A2". */
export function midiName(m: number): string {
  const pc = ((m % 12) + 12) % 12; // 0 = C
  const n = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc];
  return `${n}${Math.floor(m / 12) - 1}`;
}

/** Tónica del bajo para una tonalidad. */
export const bassMidi = (key: number) => ROOT_MIDI + key;
/** Nota MIDI de un paso del acid (1..25). Arranca una octava sobre el bajo. */
export const acidMidi = (note: number, key: number) => ROOT_MIDI + key + 12 + (note - 1);

const k01 = (v: number) => Math.min(1, Math.max(0, v / 100));

/** Corte base del filtro: 90 Hz a ~3,6 kHz (exponencial). */
export const cutoffHz = (v: number) => 90 * 2 ** (k01(v) * 5.3);
/** Resonancia en dB (el Q de un lowpass Web Audio está en dB): de casi plano a muy ácido. */
export const resonanceDb = (v: number) => 0.5 + k01(v) * 21.5;
/** Octavas que la envolvente abre el filtro sobre el corte base. */
export const envOctaves = (v: number) => k01(v) * 5;
/** Decay de la envolvente del filtro en segundos: 90 ms a ~950 ms (exponencial). */
export const decaySeconds = (v: number) => 0.09 * 10.5 ** k01(v);
/** Ganancia previa del saturador: 1 a 10. */
export const driveGain = (v: number) => 1 + k01(v) * 9;

/** Pico de la envolvente del filtro, acotado para que nunca pase de 12 kHz. */
export const envPeakHz = (base: number, octaves: number, accent: boolean) => Math.min(12000, base * 2 ** (octaves * (accent ? 1.3 : 1)));

/** Curva de saturación tanh normalizada: una tabla para WaveShaperNode. */
export function driveCurve(k: number, n = 1024) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

/** Limitador de salida: lineal hasta 0,7 y curva suave hacia 1 (nunca lo pasa). */
export function softClipCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = a <= 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return c;
}

/** Volumen de la interfaz (0..100) a ganancia: curva cuadrática, 0 = silencio; el 100 % empuja un poco el limitador. */
export const volumeGain = (v: number) => (Math.min(100, Math.max(0, v)) / 100) ** 2 * 1.2;

/** Acorde de stab / pad en semitonos sobre la tónica (menor con séptima y novena). */
export const STAB_CHORD = [0, 3, 7, 10] as const;
export const PAD_CHORD = [0, 7, 10, 14] as const;
