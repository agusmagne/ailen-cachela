/**
 * Patrón del secuenciador del Lab: modelo, (de)serialización y validación. PURO (sin DOM ni Web Audio):
 * se prueba con `node --test`.
 *
 * El patrón viaja en la URL como `#p=<base64url>` (el fragmento nunca llega a un servidor). Formato binario v1, 36 bytes:
 *
 *   0       versión (1)
 *   1       bpm - BPM_MIN
 *   2       swing 0..100
 *   3       tonalidad 0..11 (bits 0-3) | forma de onda del acid (bit 4: 0 sierra, 1 cuadrada)
 *   4..8    perillas del acid 0..100: cutoff, resonancia, env mod, decay, drive
 *   9..18   5 pistas x u16 big endian (bit i = paso i activo)
 *   19..34  16 pasos del acid: nota 0..25 (bits 0-4; 0 = silencio, n = n-1 semitonos sobre la tónica)
 *           | acento (bit 5) | slide (bit 6); el bit 7 debe ser 0
 *   35      suma de control: (suma de los bytes 0..34 mod 256) xor 0xA5
 *
 * Un enlace de otra versión, truncado o con valores fuera de rango se rechaza (decodePattern devuelve null):
 * nunca se "arregla" a medias.
 */

export const PATTERN_VERSION = 1;
export const STEPS = 16;
export const TRACKS = ['kick', 'clap', 'hat', 'open', 'bass'] as const;
export type TrackId = (typeof TRACKS)[number];
export const BPM_MIN = 70;
export const BPM_MAX = 180;
export const KNOB_MAX = 100;
export const ACID_MAX_NOTE = 25;
export const PATTERN_BYTES = 36;

export interface AcidStep {
  /** 0 = silencio; 1..25 = (n - 1) semitonos sobre la tónica */
  note: number;
  accent: boolean;
  slide: boolean;
}

export interface AcidParams {
  cutoff: number;
  res: number;
  env: number;
  decay: number;
  drive: number;
  /** 0 sierra, 1 cuadrada */
  wave: 0 | 1;
}

export interface Pattern {
  bpm: number;
  /** 0..100 (0 = recto, 100 = shuffle fuerte) */
  swing: number;
  /** tonalidad 0..11 sobre La (0 = A) */
  key: number;
  tracks: Record<TrackId, boolean[]>;
  acid: AcidStep[];
  acidParams: AcidParams;
}

export const DEFAULT_ACID_PARAMS: AcidParams = { cutoff: 38, res: 62, env: 66, decay: 34, drive: 30, wave: 0 };

export function emptyPattern(): Pattern {
  return {
    bpm: 130,
    swing: 0,
    key: 0,
    tracks: Object.fromEntries(TRACKS.map((t) => [t, Array<boolean>(STEPS).fill(false)])) as Record<TrackId, boolean[]>,
    acid: Array.from({ length: STEPS }, () => ({ note: 0, accent: false, slide: false })),
    acidParams: { ...DEFAULT_ACID_PARAMS },
  };
}

export function clonePattern(p: Pattern): Pattern {
  return {
    bpm: p.bpm,
    swing: p.swing,
    key: p.key,
    tracks: Object.fromEntries(TRACKS.map((t) => [t, p.tracks[t].slice()])) as Record<TrackId, boolean[]>,
    acid: p.acid.map((s) => ({ ...s })),
    acidParams: { ...p.acidParams },
  };
}

export function patternsEqual(a: Pattern, b: Pattern): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---- base64url sin dependencias (btoa/atob no existen en todos los contextos) ---- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REVERSE: Record<string, number> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

export function toBase64Url(bytes: ArrayLike<number>): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

