import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanLine, cleanMultiline, firstHttpUrl, linkify, parseLocation, parseTitle, safeHttpUrl, showEndTime, showTime, lookupCountry, countryLabel } from '../src/lib/show-map.ts';
import { byTitle, shows } from './helpers.ts';

test('evento real: título, ciudad sin código postal, región, país, mapa, URL y notas', () => {
  const [s] = shows('real-event.ics');
  assert.equal(s.title, 'Amazonia');
  assert.equal(s.status, 'scheduled');
  assert.equal(s.address, 'Yrigoyen 1524');
  assert.equal(s.city, 'Tandil');
  assert.equal(s.region, 'Provincia de Buenos Aires');
  assert.equal(s.country, 'Argentina');
  assert.equal(s.countryCode, 'AR');
  assert.equal(s.location, null);
  assert.equal(s.mapUrl, 'https://www.google.com/maps/search/?api=1&query=-37.316024,-59.144584');
  assert.equal(s.url, 'https://www.youtube.com/');
  assert.equal(s.notes, 'Toco en Amazonia, nos vemos allá! Entradas en el link!');
  assert.equal(showTime(s), '23:00');
  assert.equal(showEndTime(s), null, 'cruza la medianoche: solo el inicio');
});

test('prefijos de estado: sin mayúsculas ni acentos, en corchetes, paréntesis o con ":"', () => {
  const list = shows('statuses.ics');
  assert.deepEqual([byTitle(list, 'Club Uno').status, byTitle(list, 'Club Dos').status, byTitle(list, 'Club Tres').status], ['soldout', 'cancelled', 'cancelled']);
  assert.equal(byTitle(list, 'Club Cuatro').status, 'soldout');
  assert.equal(byTitle(list, 'Club Cinco').status, 'cancelled', 'cancelado gana sobre agotado');
  assert.equal(byTitle(list, 'Agotado Club Seis').status, 'scheduled', 'sin delimitador no es un prefijo');
  assert.equal(byTitle(list, 'Club Siete').status, 'soldout');
});

test('parseTitle: el título que se muestra no lleva el prefijo', () => {
  assert.deepEqual(parseTitle('[SOLD OUT] Fabrik'), { title: 'Fabrik', status: 'soldout' });
  assert.deepEqual(parseTitle('  [ Cancelada ]  Fabrik'), { title: 'Fabrik', status: 'cancelled' });
  assert.deepEqual(parseTitle('[AGOTADO][CANCELADO] X'), { title: 'X', status: 'cancelled' });
  assert.deepEqual(parseTitle('Fabrik [agotado]'), { title: 'Fabrik [agotado]', status: null });
});

test('día completo: sin hora', () => {
  const list = shows('all-day.ics');
  const s = byTitle(list, 'Festival Costa');
  assert.equal(s.allDay, true);
  assert.equal(showTime(s), null);
  assert.equal(s.city, 'Mar del Plata');
  assert.equal(s.countryCode, 'AR');
});

test('ubicación: una línea, solo un lugar, nombre+calle, EE.UU., país en español, sin confianza', () => {
  const list = shows('location-oneline.ics');
  const uno = byTitle(list, 'Uno');
  assert.deepEqual([uno.address, uno.city, uno.region, uno.countryCode], ['Av. Corrientes 1234', 'Buenos Aires', null, 'AR']);
  const dos = byTitle(list, 'Dos');
  assert.deepEqual([dos.city, dos.location], [null, 'Amazonia'], 'solo un lugar: se muestra tal cual');
  const tres = byTitle(list, 'Tres');
  assert.deepEqual([tres.address, tres.city, tres.region], ['Amazonia Club, Yrigoyen 1524', 'Tandil', 'Provincia de Buenos Aires']);
  const cuatro = byTitle(list, 'Cuatro');
  assert.deepEqual([cuatro.address, cuatro.city, cuatro.region, cuatro.countryCode], ['123 Main St', 'Austin', 'TX', 'US']);
  const cinco = byTitle(list, 'Cinco');
  assert.deepEqual([cinco.address, cinco.city, cinco.countryCode], ['Fabrik', 'Madrid', 'ES']);
  const seis = byTitle(list, 'Seis');
  assert.deepEqual([seis.city, seis.location], [null, 'Un lugar, otro lugar'], 'ambiguo y sin país: no se inventa');
});

