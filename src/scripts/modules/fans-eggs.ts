/**
 * Detalles escondidos (nada de esto cambia el contenido ni se anuncia solo):
 *  - Mensaje en la consola del navegador, una vez por carga, sin datos personales.
 *  - Código Konami (↑ ↑ ↓ ↓ ← → ← → B A) o, en pantallas táctiles, cinco toques seguidos sobre la firma gigante
 *    del pie (o cualquier elemento con data-egg-tap): "modo cromo", un velo que invierte la página unos segundos.
 * No se activa solo, el cartel es aria-hidden, respeta prefers-reduced-motion (solo cartel, sin velo) y no corre
 * mientras se escribe en un campo de texto.
 */
import '../fans/eggs.css';
import { sequenceMatcher, tapMatcher } from '../../lib/fans/konami.ts';

let busy = false;

function chromeMode(message: string) {
  if (busy) return;
  busy = true;
  const veil = document.createElement('div');
  veil.className = 'fans-egg-veil';
  veil.setAttribute('aria-hidden', 'true');
  const toast = document.createElement('div');
  toast.className = 'fans-egg-toast';
  toast.setAttribute('aria-hidden', 'true');
  toast.textContent = message;
  document.body.append(veil, toast);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    veil.remove();
    toast.remove();
    busy = false;
  }, reduce ? 2000 : 2500);
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function (_el: HTMLElement, props: Record<string, unknown>) {
  const message = String(props.message ?? 'Chrome mode');
  const hint = String(props.hint ?? '');

  console.info(
    '%c◯%c AILÉN CACHELA %c\n%s',
    'color:#e58fd2;font-size:18px',
    'background:#050506;color:#f4f6f9;padding:2px 8px;font:600 12px ui-monospace,monospace;letter-spacing:.12em',
    'color:inherit',
    hint,
  );

  const konami = sequenceMatcher();
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (konami(e.key)) chromeMode(message);
  });

  const taps = tapMatcher(5, 2200);
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.closest('.footer__mark, [data-egg-tap]') && taps(Date.now())) chromeMode(message);
  });
}
