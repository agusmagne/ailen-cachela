/**
 * Registro de rutas conectado al proyecto real: lee src/pages (para saber qué páginas existen) y los
 * dominios de datos (para saber cuáles tienen contenido). La definición vive en routes-core.ts.
 */
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BASE } from './content';
import { hasContent } from './data';
import { ENDPOINTS, ROUTES, createRouter, pagePatterns } from './routes-core';

export * from './routes-core';

const PAGES_DIR = join(process.cwd(), 'src', 'pages');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(PAGES_DIR, join(dir, e.name)).split(sep).join('/')],
  );
}

let memo: { at: number; set: ReadonlySet<string> } | null = null;
/** En build se lee una sola vez; en desarrollo se vuelve a leer cada 1,5 s (así una página nueva aparece sin reiniciar). */
const pages = () => {
  if (!memo || (import.meta.env.DEV && Date.now() - memo.at > 1500)) memo = { at: Date.now(), set: pagePatterns(walk(PAGES_DIR)) };
  return memo.set;
};

export const router = createRouter(ROUTES, ENDPOINTS, { pages, hasContent, base: BASE });
