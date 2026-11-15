/**
 * Pantalla completa con respaldo y Wake Lock.
 *  - Fullscreen API (con prefijo webkit para Safari de escritorio). En iPhone no existe para elementos que no sean video:
 *    se usa un "pseudo pantalla completa" (el elemento ocupa toda la ventana, clase `is-pseudo-fs`, el scroll de la página se bloquea).
 *  - Wake Lock: evita que la pantalla se apague mientras se proyecta; se pide solo dentro de la pantalla completa y se re-pide
 *    al volver a la pestaña. Sin soporte no pasa nada.
 */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as FsDoc;

export const nativeFsSupported = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

export function isFullscreen(el: HTMLElement): boolean {
  return doc.fullscreenElement === el || doc.webkitFullscreenElement === el || el.classList.contains('is-pseudo-fs');
}

function setPseudo(el: HTMLElement, on: boolean) {
  el.classList.toggle('is-pseudo-fs', on);
  document.documentElement.classList.toggle('lab-fs-lock', on);
}

export async function enterFullscreen(el: HTMLElement): Promise<'native' | 'pseudo'> {
  const target = el as FsEl;
  try {
    if (target.requestFullscreen && doc.fullscreenEnabled !== false) {
      await target.requestFullscreen({ navigationUI: 'hide' });
      return 'native';
    }
    if (target.webkitRequestFullscreen && doc.webkitFullscreenEnabled !== false) {
      await target.webkitRequestFullscreen();
      return 'native';
    }
  } catch {
    /* el navegador lo negó: respaldo */
  }
  setPseudo(el, true);
  el.dispatchEvent(new Event('labfullscreenchange'));
  return 'pseudo';
}

export async function exitFullscreen(el: HTMLElement) {
  if (el.classList.contains('is-pseudo-fs')) {
    setPseudo(el, false);
    el.dispatchEvent(new Event('labfullscreenchange'));
    return;
  }
  try {
    if (doc.fullscreenElement) await document.exitFullscreen();
    else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
  } catch {
    /* ya salió */
  }
}

export function onFullscreenChange(el: HTMLElement, cb: (on: boolean) => void) {
  const fire = () => cb(isFullscreen(el));
  document.addEventListener('fullscreenchange', fire);
  document.addEventListener('webkitfullscreenchange', fire);
  el.addEventListener('labfullscreenchange', fire);
}

/** Wake Lock con re-petición al volver a la pestaña. */
export function createWakeLock() {
  let sentinel: { release: () => Promise<void> } | null = null;
  let wanted = false;
  const request = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (!wl || sentinel || document.hidden) return;
      sentinel = await wl.request('screen');
      (sentinel as unknown as EventTarget).addEventListener?.('release', () => (sentinel = null));
    } catch {
      sentinel = null; // sin permiso o sin soporte: se sigue sin él
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wanted) void request();
  });
  return {
    acquire() {
      wanted = true;
      void request();
    },
    release() {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      void s?.release().catch(() => {});
    },
  };
}
