/**
 * Registro del service worker (public/sw.js). Mejora progresiva y con salida de emergencia:
 *  - Solo en producción (en `astro dev` no se registra, así no se cachea nada mientras se desarrolla).
 *  - `?sw=off` en cualquier página lo da de baja, borra la caché y recuerda la elección; `?sw=on` la revierte.
 *  - Respeta BASE_PATH: el worker vive en <base>/sw.js y su alcance es <base>/.
 *  - Si algo falla, el sitio sigue funcionando igual: el worker nunca es imprescindible.
 */
import { baseUrl, clearAll, isDisabled, setDisabled, swSupported } from '../fans/sw-control';

export default async function () {
  if (!import.meta.env.PROD || !swSupported()) return;
  const flag = new URLSearchParams(location.search).get('sw');
  if (flag === 'off') {
    setDisabled(true);
    await clearAll();
    return;
  }
  if (flag === 'on') setDisabled(false);
  if (isDisabled()) {
    await clearAll();
    return;
  }
  try {
    const base = baseUrl();
    await navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.pathname, updateViaCache: 'none' });
  } catch (err) {
    console.warn('[pwa] no se pudo registrar el service worker', err);
  }
}
