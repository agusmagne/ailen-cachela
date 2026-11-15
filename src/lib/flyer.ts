/**
 * Flyer generativo de cada fecha. Puro (sin Astro ni DOM): se prueba con `node --test`.
 *
 * `flyerSpec(show)` convierte un show en parámetros numéricos. La semilla sale SOLO del `id`
 * (el UID del evento): misma fecha, mismo arte, en es y en, en cada build y sin importar
 * el orden de la lista ni el estado. Del dato real del evento salen además rasgos que no
 * se inventan: el día del mes (la marca de acento en el anillo de 31 marcas), el día de
 * la semana (giro del conjunto), la hora de inicio (muesca en el dial interior, solo si
 * hay hora) y las coordenadas del lugar (si el calendario las trae, fijan el foco).
 *
 * `flyerShapes(spec, w, h)` devuelve la geometría SVG (unidades de viewBox, h = 100).
 * El shader (campo de cromo) lo dibuja src/scripts/gen-media.ts con seedA/seedB/t0/scale/dim.
 *
 * Exportar el flyer más adelante: `flyerSpec` es la única fuente de verdad. Un script
 * (como scripts/make-og.mjs) puede levantar Chrome headless sobre una ruta que pinte el
 * mismo shader a 1080x1350 con esos parámetros y superponer `flyerShapes(spec, 80, 100)`.
 */
import { showDate, showTime, type Show } from './show-map.ts';

export type FlyerKind = 'rings' | 'moire' | 'arcs' | 'lines';
export const FLYER_KINDS: readonly FlyerKind[] = ['rings', 'moire', 'arcs', 'lines'];

export interface FlyerSpec {
  kind: FlyerKind;
  // campo de cromo (shader)
  seedA: number;
  seedB: number;
  t0: number;
  scale: number;
  // composición
  /** foco, 0..1 sobre el ancho y el alto del recuadro */
  fx: number;
  fy: number;
  /** giro del conjunto, grados */
  rot: number;
  count: number;
  /** separación entre líneas, en unidades de alto (100 = alto) */
  gap: number;
  emphEvery: number;
  /** desfase de la segunda familia (moiré), unidades de alto */
  offX: number;
  offY: number;
  /** datos reales del evento */
  day: number;
  weekday: number;
  /** hora de inicio en horas decimales (0..24) o null si es de día completo */
  hour: number | null;
  /** el foco vino de las coordenadas del evento */
  geo: boolean;
}

