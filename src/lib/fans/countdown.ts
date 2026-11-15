/** Cuenta regresiva (pura, sin DOM): se prueba con node:test y la usa el módulo de cliente fans-countdown. */
export interface CountdownParts {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milisegundos que faltan (0 si ya pasó). */
  remaining: number;
}

export function countdownParts(targetMs: number, nowMs: number): CountdownParts {
  const remaining = Math.max(0, Math.floor(targetMs - nowMs));
  if (remaining <= 0 || Number.isNaN(remaining)) return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0, remaining: 0 };
  const totalSeconds = Math.floor(remaining / 1000);
  return {
    done: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    remaining,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
/** Los días no se rellenan hasta 3 cifras salvo que haga falta (09, 10, 100). */
export const padDays = (n: number) => (n >= 100 ? String(n) : pad2(n));
