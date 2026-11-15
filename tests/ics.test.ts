import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcsError, parseIcs, unescapeText } from '../src/lib/ics.ts';
import { fixture, NOW, TZ } from './helpers.ts';

const parse = (name: string) => parseIcs(fixture(name), { defaultTz: TZ, now: NOW });

test('evento real de iCloud: líneas plegadas, escapes, zona y coordenadas; ignora ATTACH', () => {
  const { events, warnings } = parse('real-event.ics');
  assert.equal(events.length, 1);
  const e = events[0];
  assert.equal(e.id, '794EBB2F-9DA4-49CB-8ECD-27F4A0E04D99');
  assert.equal(e.summary, 'Amazonia');
  assert.equal(e.allDay, false);
  assert.equal(e.start, '2026-11-28T23:00:00-03:00');
  assert.equal(e.end, '2026-11-29T02:00:00-03:00');
  assert.equal(e.tz, TZ);
  assert.equal(e.description, 'Toco en Amazonia, nos vemos allá! Entradas en el link!');
  assert.equal(e.location, 'Yrigoyen 1524\nB7627 Tandil\nProvincia de Buenos Aires\nArgentina'); // "Argentin" + "a" desplegado
  assert.equal(e.url, 'https://www.youtube.com');
  assert.deepEqual(e.geo, { lat: -37.316024, lon: -59.144584 });
  assert.deepEqual(warnings, []);
  assert.equal(JSON.stringify(e).includes('gateway.icloud.com'), false, 'el adjunto no debe aparecer');
});

test('escapes de texto: \\n \\, \; \\\\ en una sola pasada', () => {
  assert.equal(unescapeText('a\\nb\\Nc\\,d\;e\\\\f'), 'a\nb\nc,d;e\\f');
  assert.equal(unescapeText('\\\\n'), '\\n'); // barra escapada seguida de "n": no es un salto
});

test('día completo: sin hora; un día no tiene fin y varios días dan el último día inclusivo', () => {
  const { events } = parse('all-day.ics');
  const one = events.find((e) => e.id === 'allday-1')!;
  assert.equal(one.allDay, true);
  assert.equal(one.start, '2026-12-05');
  assert.equal(one.end, null);
  const multi = events.find((e) => e.id === 'allday-multi')!;
  assert.equal(multi.start, '2026-12-10');
  assert.equal(multi.end, '2026-12-12');
});

test('UTC, hora flotante, otra zona IANA y zona desconocida', () => {
  const { events, warnings } = parse('utc-and-floating.ics');
  const get = (id: string) => events.find((e) => e.id === id)!;
  assert.equal(get('u1').start, '2026-11-30T22:00:00-03:00'); // 01:00Z se muestra en Buenos Aires
  assert.equal(get('u1').end, '2026-12-01T00:00:00-03:00');
  assert.equal(get('u2').start, '2026-12-02T22:00:00-03:00'); // flotante = zona por defecto
  assert.equal(get('u3').start, '2026-12-03T22:00:00+01:00');
  assert.equal(get('u3').tz, 'Europe/Berlin');
  assert.equal(get('u3').end, '2026-12-04T04:00:00+01:00');
  assert.equal(get('u4').start, '2026-12-04T22:00:00-03:00');
  assert.ok(warnings.some((w) => w.includes('Zona/Inventada')));
  assert.equal(events.find((e) => e.id === 'bad'), undefined, 'evento sin fecha válida se omite');
  assert.ok(warnings.some((w) => w.includes('sin fecha')));
});

test('recurrencia simple: COUNT, EXDATE y excepción por RECURRENCE-ID', () => {
  const { events } = parse('recurrence.ics');
  const res = events.filter((e) => e.id.startsWith('r1'));
  // 6/11, 13/11, (20/11 excluido), 27/11 (modificado), 4/12
  assert.deepEqual(
    res.map((e) => [e.start.slice(0, 16), e.summary]),
    [
      ['2026-11-06T23:00', 'Residencia'],
      ['2026-11-13T23:00', 'Residencia'],
      ['2026-11-27T21:00', 'Residencia (horario especial)'],
      ['2026-12-04T23:00', 'Residencia'],
    ],
  );
  assert.equal(res[0].end, '2026-11-07T02:00:00-03:00');
});

test('recurrencia compleja: queda solo la primera fecha y avisa', () => {
  const { events, warnings } = parse('recurrence.ics');
  const r2 = events.filter((e) => e.id === 'r2');
  assert.equal(r2.length, 1);
  assert.equal(r2[0].start, '2026-12-01');
  assert.ok(warnings.some((w) => w.includes('Recurrencia no soportada')));
});

test('feed vacío: es un calendario válido sin eventos', () => {
  const { events, warnings } = parse('empty.ics');
  assert.deepEqual(events, []);
  assert.deepEqual(warnings, []);
});

test('feed corrupto: lanza IcsError (cortado, o ni siquiera es iCalendar)', () => {
  assert.throws(() => parse('corrupt-truncated.ics'), IcsError);
  assert.throws(() => parse('corrupt-notics.ics'), IcsError);
  assert.throws(() => parseIcs('', { defaultTz: TZ }), IcsError);
});

test('las propiedades de una VALARM no pisan las del evento', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Real', 'DTSTART;VALUE=DATE:20261201',
    'BEGIN:VALARM', 'SUMMARY:alarma', 'DESCRIPTION:no', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const { events } = parseIcs(ics, { defaultTz: TZ, now: NOW });
  assert.equal(events[0].summary, 'Real');
  assert.equal(events[0].description, '');
});
