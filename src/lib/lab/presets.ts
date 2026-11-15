/**
 * Patrones de fábrica del secuenciador (de ejemplo: no son música de Ailén). PURO.
 * Cada preset se escribe en texto: pistas como "x...x...x...x..." (x = paso activo) y el acid como
 * "0 . 0 12a . 0 3s ..." (número = semitonos sobre la tónica, "." = silencio, "a" acento, "s" slide).
 */
import { ACID_MAX_NOTE, DEFAULT_ACID_PARAMS, STEPS, emptyPattern, type AcidParams, type Pattern, type TrackId } from './pattern.ts';

export interface PresetDef {
  id: string;
  name: { es: string; en: string };
  bpm: number;
  swing: number;
  key: number;
  tracks: Partial<Record<TrackId, string>>;
  acid?: string;
  acidParams?: Partial<AcidParams>;
}

export function parseSteps(text: string): boolean[] {
  const cells = text.replace(/\s+/g, '').split('');
  if (cells.length !== STEPS) throw new Error(`Pista con ${cells.length} pasos (deben ser ${STEPS}): "${text}"`);
  return cells.map((c) => c === 'x');
}

export function parseAcid(text: string): Pattern['acid'] {
  const toks = text.trim().split(/\s+/);
  if (toks.length !== STEPS) throw new Error(`Acid con ${toks.length} pasos (deben ser ${STEPS}): "${text}"`);
  return toks.map((tok) => {
    if (tok === '.') return { note: 0, accent: false, slide: false };
    const m = /^(\d{1,2})([as]{0,2})$/.exec(tok);
    if (!m) throw new Error(`Paso de acid inválido: "${tok}"`);
    const note = Number(m[1]) + 1;
    if (note > ACID_MAX_NOTE) throw new Error(`Nota fuera de rango: "${tok}"`);
    return { note, accent: m[2].includes('a'), slide: m[2].includes('s') };
  });
}

export const PRESETS: PresetDef[] = [
  {
    id: 'warehouse',
    name: { es: 'Warehouse 132', en: 'Warehouse 132' },
    bpm: 132,
    swing: 8,
    key: 0,
    tracks: {
      kick: 'x...x...x...x...',
      clap: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.xx',
      open: '..x...x...x...x.',
      bass: '..x...x...x...x.',
    },
    acid: '0 . 0 12a . 0 3 . 0 . 7s . 0 10a . 5',
    acidParams: { cutoff: 34, res: 66, env: 68, decay: 30, drive: 34 },
  },
  {
    id: 'peak',
    name: { es: 'Peak time 138', en: 'Peak time 138' },
    bpm: 138,
    swing: 0,
    key: 2,
    tracks: {
      kick: 'x...x...x...x...',
      clap: '....x.......x..x',
      hat: 'xxxxxxxxxxxxxxxx',
      open: '..x...x...x...x.',
      bass: '.xx..xx..xx..xx.',
    },
    acid: '0a 0 12 0a . 7 0 3s 5 . 0a 12 . 10 7 .',
    acidParams: { cutoff: 46, res: 72, env: 74, decay: 24, drive: 52 },
  },
  {
    id: 'minimal',
    name: { es: 'Minimal 124', en: 'Minimal 124' },
    bpm: 124,
    swing: 28,
    key: 5,
    tracks: {
      kick: 'x...x...x...x...',
      clap: '............x...',
      hat: '..x....x..x....x',
      open: '.......x.......x',
      bass: '.....x.......x..',
    },
    acid: '. . 0 . . . 7 . . . 3 . . . . 5s',
    acidParams: { cutoff: 28, res: 54, env: 52, decay: 40, drive: 18 },
  },
  {
    id: 'rumble',
    name: { es: 'Rumble 128', en: 'Rumble 128' },
    bpm: 128,
    swing: 0,
    key: 0,
    tracks: {
      kick: 'x...x...x...x...',
      clap: '................',
      hat: '................',
      open: '..x...x...x...x.',
      bass: '.xx..xx..xx..xx.',
    },
    acid: '. . . . . . . . . . . . . . . .',
    acidParams: { cutoff: 30, res: 40, env: 40, decay: 40, drive: 26 },
  },
  {
    id: 'acid',
    name: { es: 'Acid 126', en: 'Acid 126' },
    bpm: 126,
    swing: 14,
    key: 7,
    tracks: {
      kick: 'x...x...x...x...',
      clap: '....x.......x...',
      hat: '..x...x...x...x.',
      open: '.x.x.x.x.x.x.x.x',
      bass: '................',
    },
    acid: '0a 0s 12 . 0 3as 0 . 7 7s 5 . 0a 10 . 12s',
    acidParams: { cutoff: 24, res: 82, env: 86, decay: 20, drive: 60 },
  },
  {
    id: 'broken',
    name: { es: 'Roto 134', en: 'Broken 134' },
    bpm: 134,
    swing: 18,
    key: 9,
    tracks: {
      kick: 'x..x..x...x..x..',
      clap: '....x.......x...',
      hat: 'x.xxx.xxx.xxx.xx',
      open: '......x.......x.',
      bass: '.x.....x..x.....',
    },
    acid: '0 . . 0a . 7 . . 3 . 0s . . 5 . 10a',
    acidParams: { cutoff: 40, res: 60, env: 62, decay: 28, drive: 40 },
  },
];

export function buildPreset(def: PresetDef): Pattern {
  const p = emptyPattern();
  p.bpm = def.bpm;
  p.swing = def.swing;
  p.key = def.key;
  for (const [id, text] of Object.entries(def.tracks) as [TrackId, string][]) p.tracks[id] = parseSteps(text);
  if (def.acid) p.acid = parseAcid(def.acid);
  p.acidParams = { ...DEFAULT_ACID_PARAMS, ...def.acidParams };
  return p;
}

export const presetPattern = (id: string): Pattern | null => {
  const def = PRESETS.find((d) => d.id === id);
  return def ? buildPreset(def) : null;
};
