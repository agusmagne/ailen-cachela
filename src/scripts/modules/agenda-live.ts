/**
 * Mejoras en vivo de las páginas de fechas (módulo diferido, ver LazyModule). Todo lo que hace tiene su versión
 * estática en el HTML del build: la fecha y la hora se leen igual sin JS, la tabla de zonas ya está calculada y los
 * botones de compartir quedan ocultos si el navegador no puede compartir (queda "Copiar enlace", que ya anda).
 *  - Cuenta regresiva: cada segundo con movimiento permitido; cada minuto y sin segundos con prefers-reduced-motion.
 *  - Compartir con la Web Share API.
 *  - Conversor de zona horaria: tu zona y un selector con todas las que conoce el navegador.
 *  - Mapa: al pasar por una ciudad de la lista se resalta su punto.
 */
import { EVENT_TZ, ZONES, calendarDaysUntil, convert, countdown } from '../../lib/agenda/time.ts';

interface Props {
  lang: 'es' | 'en';
  labels: Record<string, string>;
}

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export default function init(root: HTMLElement, props: Props) {
  const P = { lang: props.lang === 'en' ? 'en' : 'es', labels: props.labels ?? {} } as const;
  root.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => countdownEl(el, P));
  root.querySelectorAll<HTMLElement>('[data-share]').forEach((el) => shareEl(el as HTMLButtonElement));
  root.querySelectorAll<HTMLElement>('[data-zones]').forEach((el, i) => zonesEl(el, P, i));
  root.querySelectorAll<HTMLElement>('[data-agenda-map]').forEach(mapEl);
}

type P = { lang: 'es' | 'en'; labels: Record<string, string> };

/* ---- Cuenta regresiva ------------------------------------------------------------------------ */
function countdownEl(el: HTMLElement, p: P) {
  const start = Number(el.dataset.start);
  const end = Number(el.dataset.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const tz = el.dataset.tz || EVENT_TZ;
  const grid = el.querySelector<HTMLElement>('[data-cd-grid]');
  const state = el.querySelector<HTMLElement>('[data-cd-state]');
  const sr = el.querySelector<HTMLElement>('[data-cd-sr]');
  const cell = (k: string) => el.querySelector<HTMLElement>(`[data-cd="${k}"]`);
  const secWrap = el.querySelector<HTMLElement>('[data-cd-cell="seconds"]');
  if (!grid) return;

  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let timer = 0;
  let lastMinute = -1;

  const render = () => {
    const now = Date.now();
    const c = countdown(start, end, now);
    if (c.phase !== 'upcoming') {
      grid.hidden = true;
      if (state) {
        state.hidden = false;
        state.textContent = c.phase === 'live' ? p.labels.live : p.labels.past;
        state.dataset.phase = c.phase;
      }
      if (sr) sr.textContent = c.phase === 'live' ? p.labels.live : p.labels.past;
      return c.phase === 'live'; // en curso sigue vigilando hasta que termine; pasada ya no hace falta
    }
    grid.hidden = false;
    const set = (k: string, n: number, min = 2) => {
      const node = cell(k);
      const txt = String(n).padStart(min, '0');
      if (node && node.textContent !== txt) node.textContent = txt;
    };
    set('days', c.days);
    set('hours', c.hours);
    set('minutes', c.minutes);
    set('seconds', c.seconds);
    if (secWrap) secWrap.hidden = mq.matches;
    if (state) {
      const d = calendarDaysUntil(now, start, tz);
      const txt = d === 0 ? p.labels.today : d === 1 ? p.labels.tomorrow : '';
      state.hidden = !txt;
      state.textContent = txt;
      state.dataset.phase = 'upcoming';
    }
    const minute = Math.floor(now / 60000);
    if (sr && minute !== lastMinute) {
      lastMinute = minute;
      sr.textContent = fill(p.labels.sr, { days: c.days, hours: c.hours, minutes: c.minutes });
    }
    return true;
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (document.hidden) return;
    const alive = render();
    if (!alive) return;
    const step = mq.matches ? 60_000 : 1000;
    timer = window.setTimeout(schedule, step - (Date.now() % step) + 5);
  };
  document.addEventListener('visibilitychange', schedule);
  mq.addEventListener?.('change', schedule);
  schedule();
}

/* ---- Compartir ------------------------------------------------------------------------------------ */
function shareEl(btn: HTMLButtonElement) {
  if (typeof navigator.share !== 'function') return;
  const data = { title: btn.dataset.shareTitle ?? document.title, text: btn.dataset.shareText ?? '', url: btn.dataset.shareUrl ?? location.href };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) return;
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    try {
      await navigator.share(data);
    } catch (err) {
      // Cancelar el panel de compartir no es un error; cualquier otro caso deja "Copiar enlace" a mano.
      if ((err as DOMException)?.name !== 'AbortError') console.warn('[agenda] no se pudo compartir', err);
    }
  });
}

