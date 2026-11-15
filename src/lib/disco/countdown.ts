/**
 * Cuenta regresiva a un lanzamiento. Puro (sin DOM). La hora de salida es 00:00 de Buenos Aires (UTC-3, sin horario de verano).
 */
export const RELEASE_TZ = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MS = 3 * 3600_000;

/** Instante (ms UTC) en que empieza el día `iso` (YYYY-MM-DD) en Buenos Aires. */
export function releaseInstant(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Fecha inválida: ${iso}`);
  return t + AR_OFFSET_MS;
}

export interface Remaining {
  /** true si el instante ya pasó. */
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function remaining(targetMs: number, nowMs: number): Remaining {
  const diff = targetMs - nowMs;
  if (diff <= 0) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const s = Math.floor(diff / 1000);
  return { done: false, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}
