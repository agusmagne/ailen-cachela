/**
 * Acceso a los dominios de contenido (src/content/<dominio>.yaml) validados con Zod.
 *
 * Un paquete crea DOS archivos propios y no toca nada compartido:
 *   src/lib/schemas/<dominio>.ts   -> esquema PURO: `export const schema = z.object({ items: items(item({...})) })`
 *                                     (sin imports de Astro/Vite: tests/content.test.ts lo importa con node)
 *   src/content/<dominio>.yaml     -> los datos (ítems inventados con `demo: true`)
 * y en las páginas:
 *   import { domain } from '../lib/data';  import { schema } from '../lib/schemas/press';
 *   const press = domain('press', schema);   // ya viene SIN ítems de ejemplo si el interruptor global está apagado
 */
import type { z } from 'astro/zod';
import { loadDomain, domainHasContent, type RawFiles } from './content-loader';
import { demoOn } from './demo';

const modules = import.meta.glob('../content/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Textos crudos por dominio ("press" -> contenido de press.yaml). site.yaml tiene su propio cargador. */
export const domainFiles: RawFiles = Object.fromEntries(
  Object.entries(modules)
    .map(([path, raw]) => [path.replace(/^.*\//, '').replace(/\.yaml$/, ''), raw] as const)
    .filter(([name]) => name !== 'site'),
);

const memo = new Map<string, unknown>();

/** Datos validados del dominio `name` (memoizado por build; la primera llamada fija el esquema). */
export function domain<S extends z.ZodType>(name: string, schema: S): z.output<S> {
  if (!memo.has(name)) memo.set(name, loadDomain(name, domainFiles[name], schema, demoOn));
  return memo.get(name) as z.output<S>;
}

/** ¿El dominio tiene contenido visible (con el interruptor actual)? Lo usa el registro de rutas. */
export const hasContent = (name: string, keys: readonly string[]) => domainHasContent(domainFiles[name], keys, demoOn);
