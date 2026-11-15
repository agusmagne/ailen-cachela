import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { countDemo } from '../src/lib/demo-core.ts';
import { loadDomain, mergeUi, type RawFiles } from '../src/lib/content-loader.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const names = (dir: string, ext: string) => (existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => f.endsWith(ext) && !f.startsWith('_')).map((f) => f.slice(0, -ext.length)) : []);

test('textos de interfaz: los archivos de src/content/ui se fusionan con site.yaml sin pisarse', () => {
  const site = parse(read('src/content/site.yaml')) as { ui: Record<string, { es: string; en: string }> };
  const files: RawFiles = Object.fromEntries(names('src/content/ui', '.yaml').map((n) => [n, read(`src/content/ui/${n}.yaml`)]));
  const merged = mergeUi(site.ui, files);
  assert.ok(Object.keys(merged).length >= Object.keys(site.ui).length);
});

test('dominios: cada src/content/<dominio>.yaml tiene su esquema puro y valida con el interruptor demo encendido y apagado', async () => {
  const domains = names('src/content', '.yaml').filter((n) => n !== 'site');
  const schemas = new Set(names('src/lib/schemas', '.ts'));
  for (const d of domains) assert.ok(schemas.has(d), `src/content/${d}.yaml no tiene src/lib/schemas/${d}.ts`);
  for (const d of schemas) {
    const mod = (await import(`../src/lib/schemas/${d}.ts`)) as { schema?: import('astro/zod').z.ZodType };
    assert.ok(mod.schema, `src/lib/schemas/${d}.ts debe exportar \`schema\``);
    const raw = existsSync(join(root, `src/content/${d}.yaml`)) ? read(`src/content/${d}.yaml`) : undefined;
    const on = loadDomain(d, raw, mod.schema, true);
    const off = loadDomain(d, raw, mod.schema, false);
    assert.equal(countDemo(off), 0, `${d}: con el interruptor apagado no puede quedar nada demo`);
    assert.ok(countDemo(on) >= countDemo(off));
    // dominio vacío (sin archivo) debe ser válido: todos los campos con valor por defecto
    loadDomain(d, undefined, mod.schema, false);
  }
});
