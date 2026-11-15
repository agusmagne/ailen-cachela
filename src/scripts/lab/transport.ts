/**
 * Transporte del secuenciador: reloj con anticipación (lookahead). Un setInterval corto programa los pasos que caen
 * en los próximos ~140 ms con el tiempo EXACTO del reloj de audio; el timer solo "despierta", no marca el ritmo.
 * La planificación es pura (src/lib/lab/timing.ts, con pruebas). Con la pestaña oculta el motor se para (ver audio.ts).
 */
import { planSteps, type PlanState, type PlannedStep } from '../../lib/lab/timing';

export interface TransportOptions {
  ctx: BaseAudioContext;
  getBpm: () => number;
  getSwing: () => number;
  onStep: (ev: PlannedStep) => void;
  lookahead?: number;
  interval?: number;
}

export class Transport {
  private timer = 0;
  private state: PlanState = { grid: 0, abs: 0 };
  running = false;

  constructor(private o: TransportOptions) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.state = { grid: this.o.ctx.currentTime + 0.07, abs: 0 };
    this.tick();
    this.timer = window.setInterval(() => this.tick(), this.o.interval ?? 25);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  private tick() {
    try {
      const { events, state } = planSteps(this.state, {
        now: this.o.ctx.currentTime,
        lookahead: this.o.lookahead ?? 0.14,
        bpm: this.o.getBpm(),
        swing: this.o.getSwing(),
      });
      this.state = state;
      for (const ev of events) this.o.onStep(ev);
    } catch (err) {
      console.error('[lab] transporte:', err);
    }
  }
}
