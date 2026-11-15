// Verificador de un build ya generado (para que cada paquete compruebe lo suyo sin navegador).
//
//   CI=1 npx astro build --outDir "$TMP"            && node scripts/verify-build.mjs "$TMP"
//   CI=1 DEMO_CONTENT=0 npx astro build --outDir "$T2" && node scripts/verify-build.mjs "$T2" --demo-off
//   opciones: --base /prefijo (si se construyó con BASE_PATH)   --only prensa  (solo las páginas bajo esa carpeta)
//
// Revisa cada .html: title, description, canonical absoluta, un solo h1, lang acorde a la ruta, hreflang es/en/x-default
// en páginas con alternativa, imágenes con alt, JSON-LD que parsee, ningún recurso de terceros cargado al abrir la
// página (scripts, estilos, iframes, imágenes), enlaces internos que existan en el build y, con --demo-off, ningún
// rastro de contenido de ejemplo. Sale con código 1 si algo falla.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const outDir = resolve(args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--base' && args[args.indexOf(a) - 1] !== '--only') ?? '');
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const base = (opt('base') ?? '').replace(/\/+$/, '');
const only = opt('only');
const demoOff = args.includes('--demo-off');
if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
  console.error('Uso: node scripts/verify-build.mjs <carpeta-del-build> [--demo-off] [--base /prefijo] [--only carpeta]');
  process.exit(2);
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const all = walk(outDir);
const htmlFiles = all.filter((f) => f.endsWith('.html')).filter((f) => !only || relative(outDir, f).split(sep).join('/').startsWith(only.replace(/^\/|\/$/g, '')));
const exists = (p) => existsSync(join(outDir, p)) || existsSync(join(outDir, p, 'index.html'));

const problems = [];
const bad = (file, msg) => problems.push(`${relative(outDir, file).split(sep).join('/')}: ${msg}`);
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

for (const file of htmlFiles) {
  const rel = relative(outDir, file).split(sep).join('/');
  const html = readFileSync(file, 'utf8');
  const is404 = rel === '404.html';
  const head = html.slice(0, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('</head>'));
  const isPrint = /<main[^>]*data-print/.test(html);

  if (!/<title>[^<]+<\/title>/.test(head)) bad(file, 'falta <title>');
  if (!is404 && !isPrint && !/<meta name="description" content="[^"]+"/.test(head)) bad(file, 'falta meta description');
  if (!is404 && !isPrint && !/<link rel="canonical" href="https?:\/\/[^"]+"/.test(head)) bad(file, 'falta canonical absoluta');
  const lang = attr(html.match(/<html[^>]*>/)?.[0] ?? '', 'lang');
  const expected = rel.startsWith('en/') ? 'en' : 'es';
  if (!is404 && !rel.startsWith('kit/') && lang !== expected) bad(file, `<html lang="${lang}"> pero la ruta es ${expected}`);
  const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
  if (!is404 && h1 !== 1) bad(file, `tiene ${h1} <h1> (debe ser 1)`);

  const hrefs = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)"/g)].map((m) => m[1]);
  if (hrefs.length && !(hrefs.includes('es') && hrefs.includes('en') && hrefs.includes('x-default'))) bad(file, 'hreflang incompleto (es, en, x-default)');

  for (const img of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt=/.test(img[0])) bad(file, 'imagen sin alt: ' + img[0].slice(0, 80));
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      bad(file, 'JSON-LD inválido');
    }
  }

  // Terceros al abrir la página: nada de scripts/estilos/imágenes/iframes externos (los links <a> sí pueden ser externos)
  for (const m of html.matchAll(/<(script|iframe|img|source|video|audio|embed|object)\b[^>]*\s(?:src|data)="(https?:\/\/[^"]+)"/g)) bad(file, `<${m[1]}> carga un recurso externo: ${m[2]}`);
  for (const m of html.matchAll(/<link\b[^>]*\srel="(?:stylesheet|preload|modulepreload|prefetch)"[^>]*\shref="(https?:\/\/[^"]+)"/g)) bad(file, `<link> carga un recurso externo: ${m[1]}`);
  if (/<style[^>]*>[^<]*@import\s+url\(\s*['"]?https?:/.test(html)) bad(file, '@import de un recurso externo');

  // Enlaces internos
  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    let h = m[1];
    if (/^(https?:|mailto:|tel:|webcal:|sms:|javascript:|data:|#)/.test(h)) continue;
    h = h.split('#')[0].split('?')[0];
    if (!h) continue;
    if (!h.startsWith('/')) continue; // relativos: no usamos
    if (base && h.startsWith(base + '/')) h = h.slice(base.length);
    else if (base && h !== base) {
      bad(file, `enlace interno sin el prefijo ${base}: ${m[1]}`);
      continue;
    }
    if (!exists(decodeURIComponent(h).replace(/^\//, ''))) bad(file, `enlace interno roto: ${m[1]}`);
  }

  // Marcas reales: atributos y clases en elementos. El texto suelto dentro de <style> o <script> (p. ej. el selector
  // .sheet__demo-banner en el CSS inline de las vistas de impresión) no cuenta.
  const markup = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  if (demoOff && /<[a-z][^>]*(?:\sdata-demo-badge|\sdata-demo-notice|\sclass="[^"]*\b(?:is-demo|sheet__demo-banner)\b)/i.test(markup)) bad(file, 'quedan marcas de contenido de ejemplo con el interruptor apagado');
}

if (!htmlFiles.length) problems.push('no se encontró ninguna página .html' + (only ? ` bajo "${only}"` : ''));
console.log(`[verify] ${htmlFiles.length} páginas revisadas${demoOff ? ' (modo demo apagado)' : ''}.`);
if (problems.length) {
  console.error(problems.map((p) => '  ✖ ' + p).join('\n'));
  console.error(`[verify] ${problems.length} problema(s).`);
  process.exit(1);
}
console.log('[verify] sin problemas.');
