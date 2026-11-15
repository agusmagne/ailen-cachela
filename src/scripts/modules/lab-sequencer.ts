/**
 * Secuenciador del Lab (módulo diferido): une el marcado de SequencerApp.astro con el motor de audio.
 *
 *  - 16 pasos x 5 pistas + línea acid con notas, acento y slide; tempo, swing, tonalidad, perillas del acid.
 *  - Reproductor con anticipación (transport.ts) y voces sintetizadas (voices.ts). Nada suena sin un gesto.
 *  - Patrón en la URL (#p=...): se actualiza al editar y se lee al cargar y al pegar otro enlace. Inválido -> se avisa y se carga uno de fábrica.
 *  - Pads táctiles (8) con teclado 1..8; REC graba los cinco primeros en la grilla, cuantizados al paso.
 *  - Exportar WAV (OfflineAudioContext), copiar y compartir el enlace, Media Session.
 *  - Grilla accesible: role=grid, botones con aria-pressed, flechas / Inicio / Fin con tabulación itinerante.
 */
import { ACID_MAX_NOTE, BPM_MAX, BPM_MIN, STEPS, TRACKS, clonePattern, emptyPattern, encodePattern, patternFromHash, patternToHash, type AcidParams, type Pattern, type TrackId } from '../../lib/lab/pattern';
import { PRESETS, buildPreset, presetPattern } from '../../lib/lab/presets';
import { acidMidi, midiName } from '../../lib/lab/params';
import { quantizeStep, stepPosition, type PlannedStep } from '../../lib/lab/timing';
import { PAD_IDS, padTrack, playStep, renderPattern, triggerPad, type PadId } from '../../lib/lab/voices';
import { encodeWav, normalizePeak } from '../../lib/lab/wav';
import { Transport } from '../lab/transport';
import { audioSupported, bindSoundBar, ensureAudio, onHalt, setSessionPlaying, setupMediaSession, type LabAudio } from '../lab/audio';

interface Labels {
  lang: 'es' | 'en';
  tracks: Record<TrackId | 'acid', string>;
  step: string; // "paso {n}"
  noteOff: string;
  accent: string;
  slide: string;
  play: string;
  stop: string;
  copied: string;
  copyFail: string;
  invalidLink: string;
  loaded: string; // "Patrón: {name}"
  cleared: string;
  exporting: string;
  exported: string;
  exportFail: string;
  recOn: string;
  recOff: string;
  recNeedsPlay: string;
  noAudio: string;
  stepNote: string; // "Paso {n}: {note}{flags}"
  stepRest: string; // "Paso {n}: silencio"
  shareTitle: string;
  sessionTitle: string;
  sessionAlbum: string;
  sessionArtist: string;
  icon: string;
}

const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));
const $ = <T extends HTMLElement>(root: ParentNode, sel: string) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll<T>(sel));

