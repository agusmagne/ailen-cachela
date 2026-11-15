import { site } from './content';
import { demoFromEnv, filterDemo, shown } from './demo-core';

export { isDemo, countDemo, pruneDemo } from './demo-core';

/**
 * Interruptor global del contenido de ejemplo: `demo_content` en site.yaml; al construir se puede pisar con
 * DEMO_CONTENT=0 (apaga) o DEMO_CONTENT=1 (enciende). Con el interruptor apagado los ítems `demo: true`
 * no existen para el sitio (ver demo-core.ts).
 */
export const demoOn: boolean = demoFromEnv(process.env.DEMO_CONTENT) ?? site.demo_content;

/** Saca los ítems de ejemplo si el interruptor está apagado (el cargador ya lo hace en los arreglos de cada dominio). */
export const live = <T>(items: readonly T[]): T[] => filterDemo(items, demoOn);
/** Objeto suelto de ejemplo: null si está apagado. */
export const visibleOrNull = <T>(item: T): T | null => shown(item, demoOn);