/** null si hay caracteres fuera del alfabeto o la longitud es imposible. Acepta relleno `=` final. */
export function fromBase64Url(text: string): Uint8Array | null {
  const s = text.replace(/=+$/, '');
  if (s.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const chunk = s.slice(i, i + 4);
    let n = 0;
    for (const ch of chunk) n = (n << 6) | REVERSE[ch];
    n <<= 6 * (4 - chunk.length);
    out.push((n >> 16) & 255);
    if (chunk.length > 2) out.push((n >> 8) & 255);
    if (chunk.length > 3) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

const checksum = (bytes: ArrayLike<number>, n: number) => {
  let s = 0;
  for (let i = 0; i < n; i++) s = (s + bytes[i]) & 255;
  return s ^ 0xa5;
};

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

export function encodePattern(p: Pattern): string {
  const b = new Uint8Array(PATTERN_BYTES);
  b[0] = PATTERN_VERSION;
  b[1] = clampInt(p.bpm, BPM_MIN, BPM_MAX) - BPM_MIN;
  b[2] = clampInt(p.swing, 0, 100);
  b[3] = clampInt(p.key, 0, 11) | (p.acidParams.wave === 1 ? 16 : 0);
  b[4] = clampInt(p.acidParams.cutoff, 0, KNOB_MAX);
  b[5] = clampInt(p.acidParams.res, 0, KNOB_MAX);
  b[6] = clampInt(p.acidParams.env, 0, KNOB_MAX);
  b[7] = clampInt(p.acidParams.decay, 0, KNOB_MAX);
  b[8] = clampInt(p.acidParams.drive, 0, KNOB_MAX);
  TRACKS.forEach((t, ti) => {
    let bits = 0;
    for (let i = 0; i < STEPS; i++) if (p.tracks[t][i]) bits |= 1 << i;
    b[9 + ti * 2] = (bits >> 8) & 255;
    b[10 + ti * 2] = bits & 255;
  });
  for (let i = 0; i < STEPS; i++) {
    const s = p.acid[i];
    b[19 + i] = clampInt(s.note, 0, ACID_MAX_NOTE) | (s.accent ? 32 : 0) | (s.slide ? 64 : 0);
  }
  b[35] = checksum(b, 35);
  return toBase64Url(b);
}

export function decodePattern(text: string): Pattern | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 128) return null;
  const b = fromBase64Url(text);
  if (!b || b.length !== PATTERN_BYTES) return null;
  if (b[0] !== PATTERN_VERSION) return null;
  if (b[35] !== checksum(b, 35)) return null;
  const bpm = b[1] + BPM_MIN;
  if (bpm > BPM_MAX || b[2] > 100 || (b[3] & 0xe0) !== 0 || (b[3] & 15) > 11) return null;
  for (let i = 4; i <= 8; i++) if (b[i] > KNOB_MAX) return null;
  const p = emptyPattern();
  p.bpm = bpm;
  p.swing = b[2];
  p.key = b[3] & 15;
  p.acidParams = { cutoff: b[4], res: b[5], env: b[6], decay: b[7], drive: b[8], wave: (b[3] & 16 ? 1 : 0) as 0 | 1 };
  TRACKS.forEach((t, ti) => {
    const bits = (b[9 + ti * 2] << 8) | b[10 + ti * 2];
    for (let i = 0; i < STEPS; i++) p.tracks[t][i] = (bits & (1 << i)) !== 0;
  });
  for (let i = 0; i < STEPS; i++) {
    const v = b[19 + i];
    if (v & 128 || (v & 31) > ACID_MAX_NOTE) return null;
    p.acid[i] = { note: v & 31, accent: (v & 32) !== 0, slide: (v & 64) !== 0 };
  }
  return p;
}

/** `#p=...` (o `p=...`, o con otros parámetros `&`): devuelve el patrón o null. */
export function patternFromHash(hash: string): Pattern | null {
  const m = /(?:^|[#&?])p=([A-Za-z0-9_=-]+)/.exec(hash || '');
  return m ? decodePattern(m[1]) : null;
}

export const patternToHash = (p: Pattern) => `#p=${encodePattern(p)}`;
