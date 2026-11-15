// Módulo de ejemplo del kit de componentes (src/pages/kit): demuestra el patrón LazyModule.
export default function (el: HTMLElement, props: Record<string, unknown>) {
  el.dataset.hello = String(props.name ?? 'mundo');
  const out = el.querySelector('[data-hello-out]');
  if (out) out.textContent = `Módulo cargado al entrar en pantalla: hola, ${props.name ?? 'mundo'}.`;
}
