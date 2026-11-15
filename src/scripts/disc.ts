/**
 * Vinilo del reproductor (Disc.astro): un solo ángulo de giro para todos los discos de la página
 * (fachada grande, sello junto a "Reproductor" y mini del dock), así giran siempre en fase.
 *
 *  - reposo: casi quieto (--disc-idle); hover o foco de teclado: insinúa el giro (--disc-hover);
 *    reproduciendo ([data-disc-scope][data-disc-state=live]): 33 rpm continuas (--disc-live).
 *    Las velocidades se alcanzan con una rampa (no a saltos), como el plato de un tocadiscos.
 *  - la fachada grande se arrastra con mouse o dedo (scratch) con inercia al soltar. El dedo
 *    solo manda en horizontal: touch-action: pan-y deja el scroll vertical al navegador. Un
 *    arrastre nunca dispara el play (se traga el clic).
 *  - la cara de la fachada la dibuja chrome.ts (modo disco) en el contexto WebGL compartido;
 *    el metal se deforma muy lento y el reflejo sigue apenas al cursor. Sin WebGL queda el CSS.
 *  - pausa fuera de pantalla y con la pestaña oculta; con reduced-motion, cuadro fijo y sin giro.
 */
import { drawChromeDisc } from './chrome';
import { register } from './active';
import { buzz } from './mobile';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

/** Duración (s) de una vuelta, leída de tokens.css */
function turn(name: string, fallback: number) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? (v.endsWith('ms') ? n / 1000 : n) : fallback;
}
const DEG_IDLE = 360 / turn('--disc-idle', 140);
const DEG_HOVER = 360 / turn('--disc-hover', 11);
const DEG_LIVE = 360 / turn('--disc-live', 1.8);
const MAX_FLING = 1500; // deg/s

const discs = Array.from(document.querySelectorAll<HTMLElement>('[data-disc]'));
const spins = Array.from(document.querySelectorAll<HTMLElement>('[data-disc-spin]'));
const scopes = Array.from(document.querySelectorAll<HTMLElement>('[data-disc-scope]'));
const lg = discs.find((d) => d.dataset.disc === 'lg') ?? null;
const canvas = lg?.querySelector<HTMLCanvasElement>('[data-disc-gl]') ?? null;
const facade = lg?.closest<HTMLElement>('[data-facade]') ?? null;

let angle = 0;
let vel = DEG_IDLE; // deg/s
let raf = 0;
let last = 0;
let dragging = false;
const visible = new Set<Element>();

const isLive = () => scopes.some((s) => s.dataset.discState === 'live');
const canHover = matchMedia('(hover: hover)').matches;
const isHot = () => scopes.some((s) => (canHover && s.matches(':hover')) || s.querySelector(':focus-visible') !== null);

const apply = () => {
  const t = `rotate(${angle.toFixed(2)}deg)`;
  for (const el of spins) el.style.transform = t;
};

/* ---- Cara WebGL de la fachada ------------------------------------------------ */
let ready = false;
let drawOn = false;
let drawT = 4.2;
let lastDraw = 0;
let light = 0;
let lightT = 0;
const drawDt = coarse ? 66 : 42;
const paint = () => {
  if (!canvas) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.max(64, Math.min(560, Math.round(canvas.clientWidth * dpr)));
  if (canvas.width !== s || canvas.height !== s) {
    canvas.width = s;
    canvas.height = s;
  }
  return drawChromeDisc(canvas, drawT, light);
};
const first = () => {
  if (ready || !canvas || !lg) return;
  if (paint()) {
    ready = true;
    lg.classList.add('is-gl');
  }
};

