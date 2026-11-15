// Interacciones del cliente. Todo es mejora progresiva: sin JS el sitio funciona entero.
// La capa móvil (hoja de menú, dock, carrusel, feedback táctil) vive en mobile.ts.
import { setupMenu, setupDock, setupCarousels, setupBrand, setupTouchFeedback, syncLangLinks, buzz } from './mobile';

const root = document.documentElement;
const motionOn = root.classList.contains('js-motion');

/* ---- Reveals por scroll y titulares partidos --------------------------- */
function setupReveals() {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal], [data-split]');
  if (!motionOn || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  // Las piezas con máscara (clip-path) no pueden observarse a sí mismas: con el
  // clip cerrado su área visible es cero. Se observa el contenedor y se abre la pieza.
  const watch = new Map<Element, HTMLElement[]>();
  targets.forEach((el) => {
    const host = el.dataset.reveal === 'clip' && el.parentElement ? el.parentElement : el;
    watch.set(host, [...(watch.get(host) ?? []), el]);
  });
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (watch.get(e.target) ?? []).forEach((el) => el.classList.add('is-in'));
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  watch.forEach((_, host) => io.observe(host));
}

/* ---- Link activo según sección visible ----------------------------------- */
function setupActiveNav() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = byId.get(e.target.id);
        if (!a) continue;
        if (e.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          a.setAttribute('aria-current', 'true');
        } else if (a.getAttribute('aria-current')) {
          a.removeAttribute('aria-current');
        }
      }
      syncLangLinks();
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  byId.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
}

/* ---- Scroll a anclas: mueve el foco al destino --------------------------- */
function setupAnchors() {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href*="#"]');
    if (!a || a.origin !== location.origin || a.pathname !== location.pathname || !a.hash) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    setTimeout(() => target.focus({ preventScroll: true }), motionOn ? 450 : 0);
  });
}

/* ---- Facade de SoundCloud: el iframe se carga recién al hacer clic -------- */
function setupFacades() {
  document.querySelectorAll<HTMLAnchorElement>('[data-facade]').forEach((a) => {
    setupDisc(a);
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const src = a.dataset.embed;
      if (!src) return;
      e.preventDefault();
      // En teléfono el alto del escenario es fijo (CSS): el iframe ocupa el lugar de la fachada sin salto de layout
      // El disco del sello pasa a girar rápido: el reproductor está en marcha
      a.closest('[data-zt-scope]')?.setAttribute('data-zt-state', 'live');
      document.dispatchEvent(new CustomEvent('player:live'));
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = a.dataset.title ?? '';
      iframe.allow = 'autoplay';
      iframe.loading = 'lazy';
      iframe.className = 'facade__frame';
      iframe.setAttribute('scrolling', 'no');
      iframe.setAttribute('frameborder', '0');
      a.replaceWith(iframe);
      iframe.focus({ preventScroll: true });
    });
  });
}

/* ---- Disco táctil: arrastre horizontal = cuadro a cuadro ---------------------
   touch-action: pan-y en la fachada deja el scroll vertical al navegador; solo se
   captura el gesto cuando es claramente horizontal. Un arrastre nunca arranca el audio. */
function setupDisc(facade: HTMLElement) {
  const scope = facade.closest<HTMLElement>('[data-zt-scope]');
  const discs = scope ? Array.from(scope.querySelectorAll<HTMLElement>('[data-zoetrope]')) : [];
  if (!discs.length) return;
  const STEP_PX = 22; // píxeles de arrastre por cuadro (30 grados)
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let dragging = false;
  let steps = 0;
  let base = 0;
  let swallow = false;
  facade.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    id = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    dragging = false;
    steps = 0;
  });
  facade.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      dragging = true;
      try {
        facade.setPointerCapture(id);
      } catch {
        /* puntero ya liberado */
      }
    }
    if (!dragging) return;
    const s = Math.round(dx / STEP_PX);
    if (s !== steps) {
      steps = s;
      discs.forEach((d) => d.style.setProperty('--zt-drag', `${(base + steps) * 30}deg`));
      buzz(4);
    }
  });
  const end = () => {
    if (dragging) {
      base += steps;
      swallow = true;
      setTimeout(() => (swallow = false), 80);
    }
    dragging = false;
    id = -1;
  };
  facade.addEventListener('pointerup', end);
  facade.addEventListener('pointercancel', end);
  facade.addEventListener(
    'click',
    (e) => {
      if (swallow) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

/* ---- Marquee: pausa manual ------------------------------------------------ */
function setupMarquee() {
  document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((m) => {
    const btn = m.querySelector<HTMLButtonElement>('[data-marquee-toggle]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const paused = m.classList.toggle('is-paused');
      btn.setAttribute('aria-pressed', String(paused));
      const label = btn.querySelector('[data-marquee-label]') ?? btn;
      label.textContent = paused ? (btn.dataset.labelPlay ?? '') : (btn.dataset.labelPause ?? '');
    });
  });
}

/* ---- Copiar email ---------------------------------------------------------- */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Sin API de portapapeles (contexto no seguro o permiso denegado): el email sigue visible y es un link mailto.
    return false;
  }
}
function setupCopy() {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    const label = btn.querySelector<HTMLElement>('[data-copy-label]') ?? btn;
    const original = label.textContent ?? '';
    const status = document.querySelector<HTMLElement>('[data-copy-status]');
    btn.addEventListener('click', async () => {
      // Sin permiso ni fallback: el email sigue visible y como link mailto.
      if (!(await copyText(btn.dataset.copy ?? ''))) return;
      const done = btn.dataset.done ?? '';
      label.textContent = done;
      btn.classList.add('is-done');
      buzz(10);
      if (status) status.textContent = done;
      setTimeout(() => {
        label.textContent = original;
        btn.classList.remove('is-done');
        if (status) status.textContent = '';
      }, 2200);
    });
  });
}

