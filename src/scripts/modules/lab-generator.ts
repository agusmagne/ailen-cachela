/**
 * Generador de flyers, pósters y fondos de pantalla (módulo diferido). Todo ocurre en tu navegador: nada se sube.
 *
 * Capas: (1) campo de cromo del shader del sitio con la semilla elegida, dibujado UNA vez en un canvas 2D con el contexto
 * WebGL compartido (`drawChromeStill`, sin crear otro) a una resolución acotada y escalado al tamaño final;
 * (2) geometría del flyer (anillos, arcos, líneas y el anillo de 31 marcas con el día en acento) de `flyerShapes`,
 * dibujada a resolución completa; (3) texto con las tipografías del sitio. La vista previa es la misma función a escala chica.
 * La descarga renderiza el tamaño final y usa canvas.toBlob (PNG). Sin WebGL queda un fondo 2D de plata sobre negro.
 */
import { drawChromeStill } from '../chrome';
import { flyerShapes } from '../../lib/flyer';
import { DEFAULT_STATE, LIMITS, dateParts, fileName, fitFont, formatById, randomSeed, sanitizeState, seedId, shaderSize, specFor, wrapLines, type FlyerState, type FormatDef } from '../../lib/lab/generator';

interface Labels {
  lang: 'es' | 'en';
  rendering: string;
  done: string;
  fail: string;
  noWebgl: string;
  dims: string; // "{w} x {h} px"
  diceDone: string;
  shared: string;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel);

interface Palette {
  void: string;
  c50: string;
  c100: string;
  c200: string;
  c300: string;
  c400: string;
  accent: string;
}

const readPalette = (): Palette => {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return { void: v('--void', '#020203'), c50: v('--chrome-50', '#f4f6f9'), c100: v('--chrome-100', '#e7eaef'), c200: v('--chrome-200', '#cfd4db'), c300: v('--chrome-300', '#a6acb7'), c400: v('--chrome-400', '#7d848f'), accent: v('--accent', '#e58fd2') };
};

const DISPLAY = '"Archivo Cachela", "Archivo", "Arial Black", "Helvetica Neue", Arial, sans-serif';
const MONO = '"Martian Mono Cachela", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

async function ensureFonts() {
  try {
    await Promise.all([document.fonts.load(`800 64px ${DISPLAY}`), document.fonts.load(`500 24px ${MONO}`)]);
  } catch {
    /* sin Font Loading API: se dibuja con la tipografía de respaldo */
  }
}

type Ctx = CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };

