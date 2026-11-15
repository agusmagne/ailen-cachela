/** Detector de secuencias de teclas (puro). El código Konami clásico es el que usa el easter egg. */
export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'] as const;

const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);

/** Devuelve `feed(key)`: true cuando la secuencia se completa (y se reinicia). Una tecla equivocada reinicia (salvo que sea el inicio). */
export function sequenceMatcher(sequence: readonly string[] = KONAMI) {
  let i = 0;
  return (key: string): boolean => {
    const k = norm(key);
    if (k === sequence[i]) i++;
    else i = k === sequence[0] ? 1 : 0;
    if (i === sequence.length) {
      i = 0;
      return true;
    }
    return false;
  };
}

/** Toques repetidos: true al llegar a `count` toques con menos de `windowMs` entre el primero y el último. */
export function tapMatcher(count = 5, windowMs = 2200) {
  const times: number[] = [];
  return (now: number): boolean => {
    times.push(now);
    while (times.length > count) times.shift();
    if (times.length === count && now - times[0] <= windowMs) {
      times.length = 0;
      return true;
    }
    return false;
  };
}
