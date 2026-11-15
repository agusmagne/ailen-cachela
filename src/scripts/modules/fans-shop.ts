/**
 * Tienda de ejemplo: filtro por tipo y armado de una sola consulta por mail con varias piezas.
 * Mejora progresiva: sin JS se ven todas las fichas y cada una trae su enlace de consulta.
 * No guarda nada (ni siquiera en el navegador) y no envía nada: el mail lo manda la persona desde su programa.
 */
import { shopDraft, buildMailto, plainDraft, fitsMailto } from '../../lib/fans/mail.ts';

interface Props {
  to: string;
  subject: string;
  hello: string;
  intro: string;
  nameLabel: string;
  signoff: string;
  count: string;
  shown: string;
}

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export default function (root: HTMLElement, raw: Record<string, unknown>) {
  const props = raw as unknown as Props;
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-product]'));
  const filters = root.querySelector<HTMLElement>('[data-filters]');
  const status = root.querySelector<HTMLElement>('[data-filter-status]');
  const tray = root.querySelector<HTMLElement>('[data-tray]');
  const mailLink = root.querySelector<HTMLAnchorElement>('[data-tray-mail]');
  const copyBtn = root.querySelector<HTMLButtonElement>('[data-tray] [data-copy]');
  const count = root.querySelector<HTMLElement>('[data-tray-count]');
  const nameInput = root.querySelector<HTMLInputElement>('[data-tray-name]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-tray-clear]');
  const picked = new Set<string>();

  /* ---- Filtro ---------------------------------------------------------------- */
  if (filters) {
    filters.hidden = false;
    if (status) status.hidden = false;
    const apply = (kind: string) => {
      let n = 0;
      for (const c of cards) {
        const show = kind === 'all' || c.dataset.kind === kind;
        c.hidden = !show;
        if (show) n++;
      }
      filters.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
        const on = b.dataset.filter === kind;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      if (status) status.textContent = fill(props.shown, { n, total: cards.length });
    };
    filters.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-filter]');
      if (b) apply(b.dataset.filter ?? 'all');
    });
    apply('all');
  }

  /* ---- Consulta con varias piezas -------------------------------------------------- */
  if (!tray || !mailLink) return;
  const draftFor = () => {
    const items = cards.filter((c) => picked.has(c.dataset.id ?? '')).map((c) => c.dataset.name ?? '');
    return shopDraft(props, items, nameInput?.value ?? '');
  };
  const refresh = () => {
    tray.hidden = picked.size === 0;
    if (picked.size === 0) return;
    const draft = draftFor();
    mailLink.href = buildMailto(draft);
    mailLink.toggleAttribute('data-too-long', !fitsMailto(draft));
    if (copyBtn) copyBtn.dataset.copy = plainDraft(draft);
    if (count) count.textContent = fill(props.count, { n: picked.size });
  };
  const toggle = (card: HTMLElement, btn: HTMLButtonElement) => {
    const id = card.dataset.id ?? '';
    const on = !picked.has(id);
    on ? picked.add(id) : picked.delete(id);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? (btn.dataset.labelRemove ?? '') : (btn.dataset.labelAdd ?? '');
    refresh();
  };
  for (const c of cards) {
    const btn = c.querySelector<HTMLButtonElement>('[data-add]');
    if (!btn) continue;
    btn.hidden = false;
    btn.addEventListener('click', () => toggle(c, btn));
  }
  nameInput?.addEventListener('input', refresh);
  clearBtn?.addEventListener('click', () => {
    picked.clear();
    cards.forEach((c) => {
      const btn = c.querySelector<HTMLButtonElement>('[data-add]');
      if (!btn) return;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = btn.dataset.labelAdd ?? '';
    });
    refresh();
  });
}
