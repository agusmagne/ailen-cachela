/**
 * Visualizador del Lab (módulo diferido). Sirve a /lab/visualizador/ (escenario dentro de la página) y a /lab/en-vivo/
 * (a pantalla completa, para proyectar). El marcado lo trae VisualizerApp.astro.
 *
 * Fuentes de audio, siempre tras un gesto:
 *   - "loop": un patrón de fábrica sintetizado con el mismo motor del secuenciador (se pasa por el limitador y suena).
 *   - "mic": micrófono, con permiso explícito del navegador. Se analiza en tu equipo y NO se conecta a la salida (no hay realimentación
 *     ni se graba nada). Se suelta al parar, al ocultar la pestaña y al salir.
 * El cromo (viz.ts) reacciona a las bandas del analizador. Pantalla completa con respaldo (fullscreen.ts) y Wake Lock.
 */
import { Viz } from '../lab/viz';
import { audioSupported, bindSoundBar, ensureAudio, getAudio, isMuted, onHalt, setMuted, setSessionPlaying, setupMediaSession, type LabAudio } from '../lab/audio';
import { Transport } from '../lab/transport';
import { createWakeLock, enterFullscreen, exitFullscreen, isFullscreen, nativeFsSupported, onFullscreenChange } from '../lab/fullscreen';
import { PRESETS, presetPattern } from '../../lib/lab/presets';
import { clonePattern, type Pattern } from '../../lib/lab/pattern';
import { playStep, type Player } from '../../lib/lab/voices';
import type { PlannedStep } from '../../lib/lab/timing';

interface Labels {
  lang: 'es' | 'en';
  play: string;
  stop: string;
  fsEnter: string;
  fsExit: string;
  micOn: string;
  micOff: string;
  micDenied: string;
  micUnsupported: string;
  noAudio: string;
  motionNote: string;
  loopOn: string;
  sessionTitle: string;
  sessionAlbum: string;
  sessionArtist: string;
  icon: string;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));

