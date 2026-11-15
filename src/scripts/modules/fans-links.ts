/**
 * Link-in-bio: muestra "Compartir" solo si el navegador tiene Web Share API (MDN: navigator.share exige HTTPS y un gesto).
 * Si el usuario cancela o falla, no pasa nada: queda "Copiar enlace".
 */
export default function (el: HTMLElement, props: Record<string, unknown>) {
  const btn = el.querySelector<HTMLButtonElement>('[data-share]');
  if (!btn || typeof navigator.share !== 'function') return;
  const data = { title: String(props.title ?? document.title), url: String(props.url ?? location.href) };
  if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    navigator.share(data).catch(() => {
      /* cancelado por la persona o no disponible: el enlace se puede copiar */
    });
  });
}
