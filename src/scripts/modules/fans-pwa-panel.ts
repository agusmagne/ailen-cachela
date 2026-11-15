/** Panel "Modo sin conexión" de la página de privacidad: muestra el estado y permite desactivarlo y borrar la copia. */
import { clearAll, isDisabled, isRegistered, setDisabled, swSupported } from '../fans/sw-control';

export default async function (el: HTMLElement) {
  const panel = el.querySelector<HTMLElement>('[data-sw-panel]');
  const state = el.querySelector<HTMLElement>('[data-sw-state]');
  const btn = el.querySelector<HTMLButtonElement>('[data-sw-toggle]');
  if (!panel || !state || !btn) return;
  panel.hidden = false;

  const usable = import.meta.env.PROD && swSupported();
  if (!usable) {
    state.textContent = state.dataset.msgNone ?? '';
    return;
  }
  const render = async () => {
    const off = isDisabled();
    const on = !off && (await isRegistered());
    state.textContent = (off || !on ? state.dataset.msgOff : state.dataset.msgOn) ?? '';
    btn.hidden = false;
    btn.textContent = off ? (btn.dataset.labelEnable ?? '') : (btn.dataset.labelDisable ?? '');
    btn.dataset.mode = off ? 'enable' : 'disable';
  };
  btn.addEventListener('click', async () => {
    if (btn.dataset.mode === 'enable') {
      setDisabled(false);
      await render();
      state.textContent = btn.dataset.doneOn ?? '';
    } else {
      setDisabled(true);
      await clearAll();
      await render();
      state.textContent = btn.dataset.doneOff ?? '';
    }
  });
  await render();
}
