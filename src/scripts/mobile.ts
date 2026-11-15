// Capa móvil: hoja de menú, dock inferior, carrusel, idioma con sección, retroalimentación
// táctil. Todo es mejora progresiva (sin JS el sitio funciona entero) y respeta
// prefers-reduced-motion. Sin librerías.
const root = document.documentElement;
const motionOn = root.classList.contains('js-motion');

/** Misma consulta que usan Nav.astro y base.css para la hoja del menú. */
export const MOBILE_MQ = '(max-width: 52rem), ((pointer: coarse) and (max-height: 32rem))';
/** Dock: teléfonos y tabletas verticales (no en horizontal bajo). Igual que Dock.astro. */
const DOCK_MQ = '(max-width: 52rem) and (min-height: 32rem)';
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

/** Vibración corta (solo Android/Chrome, requiere un gesto del usuario; iOS no la soporta). */
export function buzz(ms = 6) {
  try {
    // Chrome bloquea (y registra un error) la vibración antes del primer gesto del usuario
    if (reduceMQ.matches || (navigator.userActivation && !navigator.userActivation.hasBeenActive)) return;
    navigator.vibrate?.(ms);
  } catch {
    /* sin soporte */
  }
}

/* ---- Menú: hoja a pantalla completa ----------------------------------------- */
interface MenuApi {
  close: () => void;
  isOpen: () => boolean;
  onChange: (fn: (open: boolean) => void) => void;
}
const noMenu: MenuApi = { close() {}, isOpen: () => false, onChange() {} };

export function setupMenu(): MenuApi {
  const btn = document.querySelector<HTMLButtonElement>('[data-menu-btn]');
  const menu = document.getElementById('menu');
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!btn || !menu || !header) return noMenu;
  const mq = matchMedia(MOBILE_MQ);
  const openLabel = btn.dataset.labelOpen ?? '';
  const closeLabel = btn.dataset.labelClose ?? '';
  const listeners: Array<(open: boolean) => void> = [];
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
  // Todo lo que queda detrás de la hoja: inerte (sin foco, sin lectura, sin toques)
  const behind = () => Array.from(document.querySelectorAll<HTMLElement>('main, footer, .skip, [data-dock]'));
  // Evita que el fondo scrollee con el dedo aunque el navegador ignore overflow:hidden (iOS viejo)
  const guard = (e: TouchEvent) => {
    const sheet = (e.target as Element | null)?.closest<HTMLElement>('[data-menu]');
    if (!sheet || sheet.scrollHeight <= sheet.clientHeight + 1) e.preventDefault();
  };
  const focusables = () =>
    Array.from(header.querySelectorAll<HTMLElement>('a[href], button')).filter(
      (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
    );

  const set = (open: boolean, restoreFocus = false) => {
    if (open && !mq.matches) return;
    if (open === isOpen()) return;
    btn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    header.classList.toggle('is-open', open);
    // La clase vive en <html> y su overflow:hidden solo existe dentro de la misma consulta
    // que la hoja (base.css): al rotar o agrandar la ventana no puede quedar colgada.
    root.classList.toggle('is-menu-open', open);
    behind().forEach((el) => (open ? el.setAttribute('inert', '') : el.removeAttribute('inert')));
    const text = btn.querySelector('[data-menu-text]');
    if (text) text.textContent = open ? closeLabel : openLabel;
    if (open) {
      document.addEventListener('touchmove', guard, { passive: false });
      menu.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    } else {
      document.removeEventListener('touchmove', guard);
      if (restoreFocus) btn.focus({ preventScroll: true });
    }
    listeners.forEach((fn) => fn(open));
  };

  btn.addEventListener('click', () => {
    buzz(5);
    set(!isOpen(), true);
  });
  menu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      set(false, true);
      return;
    }
    if (e.key !== 'Tab') return;
    // Trampa de foco: el recorrido da la vuelta dentro de la barra + la hoja
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!active || !header.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });
  // Al cambiar a escritorio (rotar, agrandar la ventana) la hoja se cierra y se libera todo
  mq.addEventListener('change', (e) => {
    if (!e.matches) set(false);
  });
  // Respaldo del evento anterior (algunos navegadores lo retrasan hasta el próximo cuadro)
  const recheck = () => {
    if (isOpen() && !mq.matches) set(false);
  };
  window.addEventListener('resize', recheck, { passive: true });
  window.addEventListener('orientationchange', recheck);
  // Volver desde la caché de páginas (atrás/adelante) nunca debe mostrar el menú abierto
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) set(false);
  });

  return { close: () => set(false), isOpen, onChange: (fn) => listeners.push(fn) };
}

/* ---- Dock inferior ------------------------------------------------------------ */
export function setupDock(menu: MenuApi) {
  const dock = document.querySelector<HTMLElement>('[data-dock]');
  if (!dock || !('IntersectionObserver' in window)) return;
  const mq = matchMedia(DOCK_MQ);
  const state = { hero: true, contact: false, footer: false, menu: false, player: false, live: false };
  const update = () => {
    const on = mq.matches && !state.hero && !state.contact && !state.footer && !state.menu;
    dock.classList.toggle('is-on', on);
    // Con el reproductor a la vista solo hace falta Booking; cargado y fuera de pantalla, mini reproductor
    dock.dataset.mode = state.player ? 'booking' : state.live ? 'player' : 'default';
  };
  const watch = (el: Element | null, key: 'hero' | 'contact' | 'footer' | 'player') => {
    if (!el) {
      if (key === 'hero') state.hero = false;
      return;
    }
    new IntersectionObserver(
      ([e]) => {
        state[key] = e.isIntersecting;
        update();
      },
      { threshold: 0 },
    ).observe(el);
  };
  // El dock reemplaza a las CTA del hero: aparece cuando esas CTA salen de pantalla
  watch(document.querySelector('.hero__cta') ?? document.getElementById('top'), 'hero');
  watch(document.querySelector('.contact__main'), 'contact');
  watch(document.querySelector('footer'), 'footer');
  watch(document.getElementById('player'), 'player');
  menu.onChange((open) => {
    state.menu = open;
    update();
  });
  document.addEventListener('player:live', () => {
    state.live = true;
    update();
  });
  mq.addEventListener('change', update);
  update();
}

