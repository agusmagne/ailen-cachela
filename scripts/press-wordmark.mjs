// Genera el wordmark "AILÉN CACHELA" en PNG transparente (negro y blanco) con Chrome headless, usando la misma tipografía
// del sitio (Archivo expandida, peso 800) y los colores de src/styles/tokens.css. Los PNG se versionan en public/downloads/press/.
//
//   node scripts/press-wordmark.mjs            # genera los dos PNG
//   node scripts/press-wordmark.mjs --if-chrome # si no hay Chrome, avisa y sale sin error
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTokens } from '../src/lib/press/tokens.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const optional = process.argv.includes('--if-chrome');

function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return candidates.find((c) => existsSync(c)) ?? null;
}
const chrome = findChrome();
if (!chrome) {
  console.warn('[wordmark] No se encontró Chrome/Chromium (definí CHROME_BIN).');
  process.exit(optional ? 0 : 1);
}

const tokens = parseTokens(readFileSync(join(root, 'src/styles/tokens.css'), 'utf8'));
const font = pathToFileURL(join(root, 'src/assets/fonts/archivo-cachela.woff2')).href;
const tmp = mkdtempSync(join(tmpdir(), 'ailen-wordmark-'));
const outDir = join(root, 'public/downloads/press');
mkdirSync(outDir, { recursive: true });
const FS = 160;
const PAD = 24;

const page = (ink, probe) => `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'W';src:url('${font}') format('woff2');font-weight:400 800;font-stretch:100% 125%}
html,body{margin:0;background:transparent}
#w{display:inline-block;white-space:nowrap;padding:${PAD}px;font-family:'W';font-weight:800;font-stretch:125%;font-size:${FS}px;line-height:1;letter-spacing:-0.015em;text-transform:uppercase;color:${ink}}
</style><div id="w">Ailén Cachela</div>
${probe ? `<script>document.fonts.ready.then(()=>{const r=document.getElementById('w').getBoundingClientRect();document.title=Math.ceil(r.width)+'x'+Math.ceil(r.height)})</script>` : ''}`;

const run = (args) => spawnSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${join(tmp, 'profile')}`, ...args], { encoding: 'utf8', timeout: 60_000 });

try {
  const probeFile = join(tmp, 'probe.html');
  writeFileSync(probeFile, page('#000', true));
  const dom = run(['--virtual-time-budget=4000', '--dump-dom', pathToFileURL(probeFile).href]).stdout ?? '';
  const m = dom.match(/<title>(\d+)x(\d+)<\/title>/);
  if (!m) throw new Error('No se pudo medir el wordmark');
  const [w, h] = [Number(m[1]), Number(m[2])];
  for (const [name, ink] of [['negro', tokens.void], ['blanco', tokens['chrome-50']]]) {
    const file = join(tmp, `${name}.html`);
    writeFileSync(file, page(ink, false));
    const out = join(outDir, `ailen-cachela-wordmark-${name}.png`);
    run(['--virtual-time-budget=4000', '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${out}`, pathToFileURL(file).href]);
    if (!existsSync(out) || statSync(out).size < 500) throw new Error(`Chrome no generó ${out}`);
    console.log(`[wordmark] ${name}: ${w}x${h}px (${Math.round(statSync(out).size / 1024)} KB)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
