/**
 * Cuenta regresiva de un lanzamiento (mejora progresiva: sin JS queda la fecha escrita).
 * El marcado trae los elementos [data-cd-d|h|m|s] y [data-cd-done]. `target` es el instante en ms UTC.
 */
import { remaining } from '../../lib/disco/countdown';

interface Props {
  target: number;
}

export default function init(root: HTMLElement, props: Props) {
  const get = (k: string) => root.querySelector<HTMLElement>(`[data-cd-${k}]`);
  const d = get('d'), h = get('h'), m = get('m'), s = get('s');
  const clock = get('clock');
  const done = get('done');
  if (!d || !h || !m || !s) return;
  const pad = (n: number) => String(n).padStart(2, '0');
  let id = 0;
  const tick = () => {
    const r = remaining(props.target, Date.now());
    if (r.done) {
      clearInterval(id);
      if (clock) clock.hidden = true;
      if (done) done.hidden = false;
      return;
    }
    d.textContent = String(r.days);
    h.textContent = pad(r.hours);
    m.textContent = pad(r.minutes);
    s.textContent = pad(r.seconds);
  };
  if (clock) clock.hidden = false;
  tick();
  id = window.setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
}
