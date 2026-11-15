/**
 * Campo de líneas concéntricas con moiré (canvas 2D). Dos familias de círculos
 * con centros separados: al moverse el segundo centro (deriva lenta + puntero)
 * aparecen las franjas de interferencia. Una sola pasada de trazo por familia.
 * Pausa fuera de pantalla y con la pestaña oculta (active.ts: un solo canvas animado
 * a la vez); un cuadro fijo con reduced-motion. Colores: variables de tokens.css.
 *
 * Interacción: el mouse mueve el segundo centro; en táctil, el toque (pointerdown/move)
 * lo lleva al dedo con un empujón, y la velocidad de scroll retuerce el campo. Los
 * eventos se escuchan en la sección (el host tiene pointer-events:none).
 */
import { register } from './active';

export function mountMoire(canvas: HTMLCanvasElement, host: HTMLElement) {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cs = getComputedStyle(document.documentElement);
  const colA = cs.getPropertyValue('--chrome-300').trim();
  const colB = cs.getPropertyValue('--chrome-500').trim();
  const accent = cs.getPropertyValue('--accent').trim();
  const coarse = matchMedia('(pointer: coarse)').matches;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 6.2;
  let raf = 0;
  let last = 0;
  let visible = false;
  const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  let kick = 0; // empujón al tocar, decae solo
  let twist = 0; // retorcimiento por velocidad de scroll, decae solo
  let lastY = window.scrollY;

  const size = () => {
    const r = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const rings = (cx: number, cy: number, gap: number, rmax: number, color: string, alpha: number) => {
    ctx.beginPath();
    for (let r = gap; r < rmax; r += gap) {
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const gap = w < 600 ? 6 : 7;
    const cx = w * 0.72;
    const cy = h * 0.5;
    const rmax = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + gap;
    const drift = Math.sin(t * 0.7) * 26 + Math.cos(t * 0.37) * 12;
    const px = (ptr.x - 0.5) * 120 * (1 + kick * 0.9);
    const py = (ptr.y - 0.5) * 60 * (1 + kick * 0.9);
    rings(cx, cy, gap, rmax, colA, 0.5);
    rings(cx + 42 + drift + px + twist, cy + py + Math.sin(t * 0.5) * 8 + twist * 0.25, gap, rmax, colB, 0.85);
    // un único aro de acento, fijo: el punto de fuga del campo
    ctx.beginPath();
    ctx.arc(cx, cy, gap * 9, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? now - last : 16;
    if (dt < (coarse ? 40 : 28)) return;
    last = now;
    t += Math.min(dt, 100) * 0.00045;
    ptr.x += (ptr.tx - ptr.x) * 0.06;
    ptr.y += (ptr.ty - ptr.y) * 0.06;
    kick *= 0.94;
    twist *= 0.93;
    draw();
  };
  const onScroll = () => {
    const y = window.scrollY;
    twist = Math.max(-70, Math.min(70, twist + (y - lastY) * 0.5));
    lastY = y;
  };
  const start = () => {
    if (reduce || raf || !visible || document.hidden) return;
    last = 0;
    lastY = window.scrollY;
    window.addEventListener('scroll', onScroll, { passive: true });
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('scroll', onScroll);
  };

  size();
  draw();
  new ResizeObserver(() => {
    size();
    draw();
  }).observe(host);

  if (reduce) return;
  const arb = register('moire:' + (host.id || Math.random().toString(36).slice(2)), start, stop);
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      arb.want(visible);
    },
    { rootMargin: '80px 0px' },
  ).observe(host);
  const aim = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    ptr.tx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    ptr.ty = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  };
  // El host no recibe eventos (pointer-events:none): se escucha en la sección que lo contiene
  const surface = host.closest<HTMLElement>('section') ?? host.parentElement ?? host;
  surface.addEventListener('pointermove', aim, { passive: true });
  surface.addEventListener(
    'pointerdown',
    (e) => {
      aim(e);
      if (e.pointerType !== 'mouse') kick = 1;
    },
    { passive: true },
  );
}
