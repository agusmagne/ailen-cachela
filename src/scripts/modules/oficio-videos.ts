/** Filtro por categoría de la grilla de videos (paquete oficio). Sin JS la grilla se ve completa y los chips quedan ocultos. */
import { filterVideos, type VideoCategory, type VideoLike } from '../../lib/oficio/videos.ts';

interface Props {
  all: string;
  shown: string;
}

export default function init(el: HTMLElement, raw: Record<string, unknown>) {
  const p = raw as unknown as Props;
  const bar = el.querySelector<HTMLElement>('[data-vf]');
  const status = el.querySelector<HTMLElement>('[data-vf-status]');
  const items = Array.from(el.querySelectorAll<HTMLElement>('.vitem[data-cat]'));
  if (!bar || !items.length) return;
  bar.hidden = false;
  const model: (VideoLike & { el: HTMLElement })[] = items.map((node, i) => ({ id: String(i), category: node.dataset.cat as VideoCategory, year: 0, el: node }));
  const buttons = Array.from(bar.querySelectorAll<HTMLButtonElement>('button[data-cat]'));

  const apply = (cat: VideoCategory | 'all') => {
    const keep = new Set(filterVideos(model, cat).map((m) => m.id));
    model.forEach((m) => {
      m.el.hidden = !keep.has(m.id);
    });
    buttons.forEach((b) => {
      const on = b.dataset.cat === cat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (status) status.textContent = p.shown.replace('{n}', String(keep.size));
  };
  buttons.forEach((b) => b.addEventListener('click', () => apply((b.dataset.cat ?? 'all') as VideoCategory | 'all')));
}
