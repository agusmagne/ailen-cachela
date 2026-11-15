// Pieza de og:image y apple-touch-icon. Se compila y se captura con Chrome headless
// (scripts/make-og.mjs). Usa el mismo shader de metal líquido y las mismas variables
// de tokens.css que el sitio: no hay imágenes de terceros ni de stock.
import { drawChromeStill } from '../../src/scripts/chrome';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

async function og(name: string, city: string) {
  await Promise.all([document.fonts.load('800 100px "Archivo Cachela"'), document.fonts.load('500 20px "Martian Mono Cachela"')]);
  const W = 1200;
  const H = 630;
  const c = document.getElementById('c') as HTMLCanvasElement;
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = css('--void');
  ctx.fillRect(0, 0, W, H);

  const still = document.createElement('canvas');
  still.width = W;
  still.height = H;
  drawChromeStill(still, [3.1, 1.7], 9.3, 1.55, 0.06);
  ctx.drawImage(still, 0, 0);

  // velo: negro a la izquierda (texto) y abajo
  const gx = ctx.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(2,2,3,0.88)');
  gx.addColorStop(0.55, 'rgba(2,2,3,0.35)');
  gx.addColorStop(1, 'rgba(2,2,3,0)');
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, W, H);
  const gy = ctx.createLinearGradient(0, H * 0.5, 0, H);
  gy.addColorStop(0, 'rgba(2,2,3,0)');
  gy.addColorStop(1, 'rgba(2,2,3,0.7)');
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, W, H);

  // aros concéntricos (un aro con el acento)
  ctx.save();
  ctx.translate(930, 300);
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, 40 + i * 30, 0, Math.PI * 2);
    ctx.strokeStyle = i === 3 ? css('--accent') : css('--chrome-100');
    ctx.globalAlpha = i === 3 ? 0.95 : 0.16;
    ctx.lineWidth = i === 3 ? 2 : 1;
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // marcas de registro
  ctx.strokeStyle = css('--chrome-200');
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  const m = 36;
  const l = 22;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * l);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * l, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // nombre: letrero cromado (degradé vertical con horizonte), como el hero del sitio
  const words = name.toUpperCase().split(' ');
  const size = 142;
  const lh = size * 0.92;
  (ctx as unknown as { fontStretch: string }).fontStretch = 'expanded';
  ctx.font = `800 ${size}px "Archivo Cachela"`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${-0.015 * size}px`;
  ctx.textBaseline = 'alphabetic';
  const baseY = H - 92;
  words.forEach((w, i) => {
    const y = baseY - (words.length - 1 - i) * lh;
    const top = y - size * 0.74;
    const g = ctx.createLinearGradient(0, top, 0, y);
    g.addColorStop(0, css('--chrome-50'));
    g.addColorStop(0.36, css('--chrome-200'));
    g.addColorStop(0.52, css('--chrome-400'));
    g.addColorStop(0.58, css('--chrome-200'));
    g.addColorStop(1, css('--chrome-50'));
    ctx.fillStyle = g;
    ctx.fillText(w, 64, y);
  });

  (ctx as unknown as { fontStretch: string }).fontStretch = 'normal';
  ctx.font = `500 20px "Martian Mono Cachela"`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = '2.4px';
  ctx.fillStyle = css('--chrome-100');
  ctx.fillText(city.toUpperCase(), 64, 92);
  const tw = ctx.measureText(city.toUpperCase()).width;
  ctx.fillStyle = css('--chrome-400');
  ctx.fillRect(64 + tw + 18, 85, 56, 1.5);
  document.title = 'done';
}

og(document.body.dataset.name ?? '', document.body.dataset.city ?? '');