/* ---- Zonas horarias --------------------------------------------------------------------------------- */
function zonesEl(el: HTMLElement, p: P, index: number) {
  const start = Number(el.dataset.start);
  const base = el.dataset.base || EVENT_TZ;
  const slot = el.querySelector<HTMLElement>('[data-zones-live]');
  if (!slot || !Number.isFinite(start)) return;
  const L = p.labels;
  let detected = '';
  try {
    detected = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    detected = '';
  }

  const id = `agenda-zone-${index}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'label';
  label.textContent = L.pick;
  const select = document.createElement('select');
  select.id = id;
  select.className = 'input zones__select';
  const out = document.createElement('p');
  out.className = 'zones__out';
  out.setAttribute('role', 'status');

  const known = new Set(ZONES.map((z) => z.tz));
  const group = (title: string, items: { tz: string; text: string }[]) => {
    const g = document.createElement('optgroup');
    g.label = title;
    for (const it of items) {
      const o = document.createElement('option');
      o.value = it.tz;
      o.textContent = it.text;
      g.append(o);
    }
    return g;
  };
  if (detected) select.append(group(L.yours, [{ tz: detected, text: detected.replace(/_/g, ' ') }]));
  select.append(group(L.common, ZONES.map((z) => ({ tz: z.tz, text: z[p.lang] }))));
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    all = [];
  }
  const rest = all.filter((z) => !known.has(z) && z !== detected);
  if (rest.length) select.append(group(L.all, rest.map((tz) => ({ tz, text: tz.replace(/_/g, ' ') }))));
  if (detected) select.value = detected;

  const update = () => {
    try {
      const v = convert(start, select.value, base, p.lang);
      const delta = v.dayDelta === 0 ? '' : ` · ${v.dayDelta > 0 ? L.dayNext : L.dayPrev}`;
      out.textContent = fill(L.out, { date: v.date, time: v.time, offset: v.offset }) + delta;
    } catch {
      out.textContent = '';
    }
  };
  select.addEventListener('change', update);
  update();
  slot.append(label, select, out);
  slot.hidden = false;
}

/* ---- Mapa: resaltar el punto de una ciudad de la lista ------------------------------------------------------ */
function mapEl(fig: HTMLElement) {
  const pins = new Map<string, Element>();
  fig.querySelectorAll('[data-pin]').forEach((n) => pins.set((n as HTMLElement).dataset.pin ?? '', n));
  const set = (key: string | undefined, on: boolean) => {
    if (!key) return;
    pins.get(key)?.classList.toggle('is-active', on);
  };
  fig.querySelectorAll<HTMLElement>('[data-map-key]').forEach((li) => {
    const key = li.dataset.mapKey;
    li.addEventListener('pointerenter', () => set(key, true));
    li.addEventListener('pointerleave', () => set(key, false));
    li.addEventListener('focusin', () => set(key, true));
    li.addEventListener('focusout', () => set(key, false));
  });
}
