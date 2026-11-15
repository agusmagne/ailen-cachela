/*
 * Service worker del sitio de Ailén Cachela. Objetivo: que abra más rápido y que, sin conexión, se vea una página
 * digna en lugar del error del navegador. Es deliberadamente chico y prudente:
 *
 *  - Páginas (HTML): red primero. Siempre se pide la versión nueva (sin pasar por la caché HTTP); la copia guardada
 *    solo se usa si no hay red o tarda más de NAV_TIMEOUT_MS. Así las recompilaciones programadas (fechas nuevas
 *    cada pocas horas) nunca quedan pegadas con contenido viejo.
 *  - Archivos con huella (/_astro/*: CSS, JS, tipografías, imágenes): caché primero; el nombre cambia cuando el
 *    contenido cambia, así que una copia guardada nunca es vieja.
 *  - Otros archivos del sitio (íconos, favicon): "stale-while-revalidate".
 *  - NUNCA se guarda ni se intercepta: audio ni video, descargas (zip, pdf, ics...), pedidos con Range, pedidos que no
 *    sean GET, ni nada de otro origen (SoundCloud, YouTube, etc.). Lo de terceros no pasa por este worker.
 *  - El alcance sale de dónde vive este archivo (<base>/sw.js), así que respeta BASE_PATH sin configurarlo.
 *
 * Salida de emergencia: publicar este mismo archivo con solo
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(c => caches.delete(c)))).then(() => self.registration.unregister())));
 * o abrir el sitio con ?sw=off (borra la caché y recuerda la elección en ese navegador).
 */
'use strict';

const VERSION = 'v1';
const PREFIX = 'fans-';
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}pages-${VERSION}`;
const CURRENT = [STATIC_CACHE, PAGES_CACHE];
const SCOPE = self.registration.scope; // termina en "/"
// .htm (no .html) a propósito: es una plantilla noindex que solo sirve este worker, no una página del sitio
const OFFLINE_URL = new URL('offline.htm', SCOPE).href;
const PRECACHE = [OFFLINE_URL, new URL('favicon.svg', SCOPE).href, new URL('icons/icon-192.png', SCOPE).href];
const MAX_PAGES = 30;
const NAV_TIMEOUT_MS = 4000;
// Extensiones que jamás se interceptan (medios pesados, descargas y formatos de suscripción)
const SKIP = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|mp4|m4v|webm|mov|m3u8|mpd|zip|pdf|ics|vcf|xml)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        /* sin red al instalar: el worker igual sirve (sin la página sin conexión hasta la próxima visita) */
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && !CURRENT.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** ¿Este pedido lo maneja el worker? Todo lo demás pasa directo a la red. */
function handles(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.has('range')) return false;
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false; // blob:, data:, chrome-extension:...
  if (url.origin !== self.location.origin) return false;
  if (!url.href.startsWith(SCOPE)) return false;
  if (SKIP.test(url.pathname)) return false;
  if (url.pathname.endsWith('/sw.js') || url.pathname.includes('/downloads/')) return false;
  return true;
}

const isNavigation = (request) => request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

async function offlinePage() {
  const cached = await caches.match(OFFLINE_URL);
  if (!cached) return Response.error();
  const html = (await cached.text()).replace(/\{\{SCOPE\}\}/g, SCOPE);
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function pageFromNetwork(request) {
  const response = await fetch(request, { cache: 'no-cache' });
  // Solo se guardan páginas completas y sin redirección (una respuesta redirigida no se puede devolver a una navegación)
  if (response.ok && response.status === 200 && !response.redirected && response.type === 'basic') {
    const copy = response.clone();
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(request, copy);
    await trim(PAGES_CACHE, MAX_PAGES);
  }
  return response;
}

async function networkFirst(request) {
  const network = pageFromNetwork(request);
  network.catch(() => {}); // evita un rechazo sin atender si la copia gana la carrera
  const cached = await caches.match(request, { cacheName: PAGES_CACHE, ignoreSearch: true });
  try {
    if (!cached) return await network;
    // Hay copia: la red tiene NAV_TIMEOUT_MS para responder; si no llega, se muestra la copia
    return await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), NAV_TIMEOUT_MS))]);
  } catch (err) {
    return cached || (await offlinePage());
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200 && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok && response.status === 200 && response.type === 'basic') cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  return hit || refresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!handles(request)) return;
  const url = new URL(request.url);
  if (isNavigation(request)) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.includes('/_astro/')) {
    event.respondWith(cacheFirst(request));
  } else if (/\.(svg|png|webp|avif|jpe?g|ico|woff2|css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
