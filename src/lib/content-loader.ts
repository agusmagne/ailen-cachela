/**
 * Cargador de contenido por dominios: puro (sin Vite), así se prueba con node:test.
 * data.ts le pasa los textos de los .yaml (import.meta.glob) y routes.ts consulta si un dominio tiene algo.
 *
 * Convenciones (las verifica este archivo y tests/content.test.ts):
 *  - src/content/<dominio>.yaml + src/lib/schemas/<dominio>.ts: un paquete, un dominio, sin pisarse.
 *  - El arreglo principal de cada dominio se llama `items` (el registro de rutas lo usa para ocultar páginas vacías).
 *  - src/content/ui/<paquete>.yaml: textos de interfaz es/en. Cada clave empieza con "<paquete>_".
 */
import { parse } from 'yaml';
import { z } from 'astro/zod';
import { pruneDemo } from './demo-core.ts';

export type RawFiles = Record<string, string>;
export interface Loc {
  es: string;
  en: string;
}
export type UiMap = Record<string, Loc>;

const uiFileSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/, 'clave en minúsculas con guiones bajos'),
  z.object({ es: z.string(), en: z.string() }).strict(),
);

/** Fusiona src/content/ui/*.yaml sobre los textos de site.yaml. Una clave repetida o sin su prefijo frena el build. */
export function mergeUi(base: UiMap, files: RawFiles): UiMap {
  const out: UiMap = { ...base };
  const owner = new Map<string, string>(Object.keys(base).map((k) => [k, 'site.yaml']));
  for (const name of Object.keys(files).sort()) {
    const parsed = uiFileSchema.safeParse(parse(files[name]) ?? {});
    if (!parsed.success) throw new Error(`src/content/ui/${name}.yaml inválido:\n${z.prettifyError(parsed.error)}`);
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!key.startsWith(`${name}_`)) {
        throw new Error(`src/content/ui/${name}.yaml: la clave "${key}" debe empezar con "${name}_" (así dos paquetes no se pisan).`);
      }
      if (owner.has(key)) {
        throw new Error(`src/content/ui/${name}.yaml: la clave "${key}" ya existe en ${owner.get(key)}.`);
      }
      owner.set(key, `ui/${name}.yaml`);
      out[key] = value;
    }
  }
  return out;
}

/**
 * Lee y valida un dominio. Se valida SIEMPRE el dato completo (con ítems de ejemplo), con el interruptor
 * encendido o apagado: un error en un dato de ejemplo se ve igual en las dos versiones del sitio.
 * Recién después se descartan los elementos `demo: true` si el interruptor está apagado.
 * Archivo ausente = se valida `{}` (el esquema debe tener valores por defecto: dominio vacío).
 */
export function loadDomain<S extends z.ZodType>(name: string, raw: string | undefined, schema: S, demoOn: boolean): z.output<S> {
  const source = raw === undefined ? {} : (parse(raw) ?? {});
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`src/content/${name}.yaml inválido:\n${z.prettifyError(parsed.error)}`);
  }
  return pruneDemo(parsed.data as z.output<S>, demoOn);
}

/** ¿El dominio tiene contenido visible? (alguna de las claves es un arreglo no vacío, un texto o un objeto). Sin esquema: lee el YAML crudo. */
export function domainHasContent(raw: string | undefined, keys: readonly string[], demoOn: boolean): boolean {
  if (raw === undefined) return false;
  const data = pruneDemo(parse(raw) ?? {}, demoOn) as Record<string, unknown>;
  return keys.some((k) => {
    const v = data[k];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.keys(v).length > 0;
    return typeof v === 'string' ? v !== '' : Boolean(v);
  });
}
