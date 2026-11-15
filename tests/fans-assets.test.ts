import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MANIFEST_ICONS } from '../src/lib/fans/manifest.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(root + p, 'utf8');

/** PNG: firma y tamaño real (ancho y alto en el IHDR). */
function pngSize(p: string) {
  const b = readFileSync(root + p);
  assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${p} no es un PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

test('íconos del manifest: existen y miden lo que declaran; vista previa de /links/ de 1200x630', () => {
  for (const i of MANIFEST_ICONS) {
    assert.ok(existsSync(`${root}public/${i.file}`), `falta public/${i.file}`);
    assert.equal(pngSize(`public/${i.file}`), i.sizes);
  }
  assert.equal(pngSize('public/icons/og-links.png'), '1200x630');
});

/* ---- Service worker: se evalúa en un contexto simulado y se prueba qué pedidos intercepta ------------------------- */
function loadSw(scope = 'https://example.test/ailen/') {
  const listeners: Record<string, (e: any) => void> = {};
  const self: any = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    addEventListener: (type: string, fn: (e: any) => void) => (listeners[type] = fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const cache = { match: async () => undefined, put: async () => undefined, keys: async () => [], delete: async () => true, addAll: async () => undefined };
  const ctx: any = { self, URL, Response, Promise, setTimeout, caches: { match: async () => undefined, open: async () => cache, keys: async () => [], delete: async () => true }, fetch: async () => new Response('ok') };
  vm.runInNewContext(read('public/sw.js'), ctx);
  return { listeners, scope };
}
function fetchEvent(url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) {
  const headers = new Map(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  let responded = false;
  return {
    request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'no-cors', headers: { has: (k: string) => headers.has(k), get: (k: string) => headers.get(k) ?? null } },
    respondWith: () => (responded = true),
    get responded() {
      return responded;
    },
  };
}

test('sw.js: registra install, activate y fetch, y el alcance sale de su ubicación (BASE_PATH)', () => {
  const { listeners } = loadSw();
  assert.ok(listeners.install && listeners.activate && listeners.fetch);
  assert.match(read('public/sw.js'), /self\.registration\.scope/);
});

test('sw.js: no intercepta audio, video, descargas, Range, no-GET ni otros orígenes', () => {
  const { listeners, scope } = loadSw();
  for (const u of ['mix.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'v.mp4', 'v.webm', 'kit.zip', 'epk.pdf', 'fechas/calendario.ics', 'mixes/feed.xml', 'downloads/press/x.vcf']) {
    const e = fetchEvent(scope + u);
    listeners.fetch(e);
    assert.equal(e.responded, false, u);
  }
  const range = fetchEvent(scope + '_astro/a.js', { headers: { Range: 'bytes=0-1' } });
  listeners.fetch(range);
  assert.equal(range.responded, false, 'Range');
  const post = fetchEvent(scope + 'prensa/', { method: 'POST' });
  listeners.fetch(post);
  assert.equal(post.responded, false, 'POST');
  for (const u of ['https://w.soundcloud.com/player/?url=x', 'https://www.youtube-nocookie.com/embed/abc', 'https://example.test/otra-ruta/']) {
    const e = fetchEvent(u, { mode: 'navigate' });
    listeners.fetch(e);
    assert.equal(e.responded, false, u);
  }
});

test('sw.js: sí maneja páginas y archivos con huella del propio sitio', () => {
  const { listeners, scope } = loadSw();
  for (const [u, mode] of [[scope, 'navigate'], [scope + 'fechas/', 'navigate'], [scope + '_astro/index.abc123.js', 'no-cors'], [scope + 'favicon.svg', 'no-cors']] as const) {
    const e = fetchEvent(u, { mode });
    listeners.fetch(e);
    assert.equal(e.responded, true, u);
  }
});

test('sw.js: las páginas van red primero sin pasar por la caché HTTP (nada de contenido viejo pegado)', () => {
  const src = read('public/sw.js');
  assert.match(src, /cache:\s*'no-cache'/);
  assert.match(src, /networkFirst/);
  assert.ok(!/skipWaiting\(\);\s*\n\s*return/.test(src));
});

test('offline.htm: autónoma (sin recursos externos) y con la marca del alcance para el botón de inicio', () => {
  const html = read('public/offline.htm');
  assert.ok(!/(src|href)="https?:/.test(html), 'recurso externo');
  assert.ok(html.includes('{{SCOPE}}'));
  assert.match(html, /<title>[^<]+<\/title>/);
});