/* ---- Video de fondo: solo con movimiento permitido y sin ahorro de datos --- */
function setupVideos() {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (!motionOn || saveData) return;
  document.querySelectorAll<HTMLVideoElement>('video[data-bgvideo]').forEach((v) => {
    v.muted = true;
    void v.play().catch(() => {});
  });
}

/* ---- Barra: transparente sobre el hero, sólida al scrollear ---------------- */
function setupHeader() {
  const header = document.querySelector<HTMLElement>('[data-header]');
  if (!header) return;
  const on = () => header.classList.toggle('is-solid', window.scrollY > 24);
  on();
  window.addEventListener('scroll', on, { passive: true });
}

/* ---- Hero: metal líquido WebGL, cargado después del primer pintado -------- */
function setupHero() {
  const host = document.querySelector<HTMLElement>('[data-chrome-host]');
  const canvas = host?.querySelector<HTMLCanvasElement>('[data-chrome-canvas]');
  const hero = host?.closest<HTMLElement>('[data-hero]');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (host && canvas && hero && !saveData) {
    const go = () => void import('./chrome').then((m) => m.mountChromeHero(host, canvas, hero));
    const later = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300));
    document.readyState === 'complete' ? later() : window.addEventListener('load', later, { once: true });
  }
  // Una sola vez, el nombre se "rompe" brevemente al terminar de revelarse
  const title = document.querySelector<HTMLElement>('[data-hero-title]');
  if (title && motionOn) {
    setTimeout(() => {
      title.classList.add('is-glitching');
      setTimeout(() => title.classList.remove('is-glitching'), 600);
    }, 2100);
  }
}

/* ---- Portadas generativas y campo moiré: solo cuando se acercan ------------ */
function lazyWhenNear(selector: string, load: (els: HTMLElement[]) => void) {
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) return load(els);
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        load(els);
      }
    },
    { rootMargin: '400px 0px' },
  );
  els.forEach((el) => io.observe(el));
}
function setupGenerative() {
  lazyWhenNear('[data-gen]', () => void import('./gen-media'));
  lazyWhenNear('[data-moire-host]', (els) =>
    void import('./moire').then((m) =>
      els.forEach((host) => {
        const c = host.querySelector<HTMLCanvasElement>('[data-moire]');
        if (c) m.mountMoire(c, host);
      }),
    ),
  );
}

/* ---- Disco zoótropo: avanza un cuadro por tramo de scroll ------------------
   Amortiguado: como máximo un cuadro cada 70 ms, así un fling largo no se vuelve
   un estroboscopio (antes saltaba ~50 cuadros en pocos frames). */
function setupZoetrope() {
  if (!motionOn || !('IntersectionObserver' in window)) return;
  const scope = document.querySelector<HTMLElement>('[data-zt-scope]');
  if (!scope) return;
  const discs = Array.from(scope.querySelectorAll<HTMLElement>('[data-zoetrope]'));
  let cur = Math.floor(window.scrollY / 56);
  let target = cur;
  let lastStep = 0;
  let raf = 0;
  const apply = () => discs.forEach((d) => d.style.setProperty('--zt-rot', `${(((cur % 12) + 12) % 12) * 30}deg`));
  const tick = (now: number) => {
    raf = 0;
    if (cur === target) return;
    if (now - lastStep >= 70) {
      cur += Math.sign(target - cur);
      lastStep = now;
      apply();
    }
    raf = requestAnimationFrame(tick);
  };
  const onScroll = () => {
    target = Math.floor(window.scrollY / 56);
    if (Math.abs(target - cur) > 12) cur = target - Math.sign(target - cur) * 12;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    } else {
      window.removeEventListener('scroll', onScroll);
    }
  }).observe(scope);
}

setupReveals();
setupHeader();
setupHero();
setupGenerative();
setupZoetrope();
const menu = setupMenu();
setupDock(menu);
setupCarousels();
setupBrand(menu);
setupTouchFeedback();
setupActiveNav();
setupAnchors();
setupFacades();
setupMarquee();
setupCopy();
setupVideos();
(window as unknown as { __motionReady: boolean }).__motionReady = true;
