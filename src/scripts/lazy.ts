/**
 * Carga diferida de módulos por elemento (componente LazyModule.astro).
 *   <div data-lazy="lab-sequencer" data-lazy-props='{"bpm":128}'>
 * importa src/scripts/modules/lab-sequencer.ts cuando el elemento se acerca al viewport y llama a su
 * export por defecto: (el: HTMLElement, props) => void | Promise<void>. Cada paquete agrega sus módulos
 * con su prefijo (modules/<paquete>-<nombre>.ts) sin tocar este archivo. Un módulo que falla no rompe la página.
 */
const loaders = import.meta.glob('./modules/*.ts') as Record<string, () => Promise<{ default?: (el: HTMLElement, props: Record<string, unknown>) => void | Promise<void> }>>;

async function run(el: HTMLElement) {
  if (el.dataset.lazyState) return;
  el.dataset.lazyState = 'loading';
  const name = el.dataset.lazy ?? '';
  const load = loaders[`./modules/${name}.ts`];
  if (!load) {
    el.dataset.lazyState = 'missing';
    console.warn(`[lazy] No existe src/scripts/modules/${name}.ts`);
    return;
  }
  try {
    let props: Record<string, unknown> = {};
    try {
      props = JSON.parse(el.dataset.lazyProps || '{}');
    } catch {
      /* props inválidas: se usan los valores por defecto del módulo */
    }
    const mod = await load();
    await mod.default?.(el, props);
    el.dataset.lazyState = 'ready';
  } catch (err) {
    el.dataset.lazyState = 'error';
    console.error(`[lazy] ${name}:`, err);
  }
}

export function setupLazy() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-lazy]'));
  if (!els.length) return;
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 600));
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            io?.unobserve(e.target);
            void run(e.target as HTMLElement);
          }
        },
        { rootMargin: '300px 0px' },
      )
    : null;
  for (const el of els) {
    if (el.dataset.lazyWhen === 'idle') idle(() => void run(el));
    else if (io) io.observe(el);
    else void run(el);
  }
}
