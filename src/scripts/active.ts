/**
 * Un solo canvas animado a la vez. El hero (WebGL), las portadas generativas y el
 * moiré se registran acá; cada uno avisa si "quiere correr" (está en pantalla, o
 * lo toca el dedo / el mouse) y el árbitro deja correr solo a uno. El último en
 * pedirlo gana; si el ganador se va, corre otro de los que sigan en pantalla.
 * También pausa todo con la pestaña oculta y retoma el activo al volver.
 */
interface Runner {
  wants: boolean;
  run: () => void;
  pause: () => void;
}

const runners = new Map<string, Runner>();
let current = '';

function take(id: string) {
  if (current && current !== id) runners.get(current)?.pause();
  current = id;
  if (!document.hidden) runners.get(id)?.run();
}

function leave(id: string) {
  runners.get(id)?.pause();
  if (current !== id) return;
  current = '';
  for (const [k, r] of runners) {
    if (r.wants) {
      take(k);
      break;
    }
  }
}

export function register(id: string, run: () => void, pause: () => void) {
  const entry: Runner = { wants: false, run, pause };
  runners.set(id, entry);
  return {
    want(on: boolean) {
      if (entry.wants === on) return;
      entry.wants = on;
      on ? take(id) : leave(id);
    },
    isCurrent: () => current === id,
  };
}

document.addEventListener('visibilitychange', () => {
  if (!current) return;
  const r = runners.get(current);
  if (!r) return;
  document.hidden ? r.pause() : r.run();
});
