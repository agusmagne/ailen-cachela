// Genera los PDF del sitio (EPK, riders, one-sheet) con Chrome headless a partir de páginas de impresión reales.
//
//   npm run downloads                 # todos los trabajos de scripts/pdf/*.mjs
//   npm run downloads -- --only epk   # un trabajo por nombre
//   npm run downloads -- --if-chrome  # si no hay Chrome, avisa y sale sin error (para CI opcional)
//
// Cada paquete declara sus PDF en su propio archivo scripts/pdf/<paquete>.mjs:
//   export const jobs = [{ name: 'epk-es', route: '/prensa/imprimir/', out: 'public/downloads/ailen-cachela-epk-es.pdf' }];
// `route` es una ruta del sitio SIN BASE_PATH (la vista de impresión usa PrintLayout.astro). Los PDF resultantes se
// versionan en git (public/downloads/): el workflow de GitHub Actions NO necesita Chrome. Regenerar solo cuando
// cambie el contenido, y con el interruptor de contenido de ejemplo en el estado que se va a publicar.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

async function loadJobs() {
  const dir = join(root, 'scripts', 'pdf');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const jobs = [];
  for (const f of files) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    for (const j of mod.jobs ?? []) jobs.push({ ...j, from: f });
  }
  for (const j of jobs) {
    if (!j.name || !j.route?.startsWith('/') || !j.out) throw new Error(`scripts/pdf/${j.from}: cada trabajo necesita name, route ("/...") y out`);
  }
  return jobs;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = join(dir, decodeURIComponent(url.pathname));
    if (!p.startsWith(dir)) return res.writeHead(403).end();
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p)) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

function run(cmd, cmdArgs, timeoutMs) {
  return new Promise((ok) => {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('exit', (c) => {
      clearTimeout(timer);
      ok(c);
    });
    child.on('error', () => ok(-1));
  });
}

const jobs = (await loadJobs()).filter((j) => !only || j.name === only);
if (!jobs.length) {
  console.log(only ? `No hay un trabajo "${only}" en scripts/pdf/.` : 'No hay trabajos de PDF (scripts/pdf/*.mjs). Nada para hacer.');
  process.exit(only ? 1 : 0);
}
const chrome = findChrome();
if (!chrome) {
  const msg = 'No se encontró Chrome/Chromium. Instalalo o definí CHROME_BIN.';
  if (flag('if-chrome')) {
    console.warn(`[pdf] ${msg} Se omite (--if-chrome).`);
    process.exit(0);
  }
  console.error(`[pdf] ${msg}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'ailen-pdf-'));
try {
  console.log(`[pdf] contenido de ejemplo: ${process.env.DEMO_CONTENT ?? '(el de site.yaml)'}`);
  console.log('[pdf] construyendo el sitio en una carpeta temporal…');
  execFileSync('npx', ['astro', 'build', '--outDir', tmp], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    // CI=1 y SHOWS_CALENDAR_URL=off: no toca la copia de fechas ni la red; BASE_PATH=/: rutas simples para el servidor local
    env: { ...process.env, CI: '1', SHOWS_CALENDAR_URL: 'off', BASE_PATH: '/', KIT: '' },
  });
  const { server, port } = await serve(tmp);
  try {
    for (const j of jobs) {
      const out = resolve(root, j.out);
      mkdirSync(dirname(out), { recursive: true });
      // Asíncrono a propósito: el servidor local vive en este mismo proceso y tiene que seguir respondiendo mientras Chrome pide la página
      const code = await run(
        chrome,
        [
          '--headless=new',
          '--no-sandbox',
          '--disable-gpu',
          '--hide-scrollbars',
          '--no-pdf-header-footer',
          // Perfil propio: sin esto, si ya hay un Chrome abierto el comando se le entrega a ese Chrome y nunca termina
          `--user-data-dir=${join(tmp, 'chrome-profile')}`,
          '--virtual-time-budget=6000',
          `--print-to-pdf=${out}`,
          `http://127.0.0.1:${port}${j.route}`,
        ],
        90_000,
      );
      if (code !== 0 || !existsSync(out)) throw new Error(`Chrome no pudo generar ${j.name} (${j.route})`);
      console.log(`[pdf] ${j.name}: ${j.out} (${Math.round(statSync(out).size / 1024)} KB)`);
    }
  } finally {
    server.close();
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
