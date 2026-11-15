/**
 * Portadas generativas (Media sin foto). Dibuja un cuadro del shader de metal
 * líquido (chrome.ts) en el canvas de cada pieza, solo cuando entra en pantalla.
 * Con mouse la pieza "fluye" mientras dura el hover/foco; en táctil (sin hover)
 * fluye mientras está en el centro de la pantalla (a ~15 cuadros por segundo).
 * En reposo y con reduced-motion queda un cuadro fijo. Sin WebGL queda el degradé CSS.
 * Solo una pieza (o el hero) anima a la vez: active.ts.
 */
import { drawChromeStill } from './chrome';
import { register } from './active';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const noHover = matchMedia('(hover: none)').matches;
let uid = 0;

function setup(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-gen-canvas]');
  if (!canvas) return;
  const seed: [number, number] = [Number(root.dataset.seedA) || 0, Number(root.dataset.seedB) || 0];
  const t0 = Number(root.dataset.t0) || 3;
  const portrait = root.dataset.variant === 'portrait';
  const scale = portrait ? 1.15 : 1.3;
  let ready = false;

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.min(760, Math.round(canvas.clientWidth * dpr)));
    const h = Math.max(2, Math.min(960, Math.round(canvas.clientHeight * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const paint = (t: number) => {
    fit();
    return drawChromeStill(canvas, seed, t, scale);
  };

  const first = () => {
    if (ready) return;
    if (paint(t0)) {
      ready = true;
      canvas.classList.add('is-live');
      if (wanted && arb.isCurrent()) play();
    }
  };

  // Fluye mientras hay hover o foco
  let raf = 0;
  let t = t0;
  let last = 0;
  let wanted = false;
  const minDt = noHover ? 66 : 40;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - last < minDt) return;
    t += (last ? Math.min(now - last, 100) : 0) * 0.00012;
    last = now;
    paint(t);
  };
  const play = () => {
    if (reduce || !ready || raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const arb = register(`gen:${uid++}`, play, halt);
  const host = root.closest<HTMLElement>('.media') ?? root;
  const want = (on: boolean) => {
    wanted = on;
    arb.want(on);
  };
  // Mouse y teclado: mientras dura el hover o el foco. El "pointerenter" del dedo no cuenta
  // (llega al apoyar y se va al soltar: ~100 ms de animación inútil).
  host.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && e.pointerType !== 'pen' && want(true));
  host.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && e.pointerType !== 'pen' && want(false));
  host.addEventListener('focusin', () => want(true));
  host.addEventListener('focusout', () => want(false));
  // Táctil: mientras la pieza ocupa buena parte de la pantalla
  if (noHover && !reduce) {
    new IntersectionObserver(([e]) => want(e.intersectionRatio >= 0.55), { threshold: [0, 0.55, 0.7, 1] }).observe(host);
  }

  new ResizeObserver(() => {
    if (ready && !raf) paint(t);
  }).observe(canvas);

  new IntersectionObserver(
    (entries, io) => {
      if (entries.some((e) => e.isIntersecting)) {
        first();
        io.disconnect();
      }
    },
    { rootMargin: '200px 0px' },
  ).observe(root);
}

document.querySelectorAll<HTMLElement>('[data-gen]').forEach(setup);
