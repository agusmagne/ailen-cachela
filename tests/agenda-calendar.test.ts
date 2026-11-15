import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs } from '../src/lib/ics.ts';
import { buildFeed, buildShowIcs, icsText, showIcsFile, showToIcsEvent, type CalendarOptions } from '../src/lib/agenda/calendar.ts';
import { musicEventLd } from '../src/lib/agenda/jsonld.ts';
import { byTitle, NOW, shows, TZ } from './helpers.ts';

const opts = (lang: 'es' | 'en' = 'es'): CalendarOptions => ({
  lang,
  artist: 'Ailén Cachela',
  siteUrl: 'https://ailencachela.com',
  showsUrl: 'https://ailencachela.com/fechas/',
  countryName: (s) => s.countryCode,
  now: new Date('2026-11-15T15:00:00Z'),
});

const list = () => shows('agenda/shows.ics');

test('icsText: el punto y coma pasa a coma y los saltos de línea se normalizan', () => {
  assert.equal(icsText('Sala 2; piso 3'), 'Sala 2, piso 3');
  assert.equal(icsText('a \r\n b\n\nc'), 'a\nb\nc');
});

test('una fecha con hora: ida y vuelta por parseIcs con el mismo instante, ubicación y estado', () => {
  const s = byTitle(list(), 'Nave Prueba; Sala 2');
  const ics = buildShowIcs(s, opts());
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.ok(!/[^\r]\n/.test(ics.replace(/\\n/g, '')), 'solo saltos CRLF');
  const { events } = parseIcs(ics, { defaultTz: TZ, now: NOW });
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.summary, 'Ailén Cachela @ Nave Prueba, Sala 2');
  assert.equal(Date.parse(ev.start), Date.parse('2026-11-28T23:00:00-03:00'));
  assert.equal(Date.parse(ev.end ?? ''), Date.parse('2026-11-29T04:00:00-03:00'));
  assert.match(ev.location, /Buenos Aires/);
  assert.match(ev.description, /Entradas: https:\/\/entradas\.example\.test\/ag1/);
  assert.equal(ev.id, 'ag-1-example.test@ailencachela.com', 'el UID del evento, saneado, más el dominio del sitio');
});

test('día completo de varios días: DTEND exclusivo correcto y estado agotado en el título', () => {
  const s = byTitle(list(), 'Festival Prueba');
  assert.equal(s.allDay, true);
  const ics = buildShowIcs(s, opts('en'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261212/);
  assert.match(ics, /DTEND;VALUE=DATE:20261214/, 'el 13 es el último día: el fin exclusivo es el 14');
  const { events } = parseIcs(ics, { defaultTz: TZ, now: NOW });
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].start, '2026-12-12');
  assert.equal(events[0].end, '2026-12-13');
  assert.match(events[0].summary, /sold out/);
});

test('cancelada: STATUS CANCELLED, sin link de entradas', () => {
  const s = byTitle(list(), 'Club Prueba');
  const ev = showToIcsEvent(s, opts());
  assert.equal(ev.status, 'CANCELLED');
  assert.match(ev.summary, /cancelado/);
  const { events } = parseIcs(buildShowIcs(s, opts()), { defaultTz: TZ, now: NOW });
  assert.equal(events[0].status, 'CANCELLED');
});

test('feed: todas las fechas, UIDs únicos y estables, nombre y zona del calendario', () => {
  const all = list();
  const feed = buildFeed(all, opts());
  assert.match(feed, /X-WR-CALNAME:Fechas de Ailén Cachela/);
  assert.match(feed, /X-WR-TIMEZONE:America\/Argentina\/Buenos_Aires/);
  const { events } = parseIcs(feed, { defaultTz: TZ, now: NOW });
  assert.equal(events.length, all.length);
  assert.equal(new Set(events.map((e) => e.id)).size, all.length);
  assert.equal(buildFeed(all, opts()), feed, 'determinista con el mismo "ahora"');
  assert.match(buildFeed(all, opts('en')), /X-WR-CALNAME:Ailén Cachela shows/);
});

test('estructura iCalendar válida: CRLF, líneas de hasta 75 octetos, BEGIN/END balanceados y propiedades obligatorias', () => {
  const feed = buildFeed(list(), opts());
  const lines = feed.split('\r\n');
  assert.equal(lines.pop(), '', 'termina en CRLF');
  for (const l of lines) assert.ok(Buffer.byteLength(l) <= 75, `línea de ${Buffer.byteLength(l)} octetos: ${l}`);
  const stack: string[] = [];
  for (const l of lines) {
    const b = /^BEGIN:(.+)$/.exec(l);
    const e = /^END:(.+)$/.exec(l);
    if (b) stack.push(b[1]);
    if (e) assert.equal(stack.pop(), e[1]);
  }
  assert.deepEqual(stack, []);
  const unfolded = feed.replace(/\r\n /g, '');
  for (const ev of unfolded.split('BEGIN:VEVENT').slice(1)) {
    for (const prop of ['UID:', 'DTSTAMP:', 'DTSTART', 'DTEND', 'SUMMARY:']) assert.ok(ev.includes(`\r\n${prop}`), `falta ${prop}`);
    assert.ok(!/\r\n(SUMMARY|LOCATION|DESCRIPTION):[^\r]*[^\\];/.test(ev), 'ningún punto y coma sin escapar en textos');
  }
  assert.match(unfolded, /DTSTART:20261129T020000Z/, 'las 23:00 de Buenos Aires son las 02:00 UTC del día siguiente');
});

test('nombre de archivo por fecha: estable, sin caracteres raros y distinto por idioma', () => {
  const s = byTitle(list(), 'Nave Prueba; Sala 2');
  const a = showIcsFile(s, 'es');
  assert.match(a, /^2026-11-28-nave-prueba-sala-2-[0-9a-z]{4}-es$/);
  assert.equal(showIcsFile(s, 'es'), a);
  assert.notEqual(showIcsFile(s, 'en'), a);
});

test('JSON-LD MusicEvent: fecha, lugar, estado y entradas', () => {
  const s = byTitle(list(), 'Festival Prueba');
  const ld = musicEventLd(s, 'Ailén Cachela', 'https://ailencachela.com/fechas/');
  assert.equal(ld['@type'], 'MusicEvent');
  assert.equal(ld.startDate, '2026-12-12');
  assert.equal(ld.offers, undefined, 'sin URL de entradas no hay oferta');
  const n = musicEventLd(byTitle(list(), 'Nave Prueba; Sala 2'), 'Ailén Cachela', 'x');
  assert.equal((n.offers as { url: string }).url, 'https://entradas.example.test/ag1');
  assert.equal(n.endDate, '2026-11-29T04:00:00-03:00');
  const c = musicEventLd(byTitle(list(), 'Club Prueba'), 'Ailén Cachela', 'x');
  assert.equal(c.eventStatus, 'https://schema.org/EventCancelled');
});
