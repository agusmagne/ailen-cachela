/**
 * Formas de onda de ejemplo: picos deterministas generados desde una semilla (no hay audio propio).
 * Puro, sin Astro ni Vite. Misma semilla y mismos parámetros dan siempre los mismos picos.
 */

/** FNV-1a de 32 bits: texto a semilla numérica. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/** mulberry32: generador pseudoaleatorio de 32 bits. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PeakOptions {
  /** Cantidad de barras. */
  count?: number;
  /** Estilo: "track" (intro, quiebre, drop) o "mix" (secciones largas con respiros). */
  shape?: 'track' | 'mix';
}

/**
 * Devuelve `count` picos entre 0.06 y 1, con una envolvente de estructura (intro, cuerpo, quiebre, cierre)
 * y un pulso rítmico, más variación aleatoria fija por semilla. Redondeados a 3 decimales (estables entre plataformas).
 */
export function makePeaks(seed: string, { count = 96, shape = 'track' }: PeakOptions = {}): number[] {
  const rand = rng(hashSeed(`${seed}|${shape}`));
  const bk = 0.45 + rand() * 0.2; // inicio del quiebre
  const bkLen = 0.08 + rand() * 0.07;
  const out: number[] = [];
  const sections = shape === 'mix' ? 5 + Math.floor(rand() * 3) : 0;
  const secLevels = Array.from({ length: sections }, () => 0.55 + rand() * 0.4);
  for (let i = 0; i < count; i++) {
    const x = i / (count - 1);
    let env: number;
    if (shape === 'track') {
      const intro = Math.min(1, x / 0.12);
      const outro = Math.min(1, (1 - x) / 0.1);
      const inBreak = x > bk && x < bk + bkLen ? 0.38 : 1;
      env = Math.min(intro, outro) * inBreak * 0.92;
    } else {
      const s = Math.min(sections - 1, Math.floor(x * sections));
      const edge = Math.min(1, x / 0.03, (1 - x) / 0.03);
      env = secLevels[s] * Math.max(0.35, edge);
    }
    const pulse = 0.78 + 0.22 * Math.abs(Math.sin(i * (shape === 'track' ? 0.9 : 0.55)));
    const v = env * pulse * (0.72 + rand() * 0.28);
    out.push(Math.round(Math.min(1, Math.max(0.06, v)) * 1000) / 1000);
  }
  return out;
}
