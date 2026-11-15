// Genera public/og.png (1200x630) y public/apple-touch-icon.png (180x180) con código propio:
// el mismo shader y las mismas variables de tokens.css del sitio, capturados con Chrome headless.
//   node scripts/make-og.mjs
// Requiere Google Chrome (o define CHROME_BIN) y los datos de src/content/site.yaml.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const tmp = root + 'scripts/.tmp/';
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) throw new Error('No se encontró Chrome. Definí CHROME_BIN.');

const site = parse(readFileSync(root + 'src/content/site.yaml', 'utf8'));
mkdirSync(tmp, { recursive: true });

// 1) bundle del entry (rolldown viene con Vite)
execFileSync(root + 'node_modules/.bin/rolldown', [root + 'scripts/og/entry.ts', '-o', tmp + 'entry.js', '--format', 'iife'], { stdio: 'inherit' });

const b64 = (p) => readFileSync(root + p).toString('base64');
const tokens = readFileSync(root + 'src/styles/tokens.css', 'utf8');
const fonts = `
@font-face{font-family:'Archivo Cachela';font-weight:400 800;font-stretch:100% 125%;src:url(data:font/woff2;base64,${b64('src/assets/fonts/archivo-cachela.woff2')}) format('woff2')}
@font-face{font-family:'Martian Mono Cachela';font-weight:400 600;src:url(data:font/woff2;base64,${b64('src/assets/fonts/martian-mono-cachela.woff2')}) format('woff2')}`;
const page = (body, extra = '') => `<!doctype html><meta charset="utf-8"><style>${tokens}${fonts}html,body{margin:0;background:#000;overflow:hidden}${extra}</style>${body}<script>${readFileSync(tmp + 'entry.js', 'utf8')}</script>`;

writeFileSync(tmp + 'og.html', page(`<body data-name="${site.artist.name}" data-city="${site.artist.city}"><canvas id="c"></canvas></body>`));

const shot = (html, out, w, h) =>
  execFileSync(chrome, [
    '--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${w},${h}`, '--virtual-time-budget=6000', `--screenshot=${out}`, 'file://' + html,
  ], { stdio: 'ignore' });

shot(tmp + 'og.html', root + 'public/og.png', 1200, 630);

// apple-touch-icon: el favicon vectorial sobre fondo pleno
const fav = readFileSync(root + 'public/favicon.svg', 'utf8').replace(/<\?xml[^>]*>/, '');
writeFileSync(tmp + 'icon.html', `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#050506}svg{display:block;width:180px;height:180px}</style>${fav}`);
shot(tmp + 'icon.html', root + 'public/apple-touch-icon.png', 180, 180);

rmSync(tmp, { recursive: true, force: true });
console.log('public/og.png y public/apple-touch-icon.png generados');
