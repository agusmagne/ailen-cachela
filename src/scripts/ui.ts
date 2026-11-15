// Comportamiento de los componentes compartidos (src/components/ui/): pestañas y fachadas de embed.
// Mejora progresiva: sin JS los paneles de Tabs se ven apilados y las fachadas de Embed son links.
import { buzz } from './mobile';

/* ---- Pestañas (patrón WAI-ARIA con activación automática) ------------------------------------- */
export function setupTabs() {
  document.querySelectorAll<HTMLElement>('[data-tabs]').forEach((root) => {
    const list = root.querySelector<HTMLElement>('[data-tabs-list]');
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));
    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
    if (!list || !tabs.length || tabs.length !== panels.length) return;
    list.hidden = false;
    root.classList.add('is-enhanced');
    const select = (id: string, focus = false) => {
      tabs.forEach((t) => {
        const on = t.dataset.tab === id;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      panels.forEach((p) => (p.hidden = p.dataset.panel !== id));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t.dataset.tab ?? ''));
      t.addEventListener('keydown', (e) => {
        const k = e.key;
        const next = k === 'ArrowRight' || k === 'ArrowDown' ? i + 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length].dataset.tab ?? '', true);
      });
    });
    select(root.dataset.initial || tabs[0].dataset.tab || '');
  });
}

/* ---- Fachadas de embed: el iframe se crea recién al hacer clic --------------------------------- */
export function setupEmbeds() {
  document.querySelectorAll<HTMLAnchorElement>('a[data-embed]').forEach((a) => {
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const src = a.dataset.embedSrc;
      if (!src) return;
      e.preventDefault();
      const yt = a.dataset.embedKind === 'youtube';
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = a.dataset.embedTitle ?? '';
      iframe.className = 'embed__frame';
      iframe.allow = yt ? 'autoplay; encrypted-media; picture-in-picture; fullscreen' : 'autoplay';
      if (yt) iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.setAttribute('frameborder', '0');
      if (!yt) iframe.setAttribute('scrolling', 'no');
      buzz(6);
      a.replaceWith(iframe);
      iframe.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('embed:live', { detail: { kind: a.dataset.embedKind } }));
    });
  });
}
