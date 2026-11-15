import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCalendarShows, parseSnapshot, serializeSnapshot, type SourceDeps, type SourceOptions } from '../src/lib/show-source.ts';
import { NOW, TZ, fixture, shows } from './helpers.ts';

const URL_ = 'https://calendar.example.com/feed';

function deps(over: Partial<SourceDeps> = {}) {
  const log = { warns: [] as string[], written: null as string | null, fetches: 0, sleeps: [] as number[] };
  const d: SourceDeps = {
    fetchText: async () => {
      log.fetches++;
      return fixture('real-event.ics');
    },
    readSnapshot: () => null,
    writeSnapshot: (c) => {
      log.written = c;
    },
    warn: (m) => log.warns.push(m),
    sleep: async (ms) => {
      log.sleeps.push(ms);
    },
    ...over,
  };
  return { d, log };
}
const opts = (o: Partial<SourceOptions> = {}): SourceOptions => ({ url: URL_, strict: false, persist: false, defaultTz: TZ, now: NOW, ...o });

test('éxito: devuelve los shows, no avisa y no toca la copia si persist=false', async () => {
  const { d, log } = deps();
  const r = await loadCalendarShows(opts(), d);
  assert.equal(r.from, 'calendar');
  assert.equal(r.shows.length, 1);
  assert.equal(log.written, null);
  assert.deepEqual(log.warns, []);
});

test('éxito con persist: escribe la copia, y no reescribe si no cambió', async () => {
  const a = deps();
  await loadCalendarShows(opts({ persist: true }), a.d);
  assert.ok(a.log.written);
  assert.equal(parseSnapshot(a.log.written)?.length, 1);
  const b = deps({ readSnapshot: () => a.log.written });
  await loadCalendarShows(opts({ persist: true }), b.d);
  assert.equal(b.log.written, null);
});

test('sin URL: no pide nada', async () => {
  const { d, log } = deps();
  const r = await loadCalendarShows(opts({ url: null }), d);
  assert.deepEqual(r, { shows: [], from: 'none' });
  assert.equal(log.fetches, 0);
});

test('reintenta y se recupera de una falla pasajera', async () => {
  let n = 0;
  const { d, log } = deps({
    fetchText: async () => {
      if (++n < 3) throw new Error('HTTP 503');
      return fixture('real-event.ics');
    },
  });
  const r = await loadCalendarShows(opts(), d);
  assert.equal(r.from, 'calendar');
  assert.equal(n, 3);
  assert.deepEqual(log.sleeps, [1000, 3000]);
});

test('falla en modo normal: usa la copia guardada y deja un warning claro', async () => {
  const snap = serializeSnapshot(shows('real-event.ics'));
  const { d, log } = deps({ fetchText: async () => { throw new Error('timeout'); }, readSnapshot: () => snap });
  const r = await loadCalendarShows(opts(), d);
  assert.equal(r.from, 'snapshot');
  assert.equal(r.shows.length, 1);
  assert.equal(log.warns.length, 1);
  assert.match(log.warns[0], /copia guardada/);
  assert.match(log.warns[0], /timeout/);
});

test('falla en modo normal sin copia: vacío con warning (solo fechas manuales)', async () => {
  const { d, log } = deps({ fetchText: async () => { throw new Error('HTTP 500'); } });
  const r = await loadCalendarShows(opts(), d);
  assert.deepEqual(r, { shows: [], from: 'none' });
  assert.match(log.warns[0], /no hay copia guardada/);
});

test('falla en modo estricto: lanza, aunque haya copia, y no escribe nada', async () => {
  const snap = serializeSnapshot(shows('real-event.ics'));
  const { d, log } = deps({ fetchText: async () => { throw new Error('HTTP 500'); }, readSnapshot: () => snap });
  await assert.rejects(loadCalendarShows(opts({ strict: true, persist: true }), d), /modo estricto/);
  assert.equal(log.written, null);
});

test('feed corrupto cuenta como falla (no se publica una sección vacía por error)', async () => {
  const snap = serializeSnapshot(shows('real-event.ics'));
  for (const name of ['corrupt-truncated.ics', 'corrupt-notics.ics']) {
    const { d, log } = deps({ fetchText: async () => fixture(name), readSnapshot: () => snap });
    const r = await loadCalendarShows(opts({ persist: true }), d);
    assert.equal(r.from, 'snapshot', name);
    assert.equal(log.written, null, 'un feed corrupto no pisa la copia buena');
    await assert.rejects(loadCalendarShows(opts({ strict: true }), d), /modo estricto/);
  }
});

test('feed vacío pero válido: es el estado real (sin fechas), no una falla', async () => {
  const snap = serializeSnapshot(shows('real-event.ics'));
  const { d, log } = deps({ fetchText: async () => fixture('empty.ics'), readSnapshot: () => snap });
  const r = await loadCalendarShows(opts({ strict: true, persist: true }), d);
  assert.deepEqual(r, { shows: [], from: 'calendar' });
  assert.equal(parseSnapshot(log.written)?.length, 0);
});

test('parseSnapshot rechaza copias dañadas o de otra versión', () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot('no es json'), null);
  assert.equal(parseSnapshot('{"version":99,"shows":[]}'), null);
  assert.equal(parseSnapshot('{"version":1,"shows":[{"id":1}]}'), null);
  const s = shows('real-event.ics')[0];
  assert.equal(parseSnapshot(JSON.stringify({ version: 1, shows: [{ ...s, url: 'javascript:alert(1)' }] })), null);
});