/* ---- Carrusel (Proyectos): scroll-snap + indicador + botones + teclado -------- */
export function setupCarousels() {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach((c) => {
    const track = c.querySelector<HTMLElement>('[data-carousel-track]');
    if (!track) return;
    const items = Array.from(track.querySelectorAll<HTMLElement>('[data-carousel-item]'));
    const prev = c.querySelector<HTMLButtonElement>('[data-carousel-prev]');
    const next = c.querySelector<HTMLButtonElement>('[data-carousel-next]');
    const nEl = c.querySelector<HTMLElement>('[data-carousel-n]');
    const bar = c.querySelector<HTMLElement>('[data-carousel-bar]');
    const live = c.querySelector<HTMLElement>('[data-carousel-live]');
    const posLabel = c.dataset.posLabel ?? '{n} / {total}';
    const total = items.length;
    let idx = 0;
    let announced = -1;
    let raf = 0;

    const padLeft = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const nearest = () => {
      const base = track.getBoundingClientRect().left + padLeft();
      let best = 0;
      let bestD = Infinity;
      items.forEach((it, i) => {
        const d = Math.abs(it.getBoundingClientRect().left - base);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    const scrollable = () => track.scrollWidth > track.clientWidth + 2;
    const sync = () => {
      raf = 0;
      idx = nearest();
      if (nEl) nEl.textContent = String(idx + 1).padStart(2, '0');
      if (bar?.parentElement) {
        bar.style.setProperty('--i', String(idx));
        bar.style.setProperty('--n', String(total));
        bar.parentElement.style.setProperty('--i', String(idx));
        bar.parentElement.style.setProperty('--n', String(total));
      }
      prev?.setAttribute('aria-disabled', String(idx <= 0));
      next?.setAttribute('aria-disabled', String(idx >= total - 1));
      if (live && idx !== announced && announced !== -1) {
        live.textContent = `${posLabel.replace('{n}', String(idx + 1)).replace('{total}', String(total))}: ${items[idx].dataset.name ?? ''}`;
      }
      announced = idx;
    };
    const go = (i: number) => {
      const j = Math.max(0, Math.min(total - 1, i));
      const target = items[j];
      const left = track.scrollLeft + (target.getBoundingClientRect().left - (track.getBoundingClientRect().left + padLeft()));
      track.scrollTo({ left, behavior: motionOn ? 'smooth' : 'auto' });
    };
    track.addEventListener(
      'scroll',
      () => {
        if (!raf) raf = requestAnimationFrame(sync);
      },
      { passive: true },
    );
    prev?.addEventListener('click', () => {
      if (prev.getAttribute('aria-disabled') !== 'true') go(idx - 1);
    });
    next?.addEventListener('click', () => {
      if (next.getAttribute('aria-disabled') !== 'true') go(idx + 1);
    });
    track.addEventListener('keydown', (e) => {
      if (!scrollable()) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown') go(idx + 1);
      else if (k === 'ArrowLeft' || k === 'ArrowUp') go(idx - 1);
      else if (k === 'Home') go(0);
      else if (k === 'End') go(total - 1);
      else return;
      e.preventDefault();
    });
    // La lista solo es foco de teclado cuando de verdad scrollea (carrusel); en grilla no
    const fit = () => {
      if (scrollable()) track.setAttribute('tabindex', '0');
      else track.removeAttribute('tabindex');
      sync();
    };
    new ResizeObserver(fit).observe(track);
    fit();
  });
}

/* ---- Idioma: el link EN/ES conserva la sección en la que estás ------------------ */
export function syncLangLinks() {
  const current = document.querySelector<HTMLAnchorElement>('[data-nav-link][aria-current]');
  const hash = current ? current.hash : '';
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach((a) => {
    a.setAttribute('href', (a.dataset.langLink ?? '') + hash);
  });
}

/* ---- Logo: en la home vuelve arriba (antes recargaba la página) --------------------- */
export function setupBrand(menu: MenuApi) {
  document.querySelectorAll<HTMLAnchorElement>('[data-brand]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.pathname !== location.pathname) return;
      e.preventDefault();
      menu.close();
      window.scrollTo({ top: 0, behavior: motionOn ? 'smooth' : 'auto' });
      history.replaceState(null, '', a.pathname);
    });
  });
}

/* ---- Lenguaje táctil: glitch breve al soltar + vibración corta ----------------------- */
export function setupTouchFeedback() {
  const hot = '.btn, .chip, .dock a, .track__link, .net, .menu__link, .card__link, .carousel__btn, .contact__mail, .facade';
  document.addEventListener(
    'pointerup',
    (e) => {
      if (e.pointerType !== 'touch') return;
      const target = e.target as Element | null;
      if (!target) return;
      const host = target.closest<HTMLElement>('[data-glitch-host]');
      if (host && motionOn) {
        host.classList.remove('is-glitching');
        void host.offsetWidth; // reinicia la animación si se toca otra vez enseguida
        host.classList.add('is-glitching');
        setTimeout(() => host.classList.remove('is-glitching'), 560);
      }
      if (target.closest(hot)) buzz(6);
    },
    { passive: true },
  );
}