export default function mount(root: HTMLElement, props: Record<string, unknown>) {
  const L = props.labels as Labels;
  const app = $(root, '[data-app]');
  const nojs = $(root, '[data-nojs]');
  const unsupported = $(root, '[data-unsupported]');
  if (!app || !L) return;
  if (!audioSupported()) {
    if (nojs) nojs.hidden = true;
    if (unsupported) unsupported.hidden = false;
    return;
  }
  app.hidden = false;
  if (nojs) nojs.hidden = true;

  const status = $(root, '[data-status]');
  const say = (msg: string) => {
    if (!status) return;
    status.textContent = '';
    // un cuadro después: algunos lectores no repiten un texto idéntico
    requestAnimationFrame(() => (status.textContent = msg));
  };

  /* ---- Estado ------------------------------------------------------------------------ */
  let pat: Pattern = emptyPattern();
  let selected = 0;
  let lastNote = 1;
  let rec = false;
  const mutedTracks = new Set<TrackId | 'acid'>();
  let audio: LabAudio | null = null;
  let transport: Transport | null = null;
  let queue: PlannedStep[] = [];
  let lastPlayed: { step: number; time: number } | null = null;
  let raf = 0;
  let nowStep = -1;

  /* ---- Elementos ------------------------------------------------------------------------ */
  const cells = new Map<string, HTMLButtonElement>(); // "kick:3"
  const trackIds = [...TRACKS, 'acid'] as const;
  for (const c of $$<HTMLButtonElement>(root, '[data-cell]')) cells.set(`${c.dataset.track}:${c.dataset.step}`, c);
  const cellAt = (t: string, s: number) => cells.get(`${t}:${s}`)!;
  const playBtn = $<HTMLButtonElement>(root, '[data-play]')!;
  const playLabel = $(playBtn, '[data-play-label]');
  const bpmIn = $<HTMLInputElement>(root, '[data-bpm]')!;
  const bpmOut = $(root, '[data-bpm-out]');
  const swingIn = $<HTMLInputElement>(root, '[data-swing]')!;
  const swingOut = $(root, '[data-swing-out]');
  const keySel = $<HTMLSelectElement>(root, '[data-key]')!;
  const linkIn = $<HTMLInputElement>(root, '[data-link]');
  const recBtn = $<HTMLButtonElement>(root, '[data-rec]');
  const exportBtn = $<HTMLButtonElement>(root, '[data-export]');
  const shareBtn = $<HTMLButtonElement>(root, '[data-share]');
  const stepLabel = $(root, '[data-step-label]');
  const waveBtns = $$<HTMLButtonElement>(root, '[data-wave]');

  const bind = $(root, '[data-sound]');
  if (bind) bindSoundBar(bind);

  /* ---- Pintar el estado en el DOM ---------------------------------------------------------- */
  const noteText = (i: number) => midiName(acidMidi(pat.acid[i].note, pat.key));
  function paintCell(t: (typeof trackIds)[number], i: number) {
    const el = cellAt(t, i);
    if (t === 'acid') {
      const a = pat.acid[i];
      const on = a.note > 0;
      el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('is-on', on);
      el.classList.toggle('is-accent', on && a.accent);
      el.classList.toggle('is-slide', on && a.slide);
      el.classList.toggle('is-selected', i === selected);
      const n = $(el, '[data-note]');
      if (n) n.textContent = on ? noteText(i) : '';
      el.setAttribute('aria-label', `${L.tracks.acid}, ${fmt(L.step, { n: i + 1 })}, ${on ? noteText(i) + (a.accent ? ', ' + L.accent : '') + (a.slide ? ', ' + L.slide : '') : L.noteOff}`);
    } else {
      const on = pat.tracks[t][i];
      el.setAttribute('aria-pressed', String(on));
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-label', `${L.tracks[t]}, ${fmt(L.step, { n: i + 1 })}`);
    }
  }
  function paintAll() {
    for (const t of trackIds) for (let i = 0; i < STEPS; i++) paintCell(t, i);
    bpmIn.value = String(pat.bpm);
    if (bpmOut) bpmOut.textContent = String(pat.bpm);
    fill(bpmIn);
    swingIn.value = String(pat.swing);
    if (swingOut) swingOut.textContent = `${pat.swing}%`;
    fill(swingIn);
    keySel.value = String(pat.key);
    for (const k of Object.keys(pat.acidParams) as (keyof AcidParams)[]) {
      if (k === 'wave') continue;
      const input = $<HTMLInputElement>(root, `[data-knob="${k}"]`);
      if (input) {
        input.value = String(pat.acidParams[k]);
        input.style.setProperty('--fill', `${pat.acidParams[k]}%`);
        const out = $(root, `[data-knob-out="${k}"]`);
        if (out) out.textContent = String(pat.acidParams[k]);
      }
    }
    for (const b of waveBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.wave) === pat.acidParams.wave));
    paintEditor();
    paintLink();
    audio?.master.setTempo(pat.bpm);
  }
  function paintEditor() {
    const a = pat.acid[selected];
    if (stepLabel) stepLabel.textContent = a.note > 0 ? fmt(L.stepNote, { n: selected + 1, note: noteText(selected), flags: (a.accent ? ` · ${L.accent}` : '') + (a.slide ? ` · ${L.slide}` : '') }) : fmt(L.stepRest, { n: selected + 1 });
    $<HTMLButtonElement>(root, '[data-accent]')?.setAttribute('aria-pressed', String(a.accent));
    $<HTMLButtonElement>(root, '[data-slide]')?.setAttribute('aria-pressed', String(a.slide));
    for (const c of $$(root, '[data-cell][data-track="acid"]')) c.classList.toggle('is-selected', Number(c.dataset.step) === selected);
  }

  /* ---- URL ----------------------------------------------------------------------------------- */
  let hashTimer = 0;
  function paintLink() {
    if (linkIn) linkIn.value = `${location.origin}${location.pathname}${patternToHash(pat)}`;
  }
  function syncHash() {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      try {
        history.replaceState(null, '', `${location.pathname}${location.search}${patternToHash(pat)}`);
      } catch {
        /* sin history */
      }
      paintLink();
    }, 220);
  }
  const changed = () => {
    paintLink();
    syncHash();
  };

  function load(next: Pattern, message?: string) {
    pat = clonePattern(next);
    selected = 0;
    paintAll();
    syncHash();
    if (message) say(message);
  }

  /* ---- Edición de pasos ------------------------------------------------------------------------ */
  function toggleCell(t: (typeof trackIds)[number], i: number) {
    if (t === 'acid') {
      const a = pat.acid[i];
      selected = i;
      if (a.note > 0) {
        lastNote = a.note;
        a.note = 0;
        a.accent = false;
        a.slide = false;
      } else a.note = lastNote;
      paintCell('acid', i);
      paintEditor();
    } else {
      pat.tracks[t][i] = !pat.tracks[t][i];
      paintCell(t, i);
    }
    changed();
  }
  function bumpNote(delta: number) {
    const a = pat.acid[selected];
    if (a.note === 0) {
      a.note = lastNote;
    } else a.note = Math.min(ACID_MAX_NOTE, Math.max(1, a.note + delta));
    lastNote = a.note;
    paintCell('acid', selected);
    paintEditor();
    changed();
    audition(selected);
  }
  function audition(i: number) {
    // oír la nota al editarla (solo si el audio ya está iniciado y el transporte parado)
    if (!audio || transport?.running) return;
    const a = pat.acid[i];
    if (a.note <= 0) return;
    const t = audio.ctx.currentTime + 0.01;
    audio.player.acid.setParams(pat.acidParams);
    audio.player.acid.play(t, acidMidi(a.note, pat.key), 0.22, { accent: a.accent });
  }

  for (const [key, el] of cells) {
    const [t, s] = key.split(':');
    el.addEventListener('click', () => toggleCell(t as (typeof trackIds)[number], Number(s)));
  }

  /* ---- Teclado de la grilla: tabulación itinerante + flechas ---------------------------------------- */
  const vertical = matchMedia('(max-width: 62rem)');
  let rover: HTMLButtonElement | null = null;
  const setRover = (el: HTMLButtonElement) => {
    if (rover) rover.tabIndex = -1;
    rover = el;
    el.tabIndex = 0;
  };
  for (const el of cells.values()) el.tabIndex = -1;
  setRover(cellAt('kick', 0));
  const grid = $(root, '[data-grid]');
  grid?.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cell]');
    if (el) setRover(el);
  });
  grid?.addEventListener('keydown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cell]');
    if (!el || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = el.dataset.track as (typeof trackIds)[number];
    const s = Number(el.dataset.step);
    let ti = trackIds.indexOf(t);
    let si = s;
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] as [number, number] | undefined;
    if (dir) {
      // escritorio: horizontal = pasos, vertical = pistas. Teléfono (grilla traspuesta): al revés.
      const [dx, dy] = dir;
      if (vertical.matches) {
        ti += dx;
        si += dy;
      } else {
        si += dx;
        ti += dy;
      }
      ti = Math.min(trackIds.length - 1, Math.max(0, ti));
      si = Math.min(STEPS - 1, Math.max(0, si));
    } else if (e.key === 'Home') si = 0;
    else if (e.key === 'End') si = STEPS - 1;
    else if (t === 'acid' && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
      selected = s;
      bumpNote(e.key === '+' || e.key === '=' ? 1 : -1);
      e.preventDefault();
      return;
    } else if (t === 'acid' && (e.key === 'a' || e.key === 'A')) {
      selected = s;
      toggleFlag('accent');
      e.preventDefault();
      return;
    } else if (t === 'acid' && (e.key === 's' || e.key === 'S')) {
      selected = s;
      toggleFlag('slide');
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    const next = cellAt(trackIds[ti], si);
    next.focus();
  });

  function toggleFlag(flag: 'accent' | 'slide') {
    const a = pat.acid[selected];
    if (a.note === 0) a.note = lastNote;
    a[flag] = !a[flag];
    paintCell('acid', selected);
    paintEditor();
    changed();
    say(stepLabel?.textContent ?? '');
  }
  $(root, '[data-accent]')?.addEventListener('click', () => toggleFlag('accent'));
  $(root, '[data-slide]')?.addEventListener('click', () => toggleFlag('slide'));
  $(root, '[data-note-dec]')?.addEventListener('click', () => bumpNote(-1));
  $(root, '[data-note-inc]')?.addEventListener('click', () => bumpNote(1));
  $(root, '[data-oct-dec]')?.addEventListener('click', () => bumpNote(-12));
  $(root, '[data-oct-inc]')?.addEventListener('click', () => bumpNote(12));

  /* ---- Controles de tempo, swing, tonalidad y perillas ------------------------------------------------- */
  const fill = (el: HTMLInputElement) => el.style.setProperty('--fill', `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`);
  bpmIn.min = String(BPM_MIN);
  bpmIn.max = String(BPM_MAX);
  bpmIn.addEventListener('input', () => {
    pat.bpm = Number(bpmIn.value);
    if (bpmOut) bpmOut.textContent = String(pat.bpm);
    fill(bpmIn);
    audio?.master.setTempo(pat.bpm);
    changed();
  });
  swingIn.addEventListener('input', () => {
    pat.swing = Number(swingIn.value);
    if (swingOut) swingOut.textContent = `${pat.swing}%`;
    fill(swingIn);
    changed();
  });
  keySel.addEventListener('change', () => {
    pat.key = Number(keySel.value);
    for (let i = 0; i < STEPS; i++) paintCell('acid', i);
    paintEditor();
    changed();
  });
  for (const k of ['cutoff', 'res', 'env', 'decay', 'drive'] as const) {
    const input = $<HTMLInputElement>(root, `[data-knob="${k}"]`);
    input?.addEventListener('input', () => {
      pat.acidParams[k] = Number(input.value);
      fill(input);
      const out = $(root, `[data-knob-out="${k}"]`);
      if (out) out.textContent = input.value;
      audio?.player.acid.setParams(pat.acidParams);
      changed();
    });
  }
  for (const b of waveBtns) {
    b.addEventListener('click', () => {
      pat.acidParams.wave = Number(b.dataset.wave) === 1 ? 1 : 0;
      for (const o of waveBtns) o.setAttribute('aria-pressed', String(o === b));
      audio?.player.acid.setParams(pat.acidParams);
      changed();
      audition(selected);
    });
  }

  /* ---- Presets ------------------------------------------------------------------------------------------ */
  for (const b of $$<HTMLButtonElement>(root, '[data-preset]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.preset ?? '';
      const p = presetPattern(id);
      if (!p) return;
      const def = PRESETS.find((d) => d.id === id)!;
      load(p, fmt(L.loaded, { name: def.name[L.lang] }));
    });
  }
  $(root, '[data-clear]')?.addEventListener('click', () => {
    const e = emptyPattern();
    e.bpm = pat.bpm;
    e.swing = pat.swing;
    e.key = pat.key;
    e.acidParams = { ...pat.acidParams };
    load(e, L.cleared);
  });

  /* ---- Mute por pista ----------------------------------------------------------------------------------------- */
  for (const b of $$<HTMLButtonElement>(root, '[data-mute-track]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.muteTrack as TrackId | 'acid';
      const on = !mutedTracks.has(id);
      if (on) mutedTracks.add(id);
      else mutedTracks.delete(id);
      b.setAttribute('aria-pressed', String(on));
      b.closest('[data-row]')?.classList.toggle('is-muted', on);
    });
  }

  /* ---- Reproducción ------------------------------------------------------------------------------------------------ */
  function onStep(ev: PlannedStep) {
    if (!audio) return;
    playStep(audio.player, pat, ev.step, ev.time, ev.dur);
    queue.push(ev);
  }

  function setNow(step: number) {
    if (step === nowStep) return;
    if (nowStep >= 0) for (const t of trackIds) cellAt(t, nowStep).classList.remove('is-now');
    nowStep = step;
    if (step >= 0) for (const t of trackIds) cellAt(t, step).classList.add('is-now');
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!audio) return;
    const latency = (audio.ctx.outputLatency || audio.ctx.baseLatency || 0) as number;
    const now = audio.ctx.currentTime - latency;
    while (queue.length && queue[0].time <= now) {
      const ev = queue.shift()!;
      lastPlayed = { step: ev.step, time: ev.time };
      setNow(ev.step);
    }
  }

  const running = () => !!transport?.running;
  function start() {
    audio = ensureAudio(pat);
    if (!audio) {
      say(L.noAudio);
      return;
    }
    audio.player.muted = mutedTracks;
    if (!transport) {
      transport = new Transport({ ctx: audio.ctx, getBpm: () => pat.bpm, getSwing: () => pat.swing, onStep });
      setupMediaSession({ title: L.sessionTitle, album: L.sessionAlbum, artist: L.sessionArtist, icon: L.icon, onPlay: () => !running() && start(), onPause: () => running() && stop() });
    }
    audio.master.setTempo(pat.bpm);
    transport.start();
    setSessionPlaying(true);
    playBtn.classList.add('is-active');
    if (playLabel) playLabel.textContent = L.stop;
    root.dataset.state = 'playing';
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    transport?.stop();
    queue = [];
    cancelAnimationFrame(raf);
    raf = 0;
    setNow(-1);
    setSessionPlaying(false);
    playBtn.classList.remove('is-active');
    if (playLabel) playLabel.textContent = L.play;
    root.dataset.state = 'idle';
  }
  playBtn.addEventListener('click', () => (running() ? stop() : start()));
  onHalt(stop);

  /* ---- Pads táctiles ------------------------------------------------------------------------------------------------------ */
  const padEls = $$<HTMLButtonElement>(root, '[data-pad]');
  function hitPad(id: PadId, el?: HTMLElement) {
    audio = ensureAudio(pat);
    if (!audio) {
      say(L.noAudio);
      return;
    }
    const a = audio;
    triggerPad(a.player, id, pat, a.ctx.currentTime + 0.005);
    if (el) {
      el.classList.add('is-hit');
      setTimeout(() => el.classList.remove('is-hit'), 110);
    }
    const track = padTrack(id);
    if (rec && running() && track && lastPlayed) {
      const step = quantizeStep(stepPosition(a.ctx.currentTime, lastPlayed, pat.bpm));
      if (!pat.tracks[track][step]) {
        pat.tracks[track][step] = true;
        paintCell(track, step);
        changed();
      }
    }
  }
  for (const el of padEls) {
    const id = el.dataset.pad as PadId;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      hitPad(id, el);
    });
    // Teclado y tecnologías de asistencia: el click sin puntero (detail 0) dispara el pad
    el.addEventListener('click', (e) => {
      if (e.detail === 0) hitPad(id, el);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const n = Number(e.key);
    if (n >= 1 && n <= PAD_IDS.length) {
      const id = PAD_IDS[n - 1];
      hitPad(id, padEls.find((p) => p.dataset.pad === id));
    }
  });
  recBtn?.addEventListener('click', () => {
    rec = !rec;
    recBtn.setAttribute('aria-pressed', String(rec));
    say(rec ? (running() ? L.recOn : L.recNeedsPlay) : L.recOff);
  });

  /* ---- Compartir y exportar ------------------------------------------------------------------------------------------------------ */
  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      linkIn?.select(); // sin permiso de portapapeles: queda seleccionado para copiarlo a mano
      return false;
    }
  }
  $(root, '[data-copy-link]')?.addEventListener('click', async () => {
    paintLink();
    say((await copy(linkIn?.value ?? location.href)) ? L.copied : L.copyFail);
  });
  if (shareBtn) {
    if (typeof navigator.share === 'function') {
      shareBtn.hidden = false;
      shareBtn.addEventListener('click', async () => {
        paintLink();
        try {
          await navigator.share({ title: L.shareTitle, url: linkIn?.value ?? location.href });
        } catch {
          /* cancelado */
        }
      });
    } else shareBtn.hidden = true;
  }
  exportBtn?.addEventListener('click', async () => {
    exportBtn.disabled = true;
    say(L.exporting);
    try {
      const buf = await renderPattern(pat, { bars: 4, sampleRate: 44100, tail: 1.8, volume: 0.8 });
      const ch = [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()];
      normalizePeak(ch);
      const blob = new Blob([encodeWav(ch, buf.sampleRate)], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ailen-cachela-lab-${pat.bpm}bpm-${encodePattern(pat).slice(0, 6)}.wav`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      say(L.exported);
    } catch (err) {
      console.error('[lab] exportar:', err);
      say(L.exportFail);
    } finally {
      exportBtn.disabled = false;
    }
  });

  /* ---- Arranque: patrón de la URL o uno de fábrica ------------------------------------------------------------------------------- */
  const factory = () => buildPreset(PRESETS[0]);
  function fromUrl() {
    const hash = location.hash;
    const p = patternFromHash(hash);
    if (p) return { pattern: p, invalid: false };
    return { pattern: factory(), invalid: /[#&]p=/.test(hash) };
  }
  const first = fromUrl();
  pat = clonePattern(first.pattern);
  paintAll();
  if (first.invalid) say(L.invalidLink);
  window.addEventListener('hashchange', () => {
    const p = patternFromHash(location.hash);
    if (p && encodePattern(p) !== encodePattern(pat)) load(p);
    else if (!p && /[#&]p=/.test(location.hash)) say(L.invalidLink);
  });
}
