/** Utilidades puras de formato para Música y Mixes. */

/** "mm:ss" o "h:mm:ss" a segundos. */
export function toSeconds(d: string): number {
  const p = d.split(':').map(Number);
  if (p.some((n) => Number.isNaN(n))) throw new Error(`Duración inválida: ${d}`);
  return p.reduce((acc, n) => acc * 60 + n, 0);
}

/** Segundos a "mm:ss" o "h:mm:ss". */
export function fromSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Duración ISO 8601 (schema.org) a partir de "mm:ss" o "h:mm:ss". */
export function isoDuration(d: string): string {
  const total = toSeconds(d);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ''}${m || h ? `${m}M` : ''}${s}S`;
}

/** Número de serie con ceros: 3 -> "003". */
export const seriesNumber = (n: number) => String(n).padStart(3, '0');

/** Año (número) de una fecha ISO YYYY-MM-DD. */
export const yearOf = (iso: string) => Number(iso.slice(0, 4));

/** Texto plano de una tracklist (para copiar). */
export function tracklistText(title: string, rows: { n: number; artist: string; title: string; label?: string }[]): string {
  const lines = rows.map((r) => `${String(r.n).padStart(2, '0')}. ${r.artist} - ${r.title}${r.label ? ` [${r.label}]` : ''}`);
  return [title, '', ...lines].join('\n');
}
