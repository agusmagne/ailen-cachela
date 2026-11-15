/**
 * Visualizador del cromo líquido reactivo al audio (Lab: /lab/visualizador/ y /lab/en-vivo/).
 *
 * Dibujo en dos capas:
 *  1. el campo de cromo del shader del sitio (chrome.ts, `drawChromeAudio`), con bandas de grave, medios y agudos más un golpe
 *     que decae solo, copiado a un canvas 2D. Usa el contexto WebGL COMPARTIDO: esta página no crea otro.
 *  2. un canvas 2D encima con anillos de espectro (líneas finas de plata y un único punto de acento).
 *
 * Un solo canvas animado a la vez (active.ts). Resolución adaptativa: si la mediana de rAF se estira, baja la calidad.
 * Con prefers-reduced-motion no hay bucle: cuadro fijo, y la persona puede activar el movimiento con un interruptor.
 * Sin WebGL, `ok` queda en false y la página muestra su estado de respaldo.
 */
import { drawChromeAudio } from '../chrome';
import { register } from '../active';
import { BeatDetector, bandsFromSpectrum, follow, logBins } from '../../lib/lab/bands';

export interface AnalyserSource {
  node: AnalyserNode;
  sampleRate: number;
}

export interface VizOptions {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  rings: HTMLCanvasElement;
  getSource: () => AnalyserSource | null;
  /** valores de los tokens (color de las líneas); si no, se leen de CSS */
  reduced: boolean;
  coarse: boolean;
}

const RING_BINS = 48;

export class Viz {
  /** el shader pudo dibujar al menos un cuadro */
  ok = false;
  private spec = new Uint8Array(0);
  private raf = 0;
  private last = 0;
  private prevRaf = 0;
  private deltas: number[] = [];
  private vsync = 1000;
  private quality: number;
  private readonly maxQ: number;
  private minDt: number;
  private live = false;
  private motion: boolean;
  private visible = true;
  private t = 9.3;
  private sens = 1;
  private s = { bass: 0, mid: 0, high: 0, energy: 0 };
  private beat = 0;
  private beatDet = new BeatDetector();
  private ringV = new Float32Array(RING_BINS);
  private ptr = { x: 9, y: 9, tx: 9, ty: 9, a: 0, ta: 0 };
  private arb;
  private colors = { line: '#e7eaef', dim: '#7d848f', accent: '#e58fd2' };
  private cssW = 1;
  private cssH = 1;

