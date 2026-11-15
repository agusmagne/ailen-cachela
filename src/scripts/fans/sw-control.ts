/**
 * Control del modo sin conexión (service worker). Compartido por fans-pwa (registro) y fans-pwa-panel (botón de
 * desactivar). La única marca que se escribe en el almacenamiento del navegador es `fans-sw = off` (si la persona
 * desactiva el modo sin conexión); nunca se envía a ningún lado. Todo está en try/catch: un navegador con el
 * almacenamiento bloqueado simplemente no recuerda la elección.
 */
export const FLAG_KEY = 'fans-sw';
export const CACHE_PREFIX = 'fans-';

export const swSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** Raíz de publicación con barra final ("/" o "/ailen-cachela/"), como la define BASE_PATH al construir. */
export const baseUrl = () => new URL(import.meta.env.BASE_URL, location.origin);

export function isDisabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === 'off';
  } catch {
    return false;
  }
}

export function setDisabled(off: boolean) {
  try {
    if (off) localStorage.setItem(FLAG_KEY, 'off');
    else localStorage.removeItem(FLAG_KEY);
  } catch {
    /* sin almacenamiento: la elección vale solo para esta visita */
  }
}

/** Da de baja los service workers de este sitio y borra las cachés `fans-*`. */
export async function clearAll(): Promise<void> {
  if (swSupported()) {
    const scope = baseUrl().href;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.filter((r) => r.scope.startsWith(scope)).map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
  }
}

export async function isRegistered(): Promise<boolean> {
  if (!swSupported()) return false;
  const scope = baseUrl().href;
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.some((r) => r.scope.startsWith(scope));
}
