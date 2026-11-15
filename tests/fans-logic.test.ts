import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdownParts, pad2, padDays } from '../src/lib/fans/countdown.ts';
import { shopDraft, newsletterDraft } from '../src/lib/fans/mail.ts';
import { buildMailto, fitsMailto } from '../src/lib/mailto.ts';
import { KONAMI, sequenceMatcher, tapMatcher } from '../src/lib/fans/konami.ts';
import { buildManifest, MANIFEST_ICONS } from '../src/lib/fans/manifest.ts';

test('cuenta regresiva: partes, cero y fecha pasada', () => {
  const now = Date.UTC(2027, 0, 1, 0, 0, 0);
  const p = countdownParts(now + ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 250, now);
  assert.deepEqual([p.done, p.days, p.hours, p.minutes, p.seconds], [false, 2, 3, 4, 5]);
  assert.equal(countdownParts(now, now).done, true);
  assert.equal(countdownParts(now - 5000, now).remaining, 0);
  assert.equal(countdownParts(Number.NaN, now).done, true);
  assert.equal(countdownParts(now + 999, now).seconds, 0, 'menos de un segundo = 0 s pero no terminó');
  assert.equal(countdownParts(now + 999, now).done, false);
  assert.equal(pad2(7), '07');
  assert.equal(padDays(9), '09');
  assert.equal(padDays(123), '123');
});

test('consulta de tienda: una línea por producto, nombre opcional y mailto válido', () => {
  const s = { to: 'a@b.c', subject: 'Consulta', hello: 'Hola,', intro: 'Me interesa:', nameLabel: 'Nombre', signoff: 'Gracias' };
  const d = shopDraft(s, ['Remera (Cromo)', 'Póster (Anillos)'], '  Sol ');
  assert.deepEqual(d.body, ['Hola,', '', 'Me interesa:', '- Remera (Cromo)', '- Póster (Anillos)', '', 'Nombre: Sol', '', 'Gracias']);
  assert.ok(!shopDraft(s, ['X']).body.includes('Nombre: '));
  const href = buildMailto(d);
  assert.ok(href.startsWith('mailto:a@b.c?subject=Consulta&body='));
  assert.ok(fitsMailto(d));
  assert.ok(decodeURIComponent(href).includes('- Póster (Anillos)'));
});

test('alta a la newsletter: idioma, temas y "todo" si no se elige ninguno', () => {
  const s = { to: 'a@b.c', subject: 'Alta', hello: 'Hola', nameLabel: 'Nombre', langLabel: 'Idioma', topicsLabel: 'Temas', anyTopic: 'Todo', signoff: 'Gracias' };
  assert.deepEqual(newsletterDraft(s, { lang: 'Español', topics: [] }).body, ['Hola', '', 'Idioma: Español', 'Temas: Todo', '', 'Gracias']);
  const d = newsletterDraft(s, { name: 'Sol', lang: 'Inglés', topics: ['Fechas', 'Mixes'] });
  assert.ok(d.body.includes('Nombre: Sol') && d.body.includes('Temas: Fechas, Mixes'));
});

test('código Konami: completo, con error en el medio y teclas en mayúscula', () => {
  const run = (keys: string[]) => {
    const feed = sequenceMatcher();
    return keys.map(feed).lastIndexOf(true);
  };
  assert.equal(run([...KONAMI]), KONAMI.length - 1);
  assert.equal(run(['ArrowUp', 'ArrowUp', 'x', ...KONAMI]), 12, 'una tecla equivocada reinicia y la secuencia completa después funciona');
  assert.equal(run(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A']), 9);
  assert.equal(run(KONAMI.slice(0, 9) as string[]), -1);
});

test('cinco toques seguidos: dentro de la ventana sí, espaciados no', () => {
  const quick = tapMatcher(5, 2000);
  assert.deepEqual([0, 300, 600, 900, 1200].map(quick), [false, false, false, false, true]);
  const slow = tapMatcher(5, 2000);
  assert.ok(![0, 1000, 2000, 3000, 4000].map(slow).includes(true));
});

test('manifest: start_url, scope e íconos respetan BASE_PATH', () => {
  const o = { name: 'Ailén Cachela', shortName: 'Ailén', description: 'd', lang: 'es', themeColor: '#050506', backgroundColor: '#050506' };
  const root = buildManifest({ ...o, base: '' });
  assert.equal(root.start_url, '/');
  assert.equal(root.scope, '/');
  assert.equal(root.icons[0].src, '/icons/icon-192.png');
  const sub = buildManifest({ ...o, base: '/ailen-cachela/', shortcuts: [{ name: 'Fechas', url: '/ailen-cachela/fechas/' }] });
  assert.equal(sub.start_url, '/ailen-cachela/');
  assert.equal(sub.scope, '/ailen-cachela/');
  assert.equal(sub.id, '/ailen-cachela/');
  assert.ok(sub.icons.every((i) => i.src.startsWith('/ailen-cachela/icons/')));
  assert.equal(sub.shortcuts[0].url, '/ailen-cachela/fechas/');
  assert.equal(sub.display, 'standalone');
  assert.ok(sub.icons.some((i) => i.purpose === 'maskable') && sub.icons.some((i) => i.sizes === '192x192') && sub.icons.some((i) => i.sizes === '512x512'));
  assert.equal(MANIFEST_ICONS.length, 3);
});
