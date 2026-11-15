/**
 * Scratch del Lab (módulo diferido): el vinilo grande (Disc.astro + disc.ts, con `data-disc-emit`) manda la velocidad del plato
 * y el sonido la sigue.
 *
 * Técnica (la más compatible, sin AudioWorklet): un loop sintetizado de 2 compases se renderiza una vez con OfflineAudioContext y suena
 * en un AudioBufferSourceNode en bucle cuyo `playbackRate` sigue al plato (rate = velocidad angular / 200 grados por segundo, con
 * el fader de pitch encima). Web Audio no reproduce hacia atrás: para el sentido inverso se usa una copia invertida del buffer y se
 * cambia de una a otra con un fundido de ~10 ms (sin clics) cuando el plato invierte el giro. Con el plato detenido (la mano lo frena)
 * se hace silencio. La posición del loop se integra acá con el reloj de audio (el nodo no la expone).
 * Controles alternativos para teclado, lectores de pantalla y movimiento reducido: freno, retroceso, baby scratch y pitch.
 */
import { audioSupported, bindSoundBar, ensureAudio, onHalt, setSessionPlaying, setupMediaSession, type LabAudio } from '../lab/audio';
import { PRESETS, presetPattern } from '../../lib/lab/presets';
import { renderPattern } from '../../lib/lab/voices';
import { DEAD_ZONE, advancePos, directionOf, peaksOf, rateFromVelocity, rateLabel, reversedCopy, reversedOffset, smoothRate, wrapPos } from '../../lib/lab/scratch';

interface Labels {
  lang: 'es' | 'en';
  play: string;
  stop: string;
  preparing: string;
  ready: string;
  noAudio: string;
  renderFail: string;
  reducedNote: string;
  sessionTitle: string;
  sessionAlbum: string;
  sessionArtist: string;
  icon: string;
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel);

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  dir: 1 | -1;
}

