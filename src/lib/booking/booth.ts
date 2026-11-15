/**
 * Geometría del diagrama de cabina / stage plot (vista desde arriba). Puro: devuelve rectángulos y trazos en un
 * viewBox fijo de 640 x 340; el componente BoothDiagram.astro los dibuja como SVG propio.
 *
 *   - Fila A (atrás, hacia la pista): reproductores o tornamesas a los costados del mixer; en un live, instrumentos.
 *   - Fila B (adelante, hacia el DJ): laptop, efectos, interfaz y lo que sobre.
 *   - Monitores a los costados de la mesa, micrófono en pie a la derecha, el DJ abajo y la pista arriba.
 */
import type { GearKind } from '../schemas/booking.ts';

export const VIEW = { w: 640, h: 340 } as const;

export interface GearInput {
  kind: GearKind;
  qty: number;
  /** Nombre de modelo ya resuelto al idioma. */
  model: string;
  /** No es un nombre verificado: se dibuja sin modelo y se aclara en la leyenda. */
  confirm: boolean;
}

export interface Unit {
  /** Número en el diagrama y en la leyenda (1..n). */
  n: number;
  id: string;
  kind: GearKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Modelo verificado para escribir dentro de la pieza; null si es "a confirmar". */
  short: string | null;
  model: string;
  confirm: boolean;
  row: 'A' | 'B' | 'side' | 'mic';
}

export interface Cable {
  kind: 'link' | 'audio';
  d: string;
  /** Posición del rótulo del trazo (el texto lo pone el componente según `kind`). */
  label: { x: number; y: number };
}

export interface Layout {
  view: typeof VIEW;
  table: { x: number; y: number; w: number; h: number };
  units: Unit[];
  cables: Cable[];
  /** Posiciones de los rótulos fijos: pista (arriba) y DJ (abajo). */
  floor: { x: number; y: number };
  dj: { x: number; y: number };
  counts: Partial<Record<GearKind, number>>;
}

const TABLE = { x: 52, y: 62, w: 536, h: 212 };
const ROW_A = { x0: 68, x1: 572, y: 78, h: 108 };
const ROW_B = { y: 210, h: 50 };
const GAP = 10;
const MIXER_W = 130;
const MAIN: readonly GearKind[] = ['deck', 'turntable'];
const INSTRUMENTS: readonly GearKind[] = ['synth', 'drum'];

const sizeOf = (kind: GearKind): { h: number } => (kind === 'mixer' ? { h: ROW_A.h } : MAIN.includes(kind) ? { h: 100 } : { h: ROW_A.h - 24 });

export function boothLayout(gear: readonly GearInput[]): Layout {
  const expand = (kinds: readonly GearKind[]) =>
    gear.filter((g) => kinds.includes(g.kind)).flatMap((g) => Array.from({ length: g.qty }, () => g));
  const mixers = expand(['mixer']).slice(0, 1);
  const mains = expand(MAIN);
  const instruments = mains.length ? mains : expand(INSTRUMENTS);
  const rowB = [...expand(['laptop', 'fx', 'interface']), ...(mains.length ? expand(INSTRUMENTS) : [])];
  const monitors = expand(['monitor']).slice(0, 4);
  const mics = expand(['mic']).slice(0, 1);

  const units: Unit[] = [];
  let count = 0;
  const push = (g: GearInput, row: Unit['row'], x: number, y: number, w: number, h: number, kind: GearKind = g.kind) => {
    count += 1;
    units.push({ n: count, id: `u${count}`, kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), short: g.confirm ? null : g.model, model: g.model, confirm: g.confirm, row });
  };

  // ---- Fila A: instrumentos a los costados del mixer ----
  const span = ROW_A.x1 - ROW_A.x0;
  const mixerW = mixers.length ? MIXER_W : 0;
  const n = instruments.length;
  const unitW = n ? Math.min(118, (span - mixerW - GAP * (mixers.length ? n : n - 1)) / n) : 0;
  const items = n + mixers.length;
  const used = n * unitW + mixerW + GAP * Math.max(0, items - 1);
  let x = ROW_A.x0 + (span - used) / 2;
  const leftCount = Math.ceil(n / 2);
  instruments.forEach((g, i) => {
    if (i === leftCount && mixers.length) {
      push(mixers[0], 'A', x, ROW_A.y, MIXER_W, sizeOf('mixer').h);
      x += MIXER_W + GAP;
    }
    push(g, 'A', x, ROW_A.y, unitW, sizeOf(g.kind).h);
    x += unitW + GAP;
  });
  if (mixers.length && leftCount >= n) push(mixers[0], 'A', x, ROW_A.y, MIXER_W, sizeOf('mixer').h);

  // ---- Fila B: accesorios ----
  if (rowB.length) {
    const w = Math.min(100, (span - GAP * (rowB.length - 1)) / rowB.length);
    let bx = ROW_A.x0 + (span - (rowB.length * w + GAP * (rowB.length - 1))) / 2;
    for (const g of rowB) {
      push(g, 'B', bx, ROW_B.y, w, ROW_B.h);
      bx += w + GAP;
    }
  }

  // ---- Monitores a los costados (izquierda, derecha, y apilados si hay más) ----
  monitors.forEach((g, i) => {
    const left = i % 2 === 0;
    push(g, 'side', left ? 14 : 600, 96 + Math.floor(i / 2) * 84, 26, 70);
  });
  // ---- Micrófono en pie ----
  for (const g of mics) push(g, 'mic', 614, 230, 20, 20);

  // ---- Trazos ----
  const cables: Cable[] = [];
  const mixer = units.find((u) => u.kind === 'mixer');
  if (mixer) {
    const mx = mixer.x + mixer.w / 2;
    cables.push({ kind: 'audio', d: `M${mx} ${mixer.y} V34`, label: { x: mx + 10, y: 52 } });
    const decks = units.filter((u) => u.row === 'A' && (u.kind === 'deck' || u.kind === 'turntable'));
    if (decks.length >= 2) {
      const bus = ROW_A.y + ROW_A.h + 12;
      const xs = decks.map((d) => d.x + d.w / 2);
      const parts = decks.map((d) => `M${d.x + d.w / 2} ${d.y + d.h} V${bus}`);
      parts.push(`M${Math.min(...xs, mx)} ${bus} H${Math.max(...xs, mx)}`, `M${mx} ${mixer.y + mixer.h} V${bus}`);
      cables.push({ kind: 'link', d: parts.join(' '), label: { x: Math.max(...xs, mx) + 8, y: bus + 4 } });
    }
  }

  const counts: Layout['counts'] = {};
  for (const g of gear) counts[g.kind] = (counts[g.kind] ?? 0) + g.qty;
  return { view: VIEW, table: TABLE, units, cables, floor: { x: VIEW.w / 2, y: 20 }, dj: { x: VIEW.w / 2, y: 312 }, counts };
}
