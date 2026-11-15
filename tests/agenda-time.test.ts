import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TZ, calendarDaysUntil, convert, countdown, dayDelta, formatOffset, zoneOffsetMinutes, zoneParts } from '../src/lib/agenda/time.ts';

const ms = (iso: string) => Date.parse(iso);

test('countdown: por venir descompone días, horas, minutos y segundos', () => {
  const start = ms('2026-11-28T23:00:00-03:00');
  const now = ms('2026-11-15T12:00:00-03:00');
  const c = countdown(start, start + 3 * 3600_000, now);
  assert.equal(c.phase, 'upcoming');
  assert.deepEqual([c.days, c.hours, c.minutes, c.seconds], [13, 11, 0, 0]);
  const c2 = countdown(start, start + 1, start - (2 * 60 + 5) * 1000 - 400);
  assert.deepEqual([c2.days, c2.hours, c2.minutes, c2.seconds], [0, 0, 2, 5]);
});

test('countdown: en curso y pasada (los bordes cuentan como en curso)', () => {
  const start = ms('2026-11-28T23:00:00-03:00');
  const end = ms('2026-11-29T04:00:00-03:00');
  assert.equal(countdown(start, end, start).phase, 'live');
  assert.equal(countdown(start, end, end).phase, 'live');
  assert.equal(countdown(start, end, end + 1).phase, 'past');
  assert.equal(countdown(start, end, start - 1).phase, 'upcoming');
  const live = countdown(start, end, start + 1000);
  assert.deepEqual([live.totalMs, live.days, live.seconds], [0, 0, 0]);
});

test('zona de Buenos Aires: sin horario de verano, UTC−3 todo el año', () => {
  assert.equal(zoneOffsetMinutes(ms('2026-01-15T12:00:00Z'), EVENT_TZ), -180);
  assert.equal(zoneOffsetMinutes(ms('2026-07-15T12:00:00Z'), EVENT_TZ), -180);
  assert.equal(formatOffset(-180), 'UTC−3');
  assert.equal(formatOffset(330), 'UTC+5:30');
  assert.equal(formatOffset(0), 'UTC');
});

test('zoneParts: hora de pared correcta y medianoche como 00 (no 24)', () => {
  const p = zoneParts(ms('2026-11-28T23:00:00-03:00'), EVENT_TZ);
  assert.deepEqual(p, { year: 2026, month: 11, day: 28, hour: 23, minute: 0 });
  const m = zoneParts(ms('2026-11-29T00:00:00-03:00'), EVENT_TZ);
  assert.deepEqual([m.day, m.hour, m.minute], [29, 0, 0]);
});

test('convert: cambio de día hacia el este (23:00 en Buenos Aires = 03:00 del día siguiente en Madrid, invierno)', () => {
  const t = ms('2026-11-28T23:00:00-03:00');
  const mad = convert(t, 'Europe/Madrid', EVENT_TZ, 'es');
  assert.equal(mad.time, '03:00');
  assert.equal(mad.dayDelta, 1);
  assert.equal(mad.offset, 'UTC+1');
  assert.match(mad.date, /^dom 29 nov/);
  const ba = convert(t, EVENT_TZ, EVENT_TZ, 'es');
  assert.equal(ba.time, '23:00');
  assert.equal(ba.dayDelta, 0);
  assert.equal(ba.label, 'Buenos Aires');
});

test('convert: cambio de día hacia el oeste y horario de verano (Nueva York en julio vs. noviembre)', () => {
  const winter = convert(ms('2026-11-28T01:00:00-03:00'), 'America/New_York', EVENT_TZ, 'en');
  assert.equal(winter.time, '23:00');
  assert.equal(winter.dayDelta, -1);
  assert.equal(winter.offset, 'UTC−5');
  const summer = convert(ms('2026-07-04T01:00:00-03:00'), 'America/New_York', EVENT_TZ, 'en');
  assert.equal(summer.time, '00:00');
  assert.equal(summer.offset, 'UTC−4');
  assert.equal(convert(ms('2026-07-04T20:00:00-03:00'), 'Europe/Madrid', EVENT_TZ, 'en').offset, 'UTC+2');
});

test('dayDelta y calendarDaysUntil usan días de calendario, no bloques de 24 h', () => {
  const now = ms('2026-11-15T23:30:00-03:00');
  const t = ms('2026-11-16T00:10:00-03:00');
  assert.equal(calendarDaysUntil(now, t, EVENT_TZ), 1);
  assert.equal(calendarDaysUntil(now, now + 1000, EVENT_TZ), 0);
  assert.equal(calendarDaysUntil(now, ms('2026-11-30T20:00:00-03:00'), EVENT_TZ), 15);
  assert.equal(dayDelta(ms('2026-11-28T23:00:00-03:00'), 'Asia/Tokyo', EVENT_TZ), 1);
});
