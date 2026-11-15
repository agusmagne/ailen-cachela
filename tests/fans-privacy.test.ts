import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Revisión cruzada: lo que dice /privacidad/ ("sin cookies ni rastreadores") tiene que ser cierto en el código.
 * Si alguien agrega una cookie, un rastreador o un servicio externo al cliente, este test frena y obliga a actualizar
 * la política antes de publicar.
 */
const root = fileURLToPath(new URL('../', import.meta.url));
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const sources = [...walk(root + 'src'), ...walk(root + 'public')].filter((f) => /\.(astro|ts|js|html|htm|css|mjs)$/.test(f));
const rel = (f: string) => relative(root, f);
const hits = (re: RegExp) => sources.filter((f) => re.test(readFileSync(f, 'utf8'))).map(rel);

test('privacidad: el sitio no escribe cookies', () => {
  assert.deepEqual(hits(/document\.cookie|Set-Cookie|cookieStore/i), []);
});

test('privacidad: sin analítica, píxeles ni balizas', () => {
  const trackers = /google-analytics|googletagmanager|gtag\(|\bfbq\(|facebook\.net|connect\.facebook|doubleclick|plausible\.io|goatcounter|clarity\.ms|hotjar|segment\.(io|com)|matomo|umami|sendBeacon|mixpanel|fullstory|amplitude\.com/i;
  assert.deepEqual(hits(trackers), []);
});

test('privacidad: no se cargan tipografías ni scripts de terceros (solo los reproductores, tras un clic)', () => {
  assert.deepEqual(hits(/fonts\.googleapis|fonts\.gstatic|cdnjs|unpkg\.com|cdn\.jsdelivr|<script[^>]+src="https?:/i), []);
});

test('privacidad: lo único que el paquete fans escribe en el almacenamiento del navegador es la marca fans-sw', () => {
  const fans = sources.filter((f) => /fans/.test(rel(f)));
  const using = fans.filter((f) => /localStorage|sessionStorage|indexedDB/.test(readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(using, ['src/scripts/fans/sw-control.ts']);
  const keys = [...readFileSync(root + 'src/scripts/fans/sw-control.ts', 'utf8').matchAll(/Item\(\s*(FLAG_KEY|'[^']+')/g)].map((m) => m[1]);
  assert.ok(keys.every((k) => k === 'FLAG_KEY'));
  assert.match(readFileSync(root + 'src/scripts/fans/sw-control.ts', 'utf8'), /FLAG_KEY = 'fans-sw'/);
});

test('privacidad: el texto de la política menciona lo que el código hace (service worker, marca local, terceros con un clic)', () => {
  const txt = readFileSync(root + 'src/content/legal.yaml', 'utf8');
  for (const needle of ['fans-sw', 'w.soundcloud.com', 'youtube-nocookie.com', 'No se instala ninguna cookie', 'service worker']) assert.ok(txt.includes(needle), needle);
});
