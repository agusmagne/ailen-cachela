// Genera por código los íconos de la app instalable (PWA) y la imagen de vista previa de /links/:
//   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png   (a partir de public/favicon.svg)
//   public/icons/og-links.png                                         (1200x630, tipografías y colores de tokens.css)
//   node scripts/fans-icons.mjs
// Requiere Google Chrome (o CHROME_BIN). Usa un perfil propio y temporal, así no choca con un Chrome abierto.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(chrome)) throw new Error('No se encontró Chrome. Definí CHROME_BIN.');

const site = parse(readFileSync(root + 'src/content/site.yaml', 'utf8'));
const tokens = readFileSync(root + 'src/styles/tokens.css', 'utf8');
const b64 = (p) => readFileSync(root + p).toString('base64');
const fonts = `
@font-face{font-family:'Archivo Cachela';font-weight:400 800;font-stretch:100% 125%;src:url(data:font/woff2;base64,${b64('src/assets/fonts/archivo-cachela.woff2')}) format('woff2')}
@font-face{font-family:'Martian Mono Cachela';font-weight:400 600;src:url(data:font/woff2;base64,${b64('src/assets/fonts/martian-mono-cachela.woff2')}) format('woff2')}`;
const fav = readFileSync(root + 'public/favicon.svg', 'utf8').replace(/<\?xml[^>]*>/, '');
const bg = site.site.theme_color;

const tmp = mkdtempSync(join(tmpdir(), 'fans-icons-'));
const profile = join(tmp, 'profile');
mkdirSync(root + 'public/icons', { recursive: true });

function shot(html, out, w, h) {
  const file = join(tmp, `${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--virtual-time-budget=3000', `--screenshot=${out}`, 'file://' + file], { stdio: 'ignore' });
}
const page = (body, css = '') => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${bg};overflow:hidden}${css}</style>${body}`;

try {
  for (const size of [192, 512]) {
    shot(page(fav, `svg{display:block;width:${size}px;height:${size}px}`), root + `public/icons/icon-${size}.png`, size, size);
  }
  // Maskable: el motivo ocupa el 66 % central (zona segura del círculo de recorte), el resto es fondo pleno
  shot(page(fav, 'svg{position:absolute;left:17%;top:17%;width:66%;height:66%}'), root + 'public/icons/icon-maskable-512.png', 512, 512);

  const css = `${tokens}${fonts}
  body{width:1200px;height:630px;position:relative;font-family:var(--font-body);color:var(--chrome-50);background:radial-gradient(60% 80% at 22% 40%, color-mix(in srgb, var(--chrome-300) 16%, transparent), transparent 70%), var(--bg)}
  .rings{position:absolute;left:-120px;top:-150px;width:900px;height:900px}
  .rings i{position:absolute;inset:0;border:1px solid var(--chrome-700);border-radius:50%}
  .rings i:nth-child(2){inset:12%;border-color:var(--chrome-600)} .rings i:nth-child(3){inset:26%;border-color:var(--accent);opacity:.6}
  .mark{position:absolute;left:92px;top:64px;width:132px;height:132px}.mark svg{width:100%;height:100%;display:block}
  h1{position:absolute;left:96px;bottom:140px;margin:0;font-family:var(--font-display);font-weight:800;font-stretch:125%;font-size:112px;line-height:.94;letter-spacing:-.015em;text-transform:uppercase}
  p{position:absolute;left:100px;bottom:92px;margin:0;font-family:var(--font-ui);font-weight:500;font-size:28px;letter-spacing:.08em;text-transform:uppercase;color:var(--chrome-300)}
  .edge{position:absolute;left:0;right:0;bottom:0;height:6px;background:var(--iris)}`;
  const body = `<div class="rings"><i></i><i></i><i></i></div><div class="mark">${fav.replace(/<rect[^>]*\/>/, '')}</div><h1>${site.artist.name}</h1><p>Links · ${site.artist.role.es} · ${site.artist.city}</p><div class="edge"></div>`;
  shot(page(body, css), root + 'public/icons/og-links.png', 1200, 630);
  console.log('public/icons/{icon-192,icon-512,icon-maskable-512,og-links}.png generados');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