export default function mount(root: HTMLElement, props: Record<string, unknown>) {
  const L = props.labels as Labels;
  const app = $(root, '[data-app]');
  const nojs = $(root, '[data-nojs]');
  const preview = $<HTMLCanvasElement>(root, '[data-preview]');
  if (!app || !preview || !L) return;
  app.hidden = false;
  if (nojs) nojs.hidden = true;
  const status = $(root, '[data-status]');
  const say = (msg: string) => {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = msg));
  };

  const form = $<HTMLFormElement>(root, '[data-form]')!;
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement;
  const downloadBtn = $<HTMLButtonElement>(root, '[data-download]')!;
  const shareBtn = $<HTMLButtonElement>(root, '[data-share]');
  const diceBtn = $<HTMLButtonElement>(root, '[data-dice]');
  const dimsOut = $(root, '[data-dims]');
  const frame = $(root, '[data-frame]');
  const palette = readPalette();
  let webgl = true;

  const readState = (): FlyerState => {
    const fmt = (form.querySelector<HTMLInputElement>('input[name="format"]:checked')?.value ?? DEFAULT_STATE.format) as string;
    return sanitizeState({
      title: field('title').value,
      lineup: field('lineup').value,
      date: field('date').value,
      time: field('time').value,
      place: field('place').value,
      footer: field('footer').value,
      seed: field('seed').value,
      kind: field('kind').value,
      format: fmt,
    });
  };

  /* ---- Fondo de shader (cacheado por semilla, fecha, composición y tamaño) -------------------------------------------- */
  const bgCache = new Map<string, HTMLCanvasElement>();
  function background(s: FlyerState, w: number, h: number): HTMLCanvasElement {
    const spec = specFor(s);
    const key = `${seedId(s)}|${s.date}|${s.kind}|${w}x${h}`;
    const hit = bgCache.get(key);
    if (hit) return hit;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const g = out.getContext('2d')!;
    // teléfono: menos píxeles de shader (el cuadro se dibuja una sola vez, pero a 2 Mpx una GPU chica tarda)
    const sz = shaderSize(w, h, matchMedia('(pointer: coarse)').matches ? 1_400_000 : undefined);
    const tmp = document.createElement('canvas');
    tmp.width = sz.w;
    tmp.height = sz.h;
    let ok = false;
    try {
      ok = drawChromeStill(tmp, [spec.seedA, spec.seedB], spec.t0, spec.scale, 0.4);
    } catch {
      ok = false;
    }
    webgl = ok;
    if (ok) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(tmp, 0, 0, w, h);
    } else {
      // respaldo sin WebGL: negro con un foco de plata y cuñas, como el degradé CSS de las portadas
      g.fillStyle = palette.void;
      g.fillRect(0, 0, w, h);
      const r = g.createRadialGradient(spec.fx * w, spec.fy * h, 0, spec.fx * w, spec.fy * h, Math.max(w, h) * 0.55);
      r.addColorStop(0, 'rgba(207,212,219,0.30)');
      r.addColorStop(1, 'rgba(207,212,219,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, h);
      const conic = (g as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient;
      if (conic) {
        const cg = conic.call(g, (spec.seedA / 40) * Math.PI * 2, spec.fx * w, spec.fy * h);
        for (const [o, a] of [[0, 0], [0.14, 0.28], [0.3, 0], [0.5, 0.22], [0.7, 0], [0.86, 0.3], [1, 0]] as const) cg.addColorStop(o, `rgba(166,172,183,${a})`);
        g.fillStyle = cg;
        g.fillRect(0, 0, w, h);
      }
    }
    if (bgCache.size > 6) bgCache.delete(bgCache.keys().next().value as string);
    bgCache.set(key, out);
    return out;
  }

  /* ---- Dibujo del flyer ------------------------------------------------------------------------------------------------------ */
  function draw(c: HTMLCanvasElement, s: FlyerState, f: FormatDef, scale: number) {
    const W = Math.max(2, Math.round(f.w * scale));
    const H = Math.max(2, Math.round(f.h * scale));
    c.width = W;
    c.height = H;
    const g = c.getContext('2d') as Ctx | null;
    if (!g) return;
    g.drawImage(background(s, W, H), 0, 0);

    // velo oscuro (abajo y a la izquierda), como el de los flyers de Fechas: los textos se leen primero
    const v1 = g.createLinearGradient(0, H * 0.35, 0, H);
    v1.addColorStop(0, 'rgba(2,2,3,0)');
    v1.addColorStop(1, 'rgba(2,2,3,0.82)');
    g.fillStyle = v1;
    g.fillRect(0, 0, W, H);
    const v2 = g.createLinearGradient(0, 0, W, 0);
    v2.addColorStop(0, 'rgba(2,2,3,0.5)');
    v2.addColorStop(0.6, 'rgba(2,2,3,0.05)');
    v2.addColorStop(1, 'rgba(2,2,3,0)');
    g.fillStyle = v2;
    g.fillRect(0, 0, W, H);

    // geometría del flyer (unidades de alto = 100)
    const spec = specFor(s);
    const shapes = flyerShapes(spec, (W / H) * 100, 100);
    const u = H / 100;
    const px = Math.max(1, W / 1080);
    g.save();
    g.scale(u, u);
    g.lineCap = 'round';
    const stroke = (color: string, alpha: number, lw: number) => {
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.lineWidth = (lw * px) / u;
    };
    for (const l of shapes.lines) {
      stroke(palette.c100, l.strong ? 0.6 : 0.3, 1.4);
      g.beginPath();
      g.moveTo(l.x1, l.y1);
      g.lineTo(l.x2, l.y2);
      g.stroke();
    }
    for (const r of shapes.rings) {
      if (r.alt) stroke(palette.c300, 0.4, 1.4);
      else stroke(palette.c100, r.strong ? 0.6 : 0.3, 1.4);
      g.beginPath();
      g.arc(r.cx, r.cy, r.r, 0, Math.PI * 2);
      g.stroke();
    }
    for (const a of shapes.arcs) {
      stroke(palette.c100, a.strong ? 0.6 : 0.3, 1.4);
      try {
        g.stroke(new Path2D(a.d));
      } catch {
        /* path inválido: se omite */
      }
    }
    for (const t of shapes.ticks) {
      if (t.day) stroke(palette.accent, 1, 3.4);
      else stroke(palette.c200, 0.55, 1.4);
      g.beginPath();
      g.moveTo(t.x1, t.y1);
      g.lineTo(t.x2, t.y2);
      g.stroke();
    }
    if (shapes.hour) {
      stroke(palette.c50, 0.8, 2.6);
      g.beginPath();
      g.moveTo(shapes.hour.x1, shapes.hour.y1);
      g.lineTo(shapes.hour.x2, shapes.hour.y2);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;

    drawText(g, s, f, W, H);
    // esquinas de registro (como las portadas del sitio)
    const k = W * 0.035;
    const m = W * 0.03;
    g.strokeStyle = palette.c100;
    g.globalAlpha = 0.55;
    g.lineWidth = Math.max(1, px * 1.4);
    g.beginPath();
    g.moveTo(m, m + k);
    g.lineTo(m, m);
    g.lineTo(m + k, m);
    g.moveTo(W - m - k, m);
    g.lineTo(W - m, m);
    g.lineTo(W - m, m + k);
    g.moveTo(W - m, H - m - k);
    g.lineTo(W - m, H - m);
    g.lineTo(W - m - k, H - m);
    g.moveTo(m + k, H - m);
    g.lineTo(m, H - m);
    g.lineTo(m, H - m - k);
    g.stroke();
    g.globalAlpha = 1;
  }

  function drawText(g: Ctx, s: FlyerState, f: FormatDef, W: number, H: number) {
    const m = W * 0.085;
    const maxW = W - m * 2;
    const top = H * f.safeTop + W * 0.045;
    const bottom = H - H * f.safeBottom - W * 0.045;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    const display = (px: number) => {
      g.font = `800 ${px}px ${DISPLAY}`;
      try {
        g.fontStretch = 'expanded';
      } catch {
        /* sin font-stretch en canvas */
      }
    };
    const mono = (px: number) => {
      g.font = `500 ${px}px ${MONO}`;
      try {
        g.fontStretch = 'normal';
      } catch {
        /* idem */
      }
    };

    // marca arriba (y la semilla como etiqueta)
    const label = W * 0.026;
    mono(label);
    g.fillStyle = palette.c200;
    g.fillText('AILÉN CACHELA', m, top + label);
    if (f.layout === 'poster') {
      g.textAlign = 'right';
      g.fillStyle = palette.c400;
      g.fillText(`#${(s.seed || s.title || 'ailen').toUpperCase().slice(0, 14)}`, W - m, top + label);
      g.textAlign = 'left';
    }

    if (f.layout === 'wallpaper') {
      // fondo de teléfono: nada en la parte alta (reloj); firma y, si hay, el título chico abajo
      let y = bottom;
      if (s.footer) {
        mono(W * 0.024);
        g.fillStyle = palette.c300;
        g.textAlign = 'center';
        g.fillText(s.footer.toUpperCase(), W / 2, y);
        y -= W * 0.07;
      }
      if (s.title) {
        const px = fitFont((p) => (display(p), g.measureText(s.title.toUpperCase()).width), maxW, W * 0.08, W * 0.04);
        display(px);
        g.fillStyle = palette.c50;
        g.textAlign = 'center';
        g.fillText(s.title.toUpperCase(), W / 2, y);
      }
      g.textAlign = 'left';
      return;
    }

    // Pila de abajo hacia arriba: pie, lugar y hora, fecha, line-up y título
    let y = bottom;
    const small = W * 0.03;
    mono(small);
    g.fillStyle = palette.c400;
    if (s.footer) {
      g.fillText(s.footer.toUpperCase(), m, y);
      y -= small * 2.1;
    }
    const meta = [s.place, s.time].filter(Boolean).join('  ·  ');
    if (meta) {
      mono(small);
      const lines = wrapLines((t) => g.measureText(t).width, meta.toUpperCase(), maxW, 2);
      g.fillStyle = palette.c200;
      for (let i = lines.length - 1; i >= 0; i--) {
        g.fillText(lines[i], m, y);
        y -= small * 1.5;
      }
      y -= small * 0.4;
    }
    const dp = s.date ? dateParts(s.date, L.lang) : null;
    if (dp) {
      const dayPx = W * 0.15;
      display(dayPx);
      g.fillStyle = palette.c50;
      g.fillText(dp.day, m, y);
      const dw = g.measureText(dp.day).width;
      mono(small * 1.15);
      g.fillStyle = palette.accent;
      g.fillText(dp.month, m + dw + W * 0.025, y - dayPx * 0.5);
      g.fillStyle = palette.c300;
      g.fillText(`${dp.weekday} · ${dp.year}`, m + dw + W * 0.025, y);
      y -= dayPx * 1.12;
    }
    if (s.lineup) {
      mono(small);
      const lines = wrapLines((t) => g.measureText(t).width, s.lineup.toUpperCase(), maxW, 3);
      g.fillStyle = palette.c200;
      for (let i = lines.length - 1; i >= 0; i--) {
        g.fillText(lines[i], m, y);
        y -= small * 1.55;
      }
      y -= small * 0.5;
    }
    if (s.title) {
      const title = s.title.toUpperCase();
      // el título más grande que entre en hasta tres renglones
      const maxPx = W * 0.17;
      const minPx = W * 0.065;
      let px = maxPx;
      let lines: string[] = [];
      for (px = maxPx; px >= minPx; px -= W * 0.004) {
        display(px);
        lines = wrapLines((t) => g.measureText(t).width, title, maxW, 99);
        if (lines.length <= 3 && Math.max(...lines.map((l) => g.measureText(l).width)) <= maxW) break;
      }
      px = Math.max(px, minPx);
      display(px);
      lines = wrapLines((t) => g.measureText(t).width, title, maxW, 3);
      g.fillStyle = palette.c50;
      const lh = px * 0.98;
      for (let i = lines.length - 1; i >= 0; i--) {
        g.fillText(lines[i], m, y);
        y -= lh;
      }
    }
  }

  /* ---- Vista previa --------------------------------------------------------------------------------------------------------- */
  let timer = 0;
  let token = 0;
  async function paint() {
    const my = ++token;
    await ensureFonts();
    if (my !== token) return;
    const s = readState();
    const f = formatById(s.format);
    const cssW = Math.max(240, frame?.clientWidth || 360);
    const target = Math.min(f.w, Math.round(cssW * Math.min(devicePixelRatio || 1, 2)));
    const scale = target / f.w;
    if (frame) frame.style.setProperty('--ratio', `${f.w} / ${f.h}`);
    try {
      draw(preview!, s, f, scale);
    } catch (err) {
      console.error('[lab] generador:', err);
    }
    if (dimsOut) dimsOut.textContent = L.dims.replace('{w}', String(f.w)).replace('{h}', String(f.h));
    root.dataset.webgl = webgl ? 'on' : 'off';
  }
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void paint(), 110);
  };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', (e) => e.preventDefault());
  new ResizeObserver(schedule).observe(frame ?? preview);

  diceBtn?.addEventListener('click', () => {
    field('seed').value = randomSeed();
    say(L.diceDone);
    schedule();
  });

  /* ---- Descargar y compartir ----------------------------------------------------------------------------------------------------- */
  async function renderBlob(): Promise<{ blob: Blob; name: string } | null> {
    await ensureFonts();
    const s = readState();
    const f = formatById(s.format);
    const c = document.createElement('canvas');
    draw(c, s, f, 1);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    c.width = c.height = 1; // libera memoria (iOS)
    return blob ? { blob, name: fileName(s, f) } : null;
  }
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    say(L.rendering);
    try {
      const out = await renderBlob();
      if (!out) throw new Error('toBlob');
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = out.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      say(L.done);
    } catch (err) {
      console.error('[lab] generador:', err);
      say(L.fail);
    } finally {
      downloadBtn.disabled = false;
    }
  });
  if (shareBtn) {
    let canShareFiles = false;
    try {
      canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'x.png', { type: 'image/png' })] });
    } catch {
      canShareFiles = false;
    }
    shareBtn.hidden = !canShareFiles;
    shareBtn.addEventListener('click', async () => {
      shareBtn.disabled = true;
      say(L.rendering);
      try {
        const out = await renderBlob();
        if (!out) throw new Error('toBlob');
        await navigator.share({ files: [new File([out.blob], out.name, { type: 'image/png' })], title: out.name });
        say(L.shared);
      } catch (err) {
        if ((err as DOMException)?.name !== 'AbortError') say(L.fail);
      } finally {
        shareBtn.disabled = false;
      }
    });
  }

  // límites en los campos (el esquema de la interfaz ya los pone en el HTML; acá por si se edita el DOM)
  for (const [n, max] of Object.entries({ title: LIMITS.title, lineup: LIMITS.lineup, time: LIMITS.time, place: LIMITS.place, footer: LIMITS.footer, seed: LIMITS.seed })) (field(n) as HTMLInputElement).maxLength = max;
  void paint();
}