export default function mount(root: HTMLElement, props: Record<string, unknown>) {
  const L = props.labels as Labels;
  const live = props.mode === 'live';
  const app = $(root, '[data-app]');
  const nojs = $(root, '[data-nojs]');
  const stage = $(root, '[data-stage]');
  const canvas = $<HTMLCanvasElement>(root, '[data-viz-canvas]');
  const rings = $<HTMLCanvasElement>(root, '[data-viz-rings]');
  if (!app || !stage || !canvas || !rings || !L) return;
  if (nojs) nojs.hidden = true;
  app.hidden = false;
  if (!audioSupported()) {
    const u = $(root, '[data-unsupported]');
    if (u) u.hidden = false; // el cromo se puede ver igual; solo falta el sonido
  }

  const S: HTMLElement = stage;
  const status = $(root, '[data-status]');
  const say = (msg: string) => {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = msg));
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  /* ---- Estado de la fuente ---------------------------------------------------------------------- */
  type Src = 'loop' | 'mic';
  let src: Src = 'loop';
  let loopPat: Pattern = presetPattern(PRESETS[0].id)!;
  let audio: LabAudio | null = null;
  let transport: Transport | null = null;
  let mic: { stream: MediaStream; node: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null = null;
  let playing = false;
  const wake = createWakeLock();

  const viz = new Viz({
    stage: S,
    canvas,
    rings,
    reduced,
    coarse,
    getSource: () => {
      const a = getAudio();
      if (!a || !playing) return null;
      if (src === 'mic' && mic) return { node: mic.analyser, sampleRate: a.ctx.sampleRate };
      return { node: a.analyser, sampleRate: a.ctx.sampleRate };
    },
  });
  // sin WebGL o con un shader que no compiló: el CSS ya pinta un degradé de plata y se explica abajo
  root.dataset.gl = viz.ok ? 'on' : 'off';
  const glNote = $(root, '[data-gl-note]');
  if (glNote) glNote.hidden = viz.ok;

  /* ---- Controles --------------------------------------------------------------------------------------- */
  const playBtns = $$<HTMLButtonElement>(root, '[data-play]');
  const startOverlay = $(root, '[data-start]');
  const fsBtn = $<HTMLButtonElement>(root, '[data-fs]');
  const motionBtn = $<HTMLButtonElement>(root, '[data-motion]');
  const motionNote = $(root, '[data-motion-note]');
  const presetSel = $<HTMLSelectElement>(root, '[data-preset-select]');
  const sensIn = $<HTMLInputElement>(root, '[data-sens]');
  const srcBtns = $$<HTMLButtonElement>(root, '[data-source]');
  const micState = $(root, '[data-mic-state]');
  const hudSound = $(root, '[data-sound]');
  if (hudSound) bindSoundBar(hudSound);

  const paintPlay = () => {
    for (const b of playBtns) {
      b.classList.toggle('is-active', playing);
      const t = $(b, '[data-play-label]');
      if (t) t.textContent = playing ? L.stop : L.play;
    }
    if (startOverlay) startOverlay.hidden = playing;
    root.dataset.state = playing ? 'playing' : 'idle';
    viz.setLive(playing);
  };

  /* ---- Loop sintetizado -------------------------------------------------------------------------------------- */
  function onStep(ev: PlannedStep) {
    if (!audio) return;
    playStep(audio.player as Player, loopPat, ev.step, ev.time, ev.dur);
  }
  function startLoop(): boolean {
    audio = ensureAudio(loopPat);
    if (!audio) {
      say(L.noAudio);
      return false;
    }
    if (!transport) transport = new Transport({ ctx: audio.ctx, getBpm: () => loopPat.bpm, getSwing: () => loopPat.swing, onStep });
    audio.master.setTempo(loopPat.bpm);
    transport.start();
    return true;
  }

  /* ---- Micrófono ------------------------------------------------------------------------------------------------- */
  async function startMic(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      say(L.micUnsupported);
      return false;
    }
    audio = ensureAudio(loopPat); // dentro del gesto
    if (!audio) {
      say(L.noAudio);
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const analyser = audio.ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -96;
      analyser.maxDecibels = -32;
      const node = audio.ctx.createMediaStreamSource(stream);
      node.connect(analyser); // solo al analizador: nunca a la salida
      mic = { stream, node, analyser };
      if (micState) micState.textContent = L.micOn;
      say(L.micOn);
      return true;
    } catch {
      say(L.micDenied);
      return false;
    }
  }
  function stopMic() {
    if (!mic) return;
    for (const t of mic.stream.getTracks()) t.stop();
    try {
      mic.node.disconnect();
    } catch {
      /* ya desconectado */
    }
    mic = null;
    if (micState) micState.textContent = L.micOff;
  }

  /* ---- Reproducir / parar ------------------------------------------------------------------------------------------ */
  let session = false;
  async function start() {
    if (playing) return;
    let ok = false;
    if (src === 'loop') ok = startLoop();
    else ok = await startMic();
    if (!ok) return;
    playing = true;
    if (!session) {
      session = true;
      setupMediaSession({ title: L.sessionTitle, album: L.sessionAlbum, artist: L.sessionArtist, icon: L.icon, onPlay: () => void start(), onPause: () => stop() });
    }
    if (src === 'loop') setSessionPlaying(true);
    paintPlay();
    if (live || isFullscreen(S)) wake.acquire();
  }
  function stop() {
    transport?.stop();
    stopMic();
    playing = false;
    setSessionPlaying(false);
    wake.release();
    paintPlay();
  }
  const toggle = () => (playing ? stop() : void start());
  for (const b of playBtns) b.addEventListener('click', toggle);
  startOverlay?.querySelector('button')?.addEventListener('click', toggle);
  onHalt(stop);
  addEventListener('pagehide', () => {
    stop();
    viz.destroy();
  });

  for (const b of srcBtns) {
    b.addEventListener('click', () => {
      const next = (b.dataset.source === 'mic' ? 'mic' : 'loop') as Src;
      if (next === src) return;
      const was = playing;
      if (was) stop();
      src = next;
      for (const o of srcBtns) o.setAttribute('aria-pressed', String(o === b));
      root.dataset.source = src;
      if (src === 'loop') say(L.loopOn);
      if (was) void start();
    });
  }
  presetSel?.addEventListener('change', () => {
    const p = presetPattern(presetSel.value);
    if (!p) return;
    loopPat = clonePattern(p);
    audio?.master.setTempo(loopPat.bpm);
  });
  sensIn?.addEventListener('input', () => {
    viz.setSensitivity(Number(sensIn.value) / 100);
    sensIn.style.setProperty('--fill', `${((Number(sensIn.value) - Number(sensIn.min)) / (Number(sensIn.max) - Number(sensIn.min))) * 100}%`);
  });
  if (sensIn) sensIn.dispatchEvent(new Event('input'));

  /* ---- Movimiento reducido -------------------------------------------------------------------------------------------- */
  if (reduced) {
    if (motionBtn) motionBtn.hidden = false;
    if (motionNote) {
      motionNote.hidden = false;
      motionNote.textContent = L.motionNote;
    }
    motionBtn?.addEventListener('click', () => {
      const on = !viz.moving;
      viz.setMotion(on);
      motionBtn.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---- Pantalla completa -------------------------------------------------------------------------------------------------- */
  let hudTimer = 0;
  const wakeHud = () => {
    S.classList.remove('hud-idle');
    clearTimeout(hudTimer);
    if (isFullscreen(S) || live) hudTimer = window.setTimeout(() => playing && S.classList.add('hud-idle'), 3200);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const) S.addEventListener(ev, wakeHud, { passive: true });
  const paintFs = (on: boolean) => {
    root.dataset.fs = on ? '1' : '0';
    if (fsBtn) {
      fsBtn.classList.toggle('is-active', on);
      const t = $(fsBtn, '[data-fs-label]');
      if (t) t.textContent = on ? L.fsExit : L.fsEnter;
    }
    if (on && playing) wake.acquire();
    if (!on && !live) wake.release();
    wakeHud();
  };
  onFullscreenChange(S, paintFs);
  const toggleFs = async () => {
    if (isFullscreen(S)) await exitFullscreen(S);
    else await enterFullscreen(S);
    paintFs(isFullscreen(S));
  };
  fsBtn?.addEventListener('click', () => void toggleFs());
  if (fsBtn && !nativeFsSupported()) fsBtn.dataset.pseudo = '1'; // aún sirve: pseudo pantalla completa

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      void toggleFs();
    } else if (e.key === 'm' || e.key === 'M') {
      setMuted(!isMuted());
    } else if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape' && S.classList.contains('is-pseudo-fs')) {
      void exitFullscreen(S);
    }
  });

  paintPlay();
  paintFs(false);
}
