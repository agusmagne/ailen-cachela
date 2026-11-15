/**
 * Contenido de ejemplo ("demo"): lógica pura, sin Astro ni Vite (se prueba con node:test).
 *
 * Regla del proyecto: todo dato inventado vive en un archivo de datos con `demo: true`, se rotula
 * en pantalla y desaparece con UN interruptor (`demo_content` en site.yaml, o DEMO_CONTENT=0 al
 * construir). Dónde se aplica el interruptor:
 *   - Los ARREGLOS de los archivos de datos: el cargador (data.ts) descarta solo todo elemento
 *     objeto con `demo: true` cuando el interruptor está apagado. Un paquete no puede olvidarse.
 *   - Los OBJETOS sueltos con `demo: true` (por ejemplo una bio de ejemplo) se conservan: el
 *     componente decide con `shown(obj)` (devuelve null si está apagado).
 */

export interface Demoable {
  demo?: boolean;
}

/** ¿El ítem es de ejemplo? (independiente del interruptor global). */
export const isDemo = (item: unknown): boolean =>
  typeof item === 'object' && item !== null && (item as Demoable).demo === true;

/** Filtra los ítems de ejemplo cuando el interruptor está apagado. */
export function filterDemo<T>(items: readonly T[], demoOn: boolean): T[] {
  return demoOn ? [...items] : items.filter((x) => !isDemo(x));
}

/** Para objetos sueltos: null si es de ejemplo y el interruptor está apagado. */
export function shown<T>(item: T, demoOn: boolean): T | null {
  return !demoOn && isDemo(item) ? null : item;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Recorre un dato ya validado y saca los elementos de ejemplo de TODOS los arreglos, a cualquier
 * profundidad. No toca objetos sueltos (ver `shown`). Si el interruptor está encendido, devuelve el
 * mismo valor.
 */
export function pruneDemo<T>(value: T, demoOn: boolean): T {
  if (demoOn) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.filter((x) => !isDemo(x)).map(walk);
    if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Cuenta los ítems de ejemplo de un dato (a cualquier profundidad). Útil para tests y avisos. */
export function countDemo(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, x) => n + (isDemo(x) ? 1 : 0) + countDemo(x), 0);
  if (isPlain(value)) return Object.values(value).reduce<number>((n, x) => n + countDemo(x), 0);
  return 0;
}

/** Interpreta DEMO_CONTENT del entorno: "0|false|off|no" apaga, "1|true|on|yes" enciende, otro valor = null. */
export function demoFromEnv(raw: string | undefined): boolean | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  return null;
}