/* ---- Azar determinista ------------------------------------------------------ */

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Número en [0, 1) determinista por (id, canal). */
export function unit(id: string, salt: string): number {
  let h = hash32(`${id}\u0000${salt}`);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (n: number) => n - Math.floor(n);

/** Coordenadas del evento (viven en la URL del mapa, que arma show-map desde el GEO del calendario). */
export function showCoords(s: Pick<Show, 'mapUrl'>): { lat: number; lon: number } | null {
  const m = s.mapUrl ? /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s.mapUrl) : null;
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function flyerSpec(s: Pick<Show, 'id' | 'start' | 'allDay' | 'mapUrl'>): FlyerSpec {
  const id = s.id;
  const u = (k: string) => unit(id, k);
  const [y, mo, d] = showDate(s).split('-').map(Number);
  const day = Number.isFinite(d) && d >= 1 && d <= 31 ? d : 1;
  const weekday = Number.isFinite(y) ? new Date(Date.UTC(y, (mo || 1) - 1, day)).getUTCDay() : 0;
  const hhmm = showTime(s);
  const hour = hhmm ? Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60 : null;

  const kind = FLYER_KINDS[Math.floor(u('kind') * FLYER_KINDS.length)];
  // Foco: de las coordenadas si existen (decimales finos del lugar), si no del id. Siempre en
  // la franja central para que el recorte de la tarjeta (angosta en móvil) no lo pierda.
  const geo = showCoords(s);
  const fx = geo ? lerp(0.34, 0.66, frac(Math.abs(geo.lon) * 1000)) : lerp(0.34, 0.66, u('fx'));
  const fy = geo ? lerp(0.36, 0.64, frac(Math.abs(geo.lat) * 1000)) : lerp(0.36, 0.64, u('fy'));

  const gapRange: Record<FlyerKind, [number, number]> = {
    rings: [3.2, 5.2],
    moire: [2.4, 3.3],
    arcs: [3.6, 5.4],
    lines: [4, 7],
  };
  const countRange: Record<FlyerKind, [number, number]> = {
    rings: [10, 16],
    moire: [16, 24],
    arcs: [7, 10],
    lines: [18, 30],
  };
  return {
    kind,
    seedA: r3(u('seedA') * 40),
    seedB: r3(u('seedB') * 40),
    t0: r3(lerp(2, 14, u('t0'))),
    scale: r3(lerp(1.1, 1.95, u('scale'))),
    fx: r3(fx),
    fy: r3(fy),
    rot: r3(weekday * (360 / 7) + (u('rot') - 0.5) * 26),
    count: Math.round(lerp(countRange[kind][0], countRange[kind][1], u('count'))),
    gap: r3(lerp(gapRange[kind][0], gapRange[kind][1], u('gap'))),
    emphEvery: 3 + Math.floor(u('emph') * 3),
    offX: r3(lerp(2.5, 6, u('offx')) * (u('offxs') < 0.5 ? -1 : 1)),
    offY: r3(lerp(0.5, 4, u('offy')) * (u('offys') < 0.5 ? -1 : 1)),
    day,
    weekday,
    hour,
    geo: geo !== null,
  };
}

/* ---- Geometría --------------------------------------------------------------- */

export interface Seg { x1: number; y1: number; x2: number; y2: number }
export interface FlyerShapes {
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** círculos: `strong` = trazo más marcado, `alt` = segunda familia del moiré */
  rings: { r: number; cx: number; cy: number; strong: boolean; alt: boolean }[];
  /** arcos como path SVG */
  arcs: { d: string; strong: boolean }[];
  /** líneas paralelas */
  lines: (Seg & { strong: boolean })[];
  /** anillo de 31 marcas; la del día del mes es `day` */
  ticks: (Seg & { day: boolean })[];
  /** muesca de la hora de inicio (dial interior) o null */
  hour: Seg | null;
  /** radio del anillo de marcas */
  tickR: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const f2 = (n: number) => Math.round(n * 100) / 100;

export function flyerShapes(spec: FlyerSpec, w: number, h = 100): FlyerShapes {
  const cx = f2(spec.fx * w);
  const cy = f2(spec.fy * h);
  const rings: FlyerShapes['rings'] = [];
  const arcs: FlyerShapes['arcs'] = [];
  const lines: FlyerShapes['lines'] = [];
  const unitH = h / 100;
  const gap = spec.gap * unitH;

  if (spec.kind === 'rings') {
    for (let i = 0; i < spec.count; i++) {
      // crecimiento apenas curvo: los primeros aros más juntos
      const r = gap * (i + 1) * (1 + (i / spec.count) * 0.35);
      rings.push({ r: f2(r), cx, cy, strong: (i + 1) % spec.emphEvery === 0, alt: false });
    }
  } else if (spec.kind === 'moire') {
    const ox = cx + spec.offX * unitH;
    const oy = cy + spec.offY * unitH;
    for (let i = 0; i < spec.count; i++) {
      rings.push({ r: f2(gap * (i + 1)), cx, cy, strong: false, alt: false });
      rings.push({ r: f2(gap * (i + 1)), cx: f2(ox), cy: f2(oy), strong: false, alt: true });
    }
  } else if (spec.kind === 'arcs') {
    for (let i = 0; i < spec.count; i++) {
      const r = gap * (i + 1.5);
      const a0 = unit(`${spec.seedA}:${spec.seedB}`, `a0:${i}`) * 360 + spec.rot;
      const sweep = lerp(60, 250, unit(`${spec.seedA}:${spec.seedB}`, `sw:${i}`));
      const p = (a: number) => `${f2(cx + r * Math.cos(rad(a)))} ${f2(cy + r * Math.sin(rad(a)))}`;
      arcs.push({ d: `M${p(a0)}A${f2(r)} ${f2(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${p(a0 + sweep)}`, strong: (i + 1) % spec.emphEvery === 0 });
    }
  } else {
    // líneas paralelas inclinadas (giro por día de la semana) y un sol pequeño en el foco
    const ang = rad(spec.rot);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const len = w + h;
    const half = Math.ceil(spec.count / 2);
    for (let k = -half; k <= half; k++) {
      const ox = cx - dy * k * gap;
      const oy = cy + dx * k * gap;
      lines.push({ x1: f2(ox - dx * len), y1: f2(oy - dy * len), x2: f2(ox + dx * len), y2: f2(oy + dy * len), strong: k % spec.emphEvery === 0 });
    }
    for (let i = 0; i < 3; i++) rings.push({ r: f2((6 + i * 4.5) * unitH), cx, cy, strong: i === 2, alt: false });
  }

  // Anillo de 31 marcas: la del día del mes (dato real) es la larga y lleva el acento.
  const tickR = f2(0.31 * h);
  const ticks: FlyerShapes['ticks'] = [];
  const start = spec.rot - 90;
  for (let i = 1; i <= 31; i++) {
    const a = rad(start + ((i - 1) * 360) / 31);
    const isDay = i === spec.day;
    const r1 = tickR;
    const r2 = tickR + (isDay ? 6.5 : 2.4) * unitH;
    ticks.push({
      x1: f2(cx + r1 * Math.cos(a)),
      y1: f2(cy + r1 * Math.sin(a)),
      x2: f2(cx + r2 * Math.cos(a)),
      y2: f2(cy + r2 * Math.sin(a)),
      day: isDay,
    });
  }
  let hour: Seg | null = null;
  if (spec.hour !== null) {
    const a = rad(start + (spec.hour / 24) * 360);
    const r1 = tickR * 0.72;
    const r2 = r1 + 3.6 * unitH;
    hour = { x1: f2(cx + r1 * Math.cos(a)), y1: f2(cy + r1 * Math.sin(a)), x2: f2(cx + r2 * Math.cos(a)), y2: f2(cy + r2 * Math.sin(a)) };
  }
  return { w, h, cx, cy, rings, arcs, lines, ticks, hour, tickR };
}
