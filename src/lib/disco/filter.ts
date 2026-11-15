/**
 * Estado del filtro de la discografía, serializado en el hash de la URL (#k=ep&y=2026&l=Sello): se puede compartir.
 * Puro (sin DOM). Claves: k = tipo, y = año, l = sello.
 */
export type FilterKey = 'k' | 'y' | 'l';
export type FilterState = Partial<Record<FilterKey, string>>;
const KEYS: FilterKey[] = ['k', 'y', 'l'];

/** "#k=ep&y=2026" (con o sin #) a estado. Ignora claves desconocidas y valores vacíos. */
export function parseHash(hash: string): FilterState {
  const out: FilterState = {};
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/** Estado a hash SIN el "#". Orden fijo (k, y, l) para que el mismo estado dé siempre el mismo enlace. */
export function buildHash(state: FilterState): string {
  const params = new URLSearchParams();
  for (const k of KEYS) if (state[k]) params.set(k, state[k] as string);
  return params.toString();
}

/** Estado resultante de tocar un chip: el mismo valor activo lo apaga; "" (Todos) limpia el grupo. */
export function toggle(state: FilterState, key: FilterKey, value: string): FilterState {
  const next = { ...state };
  if (!value || next[key] === value) delete next[key];
  else next[key] = value;
  return next;
}

export interface Filterable {
  kind: string;
  year: number | string;
  label: string;
}

export const matches = (state: FilterState, r: Filterable): boolean =>
  (!state.k || state.k === r.kind) && (!state.y || state.y === String(r.year)) && (!state.l || state.l === r.label);
