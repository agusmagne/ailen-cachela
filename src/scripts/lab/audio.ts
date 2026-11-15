/**
 * Audio del Lab en el navegador: UN AudioContext por página, creado SOLO desde un gesto de la persona (`ensureAudio` se llama
 * desde un click / pointerdown / keydown). Nada suena al cargar. Se suspende y se avisa a las herramientas cuando la pestaña
 * se oculta o se sale de la página. El volumen y el silencio viven acá (y en localStorage, con try/catch).
 *
 * También acá: la Media Session (título "Lab · ...", play/pausa) y las dos mañas de compatibilidad:
 *   - un <audio> con silencio real en bucle que se reproduce junto al motor, porque los navegadores solo muestran los controles
 *     multimedia del sistema si hay un elemento de medios sonando (el audio de Web Audio solo no alcanza);
 *   - `navigator.audioSession.type = 'playback'` (Safari 16.4+) para que suene aunque el teléfono tenga el interruptor de silencio.
 * Ninguna de las dos se pudo probar en un iPhone real: ver el informe del paquete.
 */
import { createMaster, createPlayer, type Master, type Player } from '../../lib/lab/voices';
import type { Pattern } from '../../lib/lab/pattern';
import { silentWav } from '../../lib/lab/wav';

export interface LabAudio {
  ctx: AudioContext;
  master: Master;
  player: Player;
  analyser: AnalyserNode;
}

type Ctor = typeof AudioContext;
const Ctx = (): Ctor | undefined => window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;

export const audioSupported = () => typeof window !== 'undefined' && !!Ctx() && typeof OfflineAudioContext !== 'undefined';

let audio: LabAudio | null = null;
let broken = false;

/* ---- Volumen y silencio ---------------------------------------------------- */
const KEY_VOL = 'lab:volume';
const KEY_MUTE = 'lab:muted';
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin almacenamiento: el estado vive solo en esta página */
    }
  },
};
let volume = (() => {
  const n = Number(store.get(KEY_VOL));
  return Number.isFinite(n) && store.get(KEY_VOL) !== null ? Math.min(100, Math.max(0, n)) : 80;
})();
let muted = store.get(KEY_MUTE) === '1';
const listeners = new Set<() => void>();
const emitUi = () => listeners.forEach((f) => f());

const applyVolume = () => audio?.master.setVolume(muted ? 0 : volume);
export const getVolume = () => volume;
export const isMuted = () => muted;
export function setVolume(v: number) {
  volume = Math.min(100, Math.max(0, Math.round(v)));
  store.set(KEY_VOL, String(volume));
  applyVolume();
  emitUi();
}
export function setMuted(m: boolean) {
  muted = m;
  store.set(KEY_MUTE, m ? '1' : '0');
  applyVolume();
  emitUi();
}
export const onSoundUi = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/* ---- Contexto ---------------------------------------------------------------- */

/** Crea (o reanuda) el motor. LLAMAR SOLO DESDE UN GESTO. Devuelve null si el navegador no soporta Web Audio o falló. */
export function ensureAudio(pattern: Pattern): LabAudio | null {
  if (audio) {
    if (audio.ctx.state !== 'running') void audio.ctx.resume().catch(() => {});
    return audio;
  }
  const C = Ctx();
  if (!C || broken) return null;
  try {
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      /* sin soporte */
    }
    const ctx = new C({ latencyHint: 'interactive' });
    void ctx.resume().catch(() => {});
    const master = createMaster(ctx, pattern.bpm, muted ? 0 : volume / 100);
    master.output.connect(ctx.destination);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    analyser.minDecibels = -88;
    analyser.maxDecibels = -22;
    master.tap.connect(analyser);
    const player = createPlayer(ctx, master, pattern.acidParams);
    audio = { ctx, master, player, analyser };
    applyVolume();
    return audio;
  } catch (err) {
    broken = true;
    console.error('[lab] no se pudo iniciar Web Audio:', err);
    return null;
  }
}

export const getAudio = () => audio;

/* ---- Salir de pantalla: todo se detiene ------------------------------------------ */
const haltCbs = new Set<() => void>();
/** Registra qué hacer cuando la pestaña se oculta o se sale de la página (parar el transporte, soltar el micrófono...). */
export function onHalt(cb: () => void) {
  haltCbs.add(cb);
  return () => haltCbs.delete(cb);
}
function halt() {
  haltCbs.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('[lab]', err);
    }
  });
  if (audio && audio.ctx.state === 'running') void audio.ctx.suspend().catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) halt();
});
addEventListener('pagehide', () => {
  halt();
  if (audio) void audio.ctx.close().catch(() => {});
  audio = null;
});

/* ---- Barra de sonido (silencio + volumen) --------------------------------------------- */

/** Conecta el marcado de SoundBar.astro: botón `[data-mute]` (etiqueta fija, estado en aria-pressed) y rango `[data-volume]`. */
export function bindSoundBar(root: ParentNode) {
  const btn = root.querySelector<HTMLButtonElement>('[data-mute]');
  const range = root.querySelector<HTMLInputElement>('[data-volume]');
  const sync = () => {
    if (btn) {
      btn.setAttribute('aria-pressed', String(muted));
      btn.dataset.muted = muted ? '1' : '0';
    }
    if (range) {
      range.value = String(volume);
      range.style.setProperty('--fill', `${volume}%`);
    }
  };
  btn?.addEventListener('click', () => setMuted(!muted));
  range?.addEventListener('input', () => setVolume(Number(range.value)));
  onSoundUi(sync);
  sync();
}

/* ---- Media Session -------------------------------------------------------------------- */
let silent: HTMLAudioElement | null = null;
let sessionOn = false;

export interface SessionOptions {
  title: string;
  album: string;
  artist: string;
  icon?: string;
  onPlay: () => void;
  onPause: () => void;
}

/** Registra metadatos y acciones del sistema. Seguro de llamar siempre: sin soporte no hace nada. */
export function setupMediaSession(o: SessionOptions) {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: o.title,
      artist: o.artist,
      album: o.album,
      artwork: o.icon ? [{ src: o.icon, sizes: '180x180', type: 'image/png' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => o.onPlay());
    navigator.mediaSession.setActionHandler('pause', () => o.onPause());
    navigator.mediaSession.setActionHandler('stop', () => o.onPause());
    sessionOn = true;
  } catch {
    sessionOn = false;
  }
}

/** Avisa al sistema si el Lab está sonando. Llamar de forma síncrona dentro del gesto que inicia el sonido. */
export function setSessionPlaying(playing: boolean) {
  if (!sessionOn) return;
  try {
    if (!silent) {
      silent = new Audio();
      silent.loop = true;
      silent.preload = 'auto';
      silent.setAttribute('aria-hidden', 'true');
      silent.src = URL.createObjectURL(new Blob([silentWav(1)], { type: 'audio/wav' }));
    }
    if (playing) void silent.play().catch(() => {});
    else silent.pause();
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch {
    /* sin soporte */
  }
}
