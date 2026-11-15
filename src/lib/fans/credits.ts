/**
 * Datos de créditos leídos de node_modules en build (versión y licencia reales de cada paquete). Si un paquete no se
 * puede leer (otra instalación), devuelve un guion: nunca se inventa un dato.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PackageInfo {
  name: string;
  version: string;
  license: string;
  homepage: string;
}

export function packageInfo(name: string, root = process.cwd()): PackageInfo {
  try {
    const j = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')) as { version?: string; license?: string; homepage?: string };
    return { name, version: j.version ?? '—', license: j.license ?? '—', homepage: j.homepage ?? '' };
  } catch {
    return { name, version: '—', license: '—', homepage: '' };
  }
}

export const TECH = [
  { pkg: 'astro', role: 'astro' },
  { pkg: '@astrojs/sitemap', role: 'sitemap' },
  { pkg: '@astrojs/check', role: 'check' },
  { pkg: 'typescript', role: 'typescript' },
  { pkg: 'yaml', role: 'yaml' },
  { pkg: 'subset-font', role: 'subset' },
] as const;

/** Tipografías del sitio (los archivos .woff2 propios salen de estos paquetes; licencias en src/assets/fonts/). */
export const FONTS = [
  { id: 'archivo', family: 'Archivo', role: 'display', pkg: '@fontsource-variable/archivo', authors: 'The Archivo Project Authors', source: 'https://github.com/Omnibus-Type/Archivo', license: 'SIL Open Font License 1.1' },
  { id: 'martian', family: 'Martian Mono', role: 'mono', pkg: '@fontsource-variable/martian-mono', authors: 'The Martian Mono Project Authors', source: 'https://github.com/evilmartians/mono', license: 'SIL Open Font License 1.1' },
] as const;
export const OFL_URL = 'https://openfontlicense.org/open-font-license-official-text/';