export default function mount(root: HTMLElement, props: Record<string, unknown>) {
  const L = props.labels as Labels;
  const app = $(root, '[data-app]');
  const nojs = $(root, '[data-nojs]');
  const unsupported = $(root, '[data-unsupported]');
  const facade = $(root, '[data-facade]');
  const scope = $(root, '[data-disc-scope]');
  if (!app || !facade || !L) return;
  if (!audioSupported()) {
    if (nojs) nojs.hidden = true;
    if (unsupported) unsupported.hidden = false;
    return;
  }
  app.hidden = false;
  if (nojs) nojs.hidden = true;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const status = $(root, '[data-status]');
  const say = (msg: string) => {
    if (!status) return;
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = msg));
  };
  if (reduced) {
    const n = $(root, '[data-reduced-note]');
    if (n) {
      n.hidden = false;
      n.textContent = L.reducedNote;
    }
  }

  const playBtn = $<HTMLButtonElement>(root, '[data-play]')!;
  const playLabel = $(playBtn, '[data-play-label]');
  const loopSel = $<HTMLSelectElement>(root, '[data-loop-select]')!;
  const pitchIn = $<HTMLInputElement>(root, '[data-pitch]')!;
  const pitchOut = $(root, '[data-pitch-out]');
  const rateOut = $(root, '[data-rate-out]');
  const holdBtns = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-hold]'));
  const babyBtn = $<HTMLButtonElement>(root, '[data-baby]');
  const waveCanvas = $<HTMLCanvasElement>(root, '[data-wave]');
  const sound = $(root, '[data-sound]');
  if (sound) bindSoundBar(sound);

  /* ---- Estado ------------------------------------------------------------------------------------------ */
  let audio: LabAudio | null = null;
  let fwd: AudioBuffer | null = null;
  let rev: AudioBuffer | null = null;
  let loopId = '';
  let playing = false;
  let busy = false;
  let pos = 0;
  let rate = 0;
  let pitch = 1;
  let voice: Voice | null = null;
  let raf = 0;
  let lastCtxT = 0;
  let override: { rate: number; tau: number } | null = null;
  const platter = { vel: 0, dragging: false, lastMove: 0, spinAt: 0 };
  let peaks: Float32Array | null = null;
  let waveCache: HTMLCanvasElement | null = null;
  let readoutAt = 0;

  const setEnabled = (on: boolean) => {
    for (const b of holdBtns) b.disabled = !on;
    if (babyBtn) babyBtn.disabled = !on;
  };
  setEnabled(false);

  /* ---- Eventos del plato (disc.ts) ------------------------------------------------------------------------ */
  facade.addEventListener('disc:spin', (e) => {
    const d = (e as CustomEvent<{ vel: number; dragging: boolean }>).detail;
    platter.vel = d.vel;
    platter.dragging = d.dragging;
    platter.spinAt = performance.now();
  });
  facade.addEventListener('disc:drag', (e) => {
    const d = (e as CustomEvent<{ phase: string; velocity: number }>).detail;
    const now = performance.now();
    platter.spinAt = now;
    if (d.phase === 'start') {
      platter.dragging = true;
      platter.lastMove = now;
    } else if (d.phase === 'move') {
      platter.vel = d.velocity;
      platter.lastMove = now;
    } else {
      platter.dragging = false;
      platter.vel = d.velocity;
    }
  });

  /* ---- Preparar el loop (render offline, sin gesto) ------------------------------------------------------------- */
  async function prepare(): Promise<boolean> {
    if (!audio) return false;
    const id = loopSel.value;
    if (fwd && rev && id === loopId) return true;
    const pat = presetPattern(id);
    if (!pat) return false;
    busy = true;
    playBtn.disabled = true;
    say(L.preparing);
    try {
      const sr = audio.ctx.sampleRate;
      // 2 compases con el patrón de fábrica; la cola se pliega al principio para que el bucle cierre sin hueco
      const buf = await renderPattern(pat, { bars: 2, sampleRate: sr, tail: 1.6, loop: true, volume: 0.85 });
      const ctx = audio.ctx;
      const f = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      const r = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const data = buf.getChannelData(c);
        f.copyToChannel(data as Float32Array<ArrayBuffer>, c);
        r.copyToChannel(reversedCopy(data) as Float32Array<ArrayBuffer>, c);
      }
      fwd = f;
      rev = r;
      loopId = id;
      pos = 0;
      peaks = peaksOf(f.getChannelData(0), 480);
      waveCache = null;
      say(L.ready);
      return true;
    } catch (err) {
      console.error('[lab] scratch:', err);
      say(L.renderFail);
      return false;
    } finally {
      busy = false;
      playBtn.disabled = false;
    }
  }

  /* ---- Voces: avanzar, invertir, parar ---------------------------------------------------------------------------- */
  function fadeOut(v: Voice, at: number) {
    try {
      v.gain.gain.cancelScheduledValues(at);
      v.gain.gain.setTargetAtTime(0, at, 0.004);
      v.src.stop(at + 0.05);
      v.src.onended = () => {
        try {
          v.src.disconnect();
          v.gain.disconnect();
        } catch {
          /* ya desconectado */
        }
      };
    } catch {
      /* ya detenido */
    }
  }
  function startVoice(dir: 1 | -1, speed: number) {
    if (!audio || !fwd || !rev) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = dir > 0 ? fwd : rev;
    src.loop = true;
    src.playbackRate.value = Math.max(0.01, speed);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.01);
    src.connect(gain).connect(master.bus.dry);
    const dur = fwd.duration;
    src.start(now, dir > 0 ? wrapPos(pos, dur) : reversedOffset(pos, dur));
    voice = { src, gain, dir };
  }

  /* ---- Bucle de control (cada cuadro mientras suena) --------------------------------------------------------------- */
  function platterRate(now: number): { rate: number; tau: number } {
    if (override) return override;
    if (platter.dragging) return { rate: now - platter.lastMove > 80 ? 0 : rateFromVelocity(platter.vel, pitch), tau: 0.02 };
    // sin eventos recientes (movimiento reducido, disco fuera de pantalla): el loop suena a velocidad normal
    if (now - platter.spinAt > 400) return { rate: pitch, tau: 0.1 };
    return { rate: rateFromVelocity(platter.vel, pitch), tau: 0.03 };
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!audio || !playing || !fwd) return;
    const { ctx } = audio;
    const now = performance.now();
    const ct = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, ct - lastCtxT));
    lastCtxT = ct;
    const target = platterRate(now);
    rate = smoothRate(rate, target.rate, dt, target.tau);
    pos = advancePos(pos, rate, dt, fwd.duration);
    const dir = directionOf(rate);
    if (dir === 0) {
      if (voice) {
        fadeOut(voice, ct);
        voice = null;
      }
    } else {
      if (voice && voice.dir !== dir) {
        fadeOut(voice, ct);
        voice = null;
      }
      if (!voice) startVoice(dir as 1 | -1, Math.abs(rate));
      else voice.src.playbackRate.setTargetAtTime(Math.max(0.01, Math.abs(rate)), ct, 0.012);
    }
    if (now - readoutAt > 90) {
      readoutAt = now;
      if (rateOut) rateOut.textContent = rateLabel(Math.abs(rate) < DEAD_ZONE ? 0 : rate, L.lang);
      drawWave();
    }
  }

  function drawWave() {
    const c = waveCanvas;
    if (!c || !peaks || !fwd) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.max(2, Math.round(c.clientWidth * dpr));
    const H = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
      waveCache = null;
    }
    const g = c.getContext('2d');
    if (!g) return;
    const cs = getComputedStyle(document.documentElement);
    if (!waveCache) {
      waveCache = document.createElement('canvas');
      waveCache.width = W;
      waveCache.height = H;
      const w = waveCache.getContext('2d')!;
      w.strokeStyle = cs.getPropertyValue('--chrome-400').trim() || '#7d848f';
      w.lineWidth = Math.max(1, dpr);
      w.beginPath();
      for (let x = 0; x < W; x++) {
        const v = peaks[Math.min(peaks.length - 1, Math.floor((x / W) * peaks.length))];
        const h = Math.max(1, v * H * 0.46);
        w.moveTo(x + 0.5, H / 2 - h);
        w.lineTo(x + 0.5, H / 2 + h);
      }
      w.stroke();
    }
    g.clearRect(0, 0, W, H);
    g.drawImage(waveCache, 0, 0);
    const x = (pos / fwd.duration) * W;
    g.strokeStyle = cs.getPropertyValue('--accent').trim() || '#e58fd2';
    g.lineWidth = Math.max(2, dpr * 1.5);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }

  /* ---- Reproducir / parar ---------------------------------------------------------------------------------------------- */
  let session = false;
  async function start() {
    if (playing || busy) return;
    audio = ensureAudio(presetPattern(loopSel.value) ?? presetPattern(PRESETS[0].id)!); // dentro del gesto
    if (!audio) {
      say(L.noAudio);
      return;
    }
    setSessionPlaying(true); // síncrono, dentro del gesto
    if (!(await prepare())) {
      setSessionPlaying(false);
      return;
    }
    playing = true;
    rate = 0;
    lastCtxT = audio.ctx.currentTime;
    scope?.setAttribute('data-disc-state', 'live'); // el plato arranca a 33 rpm con su rampa
    playBtn.classList.add('is-active');
    if (playLabel) playLabel.textContent = L.stop;
    root.dataset.state = 'playing';
    setEnabled(true);
    if (!session) {
      session = true;
      setupMediaSession({ title: L.sessionTitle, album: L.sessionAlbum, artist: L.sessionArtist, icon: L.icon, onPlay: () => void start(), onPause: () => stop() });
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    raf = 0;
    if (voice && audio) {
      fadeOut(voice, audio.ctx.currentTime);
      voice = null;
    }
    override = null;
    scope?.removeAttribute('data-disc-state');
    setSessionPlaying(false);
    playBtn.classList.remove('is-active');
    if (playLabel) playLabel.textContent = L.play;
    root.dataset.state = 'idle';
    setEnabled(false);
    if (rateOut) rateOut.textContent = rateLabel(0, L.lang);
  }
  playBtn.addEventListener('click', () => (playing ? stop() : void start()));
  onHalt(stop);

  loopSel.addEventListener('change', async () => {
    const was = playing;
    if (was) stop();
    fwd = rev = null;
    peaks = null;
    if (was) await start();
  });

  /* ---- Pitch, freno, retroceso y baby scratch ----------------------------------------------------------------------------- */
  const paintPitch = () => {
    pitchIn.style.setProperty('--fill', `${((Number(pitchIn.value) - Number(pitchIn.min)) / (Number(pitchIn.max) - Number(pitchIn.min))) * 100}%`);
    const pct = (pitch - 1) * 100;
    if (pitchOut) pitchOut.textContent = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`.replace('.', L.lang === 'es' ? ',' : '.');
  };
  pitchIn.addEventListener('input', () => {
    pitch = Number(pitchIn.value) / 100;
    paintPitch();
  });
  paintPitch();

  const HOLD = { brake: { rate: 0, tau: 0.32 }, rewind: { rate: -2.2, tau: 0.07 } } as const;
  for (const b of holdBtns) {
    const kind = b.dataset.hold as keyof typeof HOLD;
    const on = () => {
      if (!playing) return;
      override = HOLD[kind];
      b.setAttribute('aria-pressed', 'true');
    };
    const off = () => {
      if (override === HOLD[kind]) override = null;
      b.setAttribute('aria-pressed', 'false');
    };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* puntero ya liberado */
      }
      on();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, off);
    b.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        on();
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') off();
    });
    b.addEventListener('blur', off);
  }

  // Baby scratch: una secuencia corta de ida y vuelta (accesible desde teclado)
  const BABY: [number, number][] = [
    [-2.6, 0.13],
    [2.4, 0.15],
    [-2.2, 0.11],
    [2.0, 0.13],
    [-3.0, 0.1],
    [1.6, 0.18],
  ];
  let babyTimer = 0;
  babyBtn?.addEventListener('click', () => {
    if (!playing) return;
    clearTimeout(babyTimer);
    let i = 0;
    const step = () => {
      if (i >= BABY.length || !playing) {
        override = null;
        return;
      }
      const [r, d] = BABY[i++];
      override = { rate: r, tau: 0.018 };
      babyTimer = window.setTimeout(step, d * 1000);
    };
    step();
  });

  if (rateOut) rateOut.textContent = rateLabel(0, L.lang);
}