test('parseLocation: casos sueltos', () => {
  assert.equal(parseLocation('').city, null);
  assert.equal(parseLocation('B7627 Tandil').city, 'Tandil', 'el código postal con prefijo alcanza para inferir la ciudad');
  assert.equal(parseLocation('Calle 1\n7000 Tandil\nBuenos Aires\nArgentina').city, 'Tandil');
  assert.equal(parseLocation('1234 Main St, Austin').city, null);
  assert.equal(parseLocation('Argentina').location, 'Argentina');
});

test('países en es/en y etiqueta localizada', () => {
  assert.equal(lookupCountry('España'), 'ES');
  assert.equal(lookupCountry('Spain'), 'ES');
  assert.equal(lookupCountry('AR'), 'AR');
  assert.equal(lookupCountry('Estados Unidos'), 'US');
  assert.equal(lookupCountry('Narnia'), null);
  assert.equal(countryLabel({ country: null, countryCode: 'DE' }, 'es'), 'Alemania');
  assert.equal(countryLabel({ country: null, countryCode: 'DE' }, 'en'), 'Germany');
});

test('sin URL: usa el primer link http(s) de las notas; sin ninguno, sin botón', () => {
  const list = shows('no-url-notes-link.ics');
  const a = byTitle(list, 'Sin URL');
  assert.equal(a.url, 'https://tickets.example.com/ev?id=1&x=2');
  assert.equal(a.notes, 'Entradas en https://tickets.example.com/ev?id=1&x=2.\nPuerta 22 h, no falta nadie.\n\nhttp://otro.example.org');
  assert.equal(byTitle(list, 'Sin nada').url, null);
  assert.equal(byTitle(list, 'Sin nada').notes, null);
  const bad = byTitle(list, 'URL mala');
  assert.equal(bad.url, 'https://ok.example.com/a', 'javascript: se descarta; ftp: no cuenta');
});

test('linkify: links http(s) válidos, puntuación final afuera, el resto es texto', () => {
  const lines = linkify('Mirá https://a.example.com/x. Y (http://b.example.com/y) o javascript:alert(1)\nlínea 2');
  assert.deepEqual(lines[0], [
    { type: 'text', text: 'Mirá ' },
    { type: 'link', text: 'a.example.com/x', href: 'https://a.example.com/x' },
    { type: 'text', text: '. Y (' },
    { type: 'link', text: 'b.example.com/y', href: 'http://b.example.com/y' },
    { type: 'text', text: ') o javascript:alert(1)' },
  ]);
  assert.deepEqual(lines[1], [{ type: 'text', text: 'línea 2' }]);
  assert.equal(firstHttpUrl('nada acá'), null);
});

test('safeHttpUrl: solo http(s), sin credenciales, sin espacios', () => {
  assert.equal(safeHttpUrl('https://example.com/a b'), null);
  assert.equal(safeHttpUrl('https://user:pw@example.com/'), null);
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>1</script>'), null);
  assert.equal(safeHttpUrl('//example.com'), null);
  assert.equal(safeHttpUrl('http://example.com'), 'http://example.com/');
  assert.equal(safeHttpUrl(`https://example.com/${'a'.repeat(3000)}`), null);
});

test('caracteres raros y HTML: llegan como texto plano (el escapado lo hace Astro), sin controles ni bidi', () => {
  const [s] = shows('weird.ics');
  assert.equal(s.title.startsWith('<script>alert("x")</script> & <b>negrita</b>'), true, 'el HTML queda como texto literal, no se interpreta');
  assert.equal(s.url, null, 'URL con credenciales se descarta');
  assert.equal(s.city, 'Ciudad <i>X</i>');
  assert.match(s.notes ?? '', /<img src=x onerror=alert\(1\)>/);
  assert.equal(cleanLine('a‮b\u0007c‏d', 50), 'abcd');
  assert.equal(cleanMultiline('uno\u0000\r\n\r\n\r\n\r\ndos⁦', 50), 'uno\n\ndos');
});

test('límites de largo', () => {
  assert.ok(cleanLine('palabra '.repeat(100), 50).length <= 50);
  assert.ok(cleanLine('palabra '.repeat(100), 50).endsWith('…'));
  assert.ok(cleanMultiline('x'.repeat(5000), 600).length <= 600);
});

test('JSON-LD y tipos: el título nunca queda vacío', () => {
  const list = shows('statuses.ics');
  assert.ok(list.every((s) => s.title.length > 0));
});