/* ---- Bucle: giro (barato, solo un transform) + reflejo líquido lento ---------- */
const tick = (now: number) => {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  const still = !dragging && Math.abs(vel) < 4;
  if (still && last && now - last < 48) return; // casi quieto: ~20 cuadros por segundo alcanzan
  last = now;
  if (!dragging) {
    const target = isLive() ? DEG_LIVE : isHot() ? DEG_HOVER : DEG_IDLE;
    // sube rápido hacia la velocidad pedida, y al soltar o dejar el hover se frena con inercia
    const tau = target > vel ? 0.6 : 1.3;
    vel += (target - vel) * (1 - Math.exp(-dt / tau));
    angle = (angle + vel * dt) % 360;
  }
  apply();
  if (ready && drawOn && lg?.isConnected && now - lastDraw >= drawDt) {
    drawT += (lastDraw ? Math.min(now - lastDraw, 100) : 0) * 0.00005;
    light += (lightT - light) * 0.1;
    lastDraw = now;
    paint();
  }
};
const start = () => {
  if (raf || reduce || document.hidden || !visible.size) return;
  last = 0;
  raf = requestAnimationFrame(tick);
};
const stop = () => {
  cancelAnimationFrame(raf);
  raf = 0;
};

// Un observador por disco (el mini del dock aparece y desaparece por su cuenta)
const io = new IntersectionObserver((entries) => {
  for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
  visible.size ? start() : stop();
  arb?.want(!!lg && lg.isConnected && visible.has(lg));
});
const arb = reduce ? null : register('disc', () => (drawOn = true), () => (drawOn = false));
if (!reduce) discs.forEach((d) => io.observe(d));
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

if (canvas) {
  // Primer cuadro ya (también con reduced-motion); el CSS cubre hasta que llegue
  requestAnimationFrame(first);
  new ResizeObserver(() => {
    if (ready && !(drawOn && raf)) paint();
  }).observe(canvas);
}

/* ---- Arrastre (scratch) ------------------------------------------------------- */
if (facade && lg && !reduce) {
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let prevA = 0;
  let lastT = 0;
  let lastMove = 0;
  let swallow = false;
  const center = () => {
    const r = lg.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
  };
  const ang = (x: number, y: number) => {
    const c = center();
    return (Math.atan2(y - c.y, x - c.x) * 180) / Math.PI;
  };
  const wrap = (d: number) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

  facade.addEventListener('dragstart', (e) => e.preventDefault());
  facade.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || id !== -1) return;
    const c = center();
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > c.R * 1.04) return; // solo sobre el disco
    id = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    prevA = ang(e.clientX, e.clientY);
    lastT = performance.now();
    lastMove = lastT;
    dragging = false;
  });
  facade.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && id === -1) {
      // sin apretar: el reflejo sigue apenas al cursor
      const c = center();
      lightT = Math.max(-1.2, Math.min(1.2, (e.clientX - c.x) / c.R)) * 0.45;
    }
    if (e.pointerId !== id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      dragging = true;
      facade.classList.add('is-scratching');
      try {
        facade.setPointerCapture(id);
      } catch {
        /* puntero ya liberado */
      }
    }
    const now = performance.now();
    const a = ang(e.clientX, e.clientY);
    const c = center();
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > c.R * 0.12) {
      const d = wrap(a - prevA);
      const dt = Math.max(1, now - lastT) / 1000;
      angle = (angle + d) % 360;
      vel = vel * 0.55 + (d / dt) * 0.45;
      if (Math.abs(d) > 0.5) buzz(2);
    }
    prevA = a;
    lastT = now;
    lastMove = now;
    apply();
  });
  const end = () => {
    if (dragging) {
      // Si el dedo/mouse se detuvo antes de soltar, el plato queda detenido; si no, sigue por inercia
      if (performance.now() - lastMove > 90) vel = 0;
      vel = Math.max(-MAX_FLING, Math.min(MAX_FLING, vel));
      swallow = true;
      setTimeout(() => (swallow = false), 120);
      facade.classList.remove('is-scratching');
    }
    dragging = false;
    id = -1;
  };
  facade.addEventListener('pointerup', end);
  facade.addEventListener('pointercancel', end);
  facade.addEventListener('lostpointercapture', end);
  facade.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && id === -1 && (lightT = 0));
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
