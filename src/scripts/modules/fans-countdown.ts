/**
 * Cuenta regresiva de un drop. Mejora progresiva: sin JS queda la fecha escrita. Se actualiza una vez por segundo
 * mientras la pestaña está visible y, al llegar a cero, cambia al estado "abierto". El reloj es role="timer"
 * (no se anuncia a los lectores de pantalla en cada tick).
 */
import { countdownParts, pad2, padDays } from '../../lib/fans/countdown.ts';

export default function (el: HTMLElement, props: Record<string, unknown>) {
  const target = Date.parse(String(props.target ?? ''));
  const clock = el.querySelector<HTMLElement>('[data-clock]');
  const open = el.querySelector<HTMLElement>('[data-open]');
  if (!clock || Number.isNaN(target)) return;
  const cells = Object.fromEntries(['days', 'hours', 'minutes', 'seconds'].map((u) => [u, clock.querySelector<HTMLElement>(`[data-unit="${u}"]`)])) as Record<string, HTMLElement | null>;

  let timer = 0;
  const tick = () => {
    const p = countdownParts(target, Date.now());
    if (p.done) {
      clock.hidden = true;
      if (open) open.hidden = false;
      stop();
      return;
    }
    clock.hidden = false;
    if (cells.days) cells.days.textContent = padDays(p.days);
    if (cells.hours) cells.hours.textContent = pad2(p.hours);
    if (cells.minutes) cells.minutes.textContent = pad2(p.minutes);
    if (cells.seconds) cells.seconds.textContent = pad2(p.seconds);
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    if (timer) return;
    tick();
    timer = window.setInterval(tick, 1000);
  };

  start();
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}
