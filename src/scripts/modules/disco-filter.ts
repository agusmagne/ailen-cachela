/**
 * Filtro de la discografía (mejora progresiva). Sin JS la lista se ve entera y la barra de chips queda oculta.
 * El estado vive en el hash (#k=ep&y=2026): es compartible y funciona con atrás/adelante.
 */
import { buildHash, matches, parseHash, toggle, type FilterKey, type FilterState } from '../../lib/disco/filter';

interface Props {
  total: number;
  countText: string;
}

export default function init(root: HTMLElement, props: Props) {
  const bar = root.querySelector<HTMLElement>('[data-filter-bar]');
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-release]'));
  const count = root.querySelector<HTMLElement>('[data-filter-count]');
  const none = root.querySelector<HTMLElement>('[data-filter-none]');
  const list = root.querySelector<HTMLElement>('[data-filter-list]');
  if (!bar || !items.length) return;
  bar.hidden = false;
  const chips = Array.from(bar.querySelectorAll<HTMLAnchorElement>('[data-filter-key]'));
  const reset = root.querySelector<HTMLAnchorElement>('[data-filter-reset]');
  const known = new Set(chips.map((c) => `${c.dataset.filterKey}=${c.dataset.filterValue}`));

  const clean = (s: FilterState): FilterState => {
    const out: FilterState = {};
    for (const k of ['k', 'y', 'l'] as FilterKey[]) if (s[k] && known.has(`${k}=${s[k]}`)) out[k] = s[k];
    return out;
  };

  let state: FilterState = clean(parseHash(location.hash));

  function apply() {
    let shown = 0;
    for (const el of items) {
      const ok = matches(state, { kind: el.dataset.kind ?? '', year: el.dataset.year ?? '', label: el.dataset.label ?? '' });
      el.hidden = !ok;
      if (ok) shown++;
    }
    for (const chip of chips) {
      const key = chip.dataset.filterKey as FilterKey;
      const value = chip.dataset.filterValue ?? '';
      const active = value ? state[key] === value : !state[key];
      chip.classList.toggle('is-selected', active);
      if (active) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
      chip.setAttribute('href', `#${buildHash(toggle(state, key, value))}`);
    }
    reset?.setAttribute('href', '#');
    if (count) count.textContent = props.countText.replace('{shown}', String(shown)).replace('{total}', String(props.total));
    if (none) none.hidden = shown !== 0;
    if (list) list.hidden = shown === 0;
  }

  const write = (next: FilterState) => {
    state = next;
    const h = buildHash(state);
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
    apply();
  };

  bar.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-filter-key]');
    if (!chip) return;
    e.preventDefault();
    write(toggle(state, chip.dataset.filterKey as FilterKey, chip.dataset.filterValue ?? ''));
  });
  reset?.addEventListener('click', (e) => {
    e.preventDefault();
    write({});
  });
  window.addEventListener('hashchange', () => {
    state = clean(parseHash(location.hash));
    apply();
  });
  apply();
}
