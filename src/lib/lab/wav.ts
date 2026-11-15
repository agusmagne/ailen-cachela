/**
 * Codificador WAV PCM de 16 bits y utilidades de nivel. PURO: sirve para exportar el patrón
 * (OfflineAudioContext) y para el WAV silencioso con el que se registra la Media Session.
 */

/** Pico absoluto de un conjunto de canales. */
export function peakOf(channels: ArrayLike<ArrayLike<number>>): number {
  let p = 0;
  for (const ch of Array.from(channels)) for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i]));
  return p;
}

/** Normaliza en el lugar al pico `target` (por defecto -1 dBFS ≈ 0,891). Si el pico es ~0 no toca nada. Devuelve la ganancia aplicada. */
export function normalizePeak(channels: Float32Array[], target = 0.891): number {
  const peak = peakOf(channels);
  if (peak < 1e-5) return 1;
  const g = target / peak;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return g;
}

/** WAV PCM 16 bits little endian, canales intercalados. Cabecera de 44 bytes. */
export function encodeWav(channels: ArrayLike<number>[], sampleRate: number): ArrayBuffer {
  const nch = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * nch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, nch, true);
  v.setUint32(24, Math.round(sampleRate), true);
  v.setUint32(28, Math.round(sampleRate) * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
      o += 2;
    }
  }
  return buf;
}

/** Silencio mono de `seconds` s (para mantener viva una sesión de audio de medios). */
export function silentWav(seconds = 1, sampleRate = 8000): ArrayBuffer {
  return encodeWav([new Float32Array(Math.max(1, Math.round(seconds * sampleRate)))], sampleRate);
}