  constructor(private o: VizOptions) {
    const dpr = Math.min(window.devicePixelRatio || 1, o.coarse ? 2 : 1.5);
    this.dpr = dpr;
    this.quality = o.coarse ? Math.min(0.75, Math.max(0.4, 0.8 / dpr)) : 0.6;
    this.maxQ = o.coarse ? 0.8 : 0.9;
    this.minDt = o.coarse ? 33 : 16;
    this.motion = !o.reduced;
    this.readColors();
    this.arb = register('lab-viz', () => this.run(), () => this.halt());

    new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        this.update();
      },
      { threshold: 0 },
    ).observe(o.stage);
    new ResizeObserver(() => {
      this.measure();
      if (!this.raf) this.renderFrame(performance.now(), 16);
    }).observe(o.stage);

    const { stage } = o;
    const toPtr = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const m = Math.min(r.width, r.height) || 1;
      this.ptr.tx = (e.clientX - r.left - r.width / 2) / m;
      this.ptr.ty = -(e.clientY - r.top - r.height / 2) / m;
      this.ptr.ta = 1;
      if (this.ptr.x > 5) {
        this.ptr.x = this.ptr.tx;
        this.ptr.y = this.ptr.ty;
      }
    };
    stage.addEventListener('pointermove', toPtr, { passive: true });
    stage.addEventListener('pointerdown', toPtr, { passive: true });
    stage.addEventListener('pointerleave', () => (this.ptr.ta = 0));
    stage.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && (this.ptr.ta = 0), { passive: true });

    this.measure();
    this.renderFrame(performance.now(), 16);
    this.update();
  }

  private dpr: number;

  private readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    this.colors = { line: v('--chrome-100', this.colors.line), dim: v('--chrome-400', this.colors.dim), accent: v('--accent', this.colors.accent) };
  }

  private measure() {
    const r = this.o.stage.getBoundingClientRect();
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
  }

  /** ¿Hay una fuente de audio sonando? Con sonido el cuadro sube a 60 fps; sin él, 15 (solo "respira"). */
  setLive(on: boolean) {
    this.live = on;
    if (!on) {
      this.beatDet.reset();
      this.beat = 0;
    }
  }

  setSensitivity(v: number) {
    this.sens = Math.min(3, Math.max(0.3, v));
  }

  /** Interruptor de movimiento (con reduced-motion arranca apagado). */
  setMotion(on: boolean) {
    this.motion = on;
    this.update();
    if (!on) this.renderFrame(performance.now(), 16);
  }

  get moving() {
    return this.motion;
  }

  private update() {
    this.arb.want(this.motion && this.visible);
  }

  private run() {
    if (this.raf || !this.motion) return;
    this.last = 0;
    this.prevRaf = 0;
    this.deltas.length = 0;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private halt() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Detiene todo (la página se está yendo). */
  destroy() {
    this.halt();
    this.arb.want(false);
  }

  private tick(now: number) {
    const d = this.prevRaf ? now - this.prevRaf : 0;
    this.prevRaf = now;
    if (d > 0 && d < 250) {
      this.vsync = Math.min(this.vsync, d);
      this.deltas.push(d);
    }
    if (this.deltas.length >= 90) {
      this.deltas.sort((a, b) => a - b);
      const med = this.deltas[45];
      this.deltas.length = 0;
      const target = Math.max(this.vsync * 1.4, this.minDt * 1.35);
      if (med > Math.max(target, 24) && this.quality > 0.25) this.quality = Math.max(0.25, this.quality * 0.82);
      else if (med < this.vsync * 1.25 && this.quality < this.maxQ) this.quality = Math.min(this.maxQ, this.quality * 1.05);
    }
    const cap = this.live ? this.minDt : 66;
    if (!this.last) this.last = now;
    const dt = now - this.last;
    if (dt < cap - 2) return;
    this.last = now;
    this.renderFrame(now, Math.min(dt, 100));
  }

  private renderFrame(now: number, dt: number) {
    const { canvas, rings, getSource, reduced } = this.o;
    // --- bandas
    const src = getSource();
    let bass = 0;
    let mid = 0;
    let high = 0;
    let fft: Float32Array | null = null;
    if (src) {
      const n = src.node.frequencyBinCount;
      if (this.spec.length !== n) this.spec = new Uint8Array(n);
      src.node.getByteFrequencyData(this.spec);
      const b = bandsFromSpectrum(this.spec, src.sampleRate, src.node.fftSize, this.sens);
      bass = b.bass;
      mid = b.mid;
      high = b.high;
      fft = logBins(this.spec, RING_BINS, src.sampleRate, src.node.fftSize);
    }
    // respiración de reposo: el cromo nunca está del todo quieto (salvo cuadro fijo)
    const sec = now / 1000;
    const calm = this.motion ? 1 : 0;
    bass = Math.max(bass, calm * (0.09 + 0.05 * Math.sin(sec * 0.8)));
    mid = Math.max(mid, calm * (0.07 + 0.04 * Math.sin(sec * 0.55 + 1)));
    high = Math.max(high, calm * (0.04 + 0.03 * Math.sin(sec * 1.1 + 2)));
    this.s.bass = follow(this.s.bass, bass, 0.62, 0.11);
    this.s.mid = follow(this.s.mid, mid, 0.5, 0.1);
    this.s.high = follow(this.s.high, high, 0.55, 0.14);
    this.s.energy = this.s.bass * 0.5 + this.s.mid * 0.3 + this.s.high * 0.2;
    const hit = src && this.live ? this.beatDet.update(bass, now) : 0;
    this.beat = Math.max(this.beat * Math.exp(-dt / 150), hit);
    if (this.motion) this.t += dt * 0.00011 * (1 + this.s.energy * 2.6);
    this.ptr.x += (this.ptr.tx - this.ptr.x) * 0.1;
    this.ptr.y += (this.ptr.ty - this.ptr.y) * 0.1;
    this.ptr.a += (this.ptr.ta - this.ptr.a) * 0.06;

    // --- capa 1: shader
    this.measure();
    const px = Math.min(this.quality * this.dpr, Math.sqrt((this.o.coarse ? 380_000 : 1_300_000) / (this.cssW * this.cssH)));
    const w = Math.max(2, Math.round(this.cssW * px));
    const h = Math.max(2, Math.round(this.cssH * px));
    const portrait = this.cssH > this.cssW;
    const ok = drawChromeAudio(canvas, {
      time: this.t,
      w,
      h,
      audio: { bass: this.s.bass, mid: this.s.mid, high: this.s.high, beat: this.beat },
      ptr: reduced && !this.motion ? undefined : [this.ptr.x, this.ptr.y],
      ptrAmt: this.motion ? this.ptr.a : 0,
      seed: [3.1, 1.7],
      scale: portrait ? 1.35 : 1.55,
      dim: 0.1,
    });
    if (ok && !this.ok) {
      this.ok = true;
      canvas.classList.add('is-live');
    }
    // --- capa 2: anillos
    this.drawRings(rings, fft, sec);
  }

  private drawRings(c: HTMLCanvasElement, fft: Float32Array | null, sec: number) {
    const dpr = Math.min(this.dpr, 1.5);
    const W = Math.max(2, Math.round(this.cssW * dpr));
    const H = Math.max(2, Math.round(this.cssH * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.26;
    const lw = Math.max(1.2, Math.min(W, H) / 640);
    g.lineJoin = 'round';
    g.lineCap = 'round';

    // espectro en anillo, simétrico
    for (let i = 0; i < RING_BINS; i++) this.ringV[i] = follow(this.ringV[i], fft ? fft[i] : 0, 0.55, 0.14);
    const n = RING_BINS * 2;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const idx = k < RING_BINS ? k : n - 1 - k;
      const v = this.ringV[idx];
      const a = (k / n) * Math.PI * 2 - Math.PI / 2;
      const r = R * 1.05 + Math.min(1, v * 1.15) ** 1.15 * R * 0.62;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.strokeStyle = this.colors.line;
    g.globalAlpha = 0.78;
    g.lineWidth = lw * 1.4;
    g.stroke();

    // anillo interior: respira con el grave
    g.globalAlpha = 0.5;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, R * 0.58 * (1 + this.s.bass * 0.24), 0, Math.PI * 2);
    g.stroke();

    // onda de golpe: sale del centro y se apaga
    if (this.beat > 0.02) {
      g.globalAlpha = this.beat * 0.55;
      g.lineWidth = lw * 1.2;
      g.beginPath();
      g.arc(cx, cy, R * (1.3 + (1 - this.beat) * 1.1), 0, Math.PI * 2);
      g.stroke();
    }

    // marcas de referencia (cuatro) y el único acento: un punto que gira
    g.globalAlpha = 0.35;
    g.strokeStyle = this.colors.dim;
    g.lineWidth = lw;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.34, cy + Math.sin(a) * R * 0.34);
      g.lineTo(cx + Math.cos(a) * R * 0.44, cy + Math.sin(a) * R * 0.44);
      g.stroke();
    }
    const spin = this.motion ? sec * 0.35 : 0.4;
    g.globalAlpha = 0.95;
    g.fillStyle = this.colors.accent;
    g.beginPath();
    g.arc(cx + Math.cos(spin) * R * 0.58 * (1 + this.s.bass * 0.24), cy + Math.sin(spin) * R * 0.58 * (1 + this.s.bass * 0.24), Math.max(2.5, R * 0.025), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
}
