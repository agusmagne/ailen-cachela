/**
 * Página 404: deja el texto del idioma de la ruta pedida y dibuja el metal líquido compartido de fondo.
 *  - Idioma: si la ruta cae bajo <base>/en/ queda inglés; si no, español (sin JS se ven los dos).
 *  - Shader: un cuadro con el contexto WebGL compartido (chrome.ts); el puntero lo desplaza. Con prefers-reduced-motion
 *    no se anima nada: queda un cuadro fijo. Sin WebGL queda el degradé de CSS. Solo un canvas animado a la vez (active.ts).
 */
import { drawChromeStill } from '../chrome';
import { register } from '../active';

export default function (el: HTMLElement, props: Record<string, unknown>) {
  const base = String(props.base ?? '/');
  const rest = location.pathname.startsWith(base) ? location.pathname.slice(base.length) : location.pathname.replace(/^\//, '');
  const lang = /^en(\/|$)/.test(rest.replace(/^\//, '')) ? 'en' : 'es';
  document.documentElement.lang = lang;
  el.querySelectorAll<HTMLElement>('[data-l]').forEach((n) => {
    n.hidden = n.dataset.l !== lang;
  });

  const canvas = el.querySelector<HTMLCanvasElement>('[data-nf-canvas]');
  if (!canvas) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEED: [number, number] = [11.7, 23.4];
  let pointer = 0.5;
  let t = 6;
  let last = 0;
  let raf = 0;

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1);
    const w = Math.max(2, Math.min(720, Math.round((window.innerWidth * dpr) / 1.6)));
    const h = Math.max(2, Math.min(720, Math.round((window.innerHeight * dpr) / 1.6)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const paint = () => {
    fit();
    const ok = drawChromeStill(canvas, SEED, t + pointer * 1.4, 1.1, 0.35);
    if (ok) canvas.classList.add('is-live');
    return ok;
  };

  if (!paint()) return; // sin WebGL: queda el degradé
  if (reduce) return;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 66) return; // ~15 cuadros por segundo: suficiente para un fondo lento
    t += (last ? Math.min(now - last, 120) : 0) * 0.00009;
    last = now;
    paint();
  };
  const arb = register(
    'fans-404',
    () => {
      if (!raf) raf = requestAnimationFrame(tick);
    },
    () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  );
  window.addEventListener('pointermove', (e) => {
    pointer = e.clientX / Math.max(1, window.innerWidth);
  }, { passive: true });
  window.addEventListener('resize', () => paint());
  arb.want(true);
}
