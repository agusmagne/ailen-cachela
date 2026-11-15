import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { createZip } from '../src/lib/downloads/zip.ts';
import { buildVCard, fold } from '../src/lib/downloads/vcard.ts';
import { buildIcs } from '../src/lib/downloads/ics-write.ts';
import { parseIcs } from '../src/lib/ics.ts';
import { qrMatrix, qrSvg } from '../src/lib/downloads/qr.ts';
import { buildMailto, fitsMailto, plainDraft } from '../src/lib/mailto.ts';
import { fileResponse, formatBytes } from '../src/lib/downloads/response.ts';

/* ---- ZIP ------------------------------------------------------------------------------------ */
function readZip(buf: Buffer) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(off + 26);
    const data = buf.subarray(off + 30 + lnlen, off + 30 + lnlen + csize);
    const raw = method === 8 ? inflateRawSync(data) : data;
    assert.equal(crc32(raw), crc, `crc de ${name}`);
    out[name] = Buffer.from(raw);
    p += 46 + nlen;
  }
  return out;
}

test('createZip: contenido, nombres UTF-8 y determinismo', () => {
  const entries = [
    { name: 'bio/corta.txt', data: 'Ailén Cachela, DJ y productora. '.repeat(20) },
    { name: 'logo.svg', data: '<svg/>' },
    { name: 'bin/datos.bin', data: new Uint8Array([1, 2, 3, 250]) },
  ];
  const a = createZip(entries);
  assert.deepEqual(a, createZip(entries));
  const files = readZip(a);
  assert.deepEqual(Object.keys(files), ['bio/corta.txt', 'logo.svg', 'bin/datos.bin']);
  assert.ok(files['bio/corta.txt'].toString().startsWith('Ailén'));
  assert.deepEqual([...files['bin/datos.bin']], [1, 2, 3, 250]);
});

test('createZip: lo abre un descompresor real (unzip -t)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  try {
    writeFileSync(join(dir, 'x.zip'), createZip([{ name: 'a/b.txt', data: 'hola'.repeat(100) }, { name: 'ñ.txt', data: 'x' }]));
    let out: string;
    try {
      out = execFileSync('unzip', ['-t', join(dir, 'x.zip')], { encoding: 'utf8' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return t.skip('unzip no está instalado');
      throw e;
    }
    assert.match(out, /No errors detected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createZip rechaza nombres repetidos, absolutos o con ..', () => {
  assert.throws(() => createZip([{ name: 'a', data: '' }, { name: 'a', data: '' }]));
  assert.throws(() => createZip([{ name: '/a', data: '' }]));
  assert.throws(() => createZip([{ name: '../a', data: '' }]));
});

/* ---- vCard ---------------------------------------------------------------------------------- */
test('buildVCard: campos, escapado y pliegue a 75 octetos', () => {
  const v = buildVCard({ name: 'Ailén Cachela', org: 'Ailén; Cachela', title: 'DJ, productora', email: 'a@b.com', url: 'https://x.com/', note: 'línea 1\nlínea 2', city: 'Buenos Aires', country: 'Argentina' });
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(v, /FN:Ailén Cachela\r\n/);
  assert.match(v, /N:Cachela;Ailén;;;\r\n/);
  assert.match(v, /ORG:Ailén\; Cachela\r\n/);
  assert.match(v, /TITLE:DJ\\, productora\r\n/);
  assert.match(v, /NOTE:línea 1\\nlínea 2/);
  assert.match(v, /END:VCARD\r\n$/);
  for (const line of buildVCard({ name: 'x', note: 'ñ'.repeat(120) }).split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(fold('a'.repeat(80)).split('\r\n').length, 2);
});

/* ---- ICS ------------------------------------------------------------------------------------ */
test('buildIcs: evento con hora (UTC), todo el día (DTEND exclusivo), escapado y plegado', () => {
  const ics = buildIcs(
    [
      { uid: 'a@x', summary: 'Club, Ciudad; Noche', start: '2026-11-28T23:00:00-03:00', end: '2026-11-29T03:00:00-03:00', location: 'Calle 1, BA', description: 'Línea 1\nLínea 2', url: 'https://x.com/e', status: 'CONFIRMED' },
      { uid: 'b@x', summary: 'Festival', start: '2026-12-05', end: '2026-12-06' },
      { uid: 'c@x', summary: 'Sin fin', start: '2026-12-10T22:00:00-03:00' },
    ],
    { name: 'Fechas', now: new Date('2026-11-15T12:00:00Z'), tz: 'America/Argentina/Buenos_Aires' },
  );
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(ics, /DTSTART:20261129T020000Z/);
  assert.match(ics, /DTEND:20261129T060000Z/);
  assert.match(ics, /SUMMARY:Club\\, Ciudad\; Noche/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261207/);
  assert.match(ics, /DTSTART:20261211T010000Z\r\nDTEND:20261211T040000Z/, 'sin fin: 3 horas');
  assert.match(ics, /DESCRIPTION:Línea 1\\nLínea 2/);
  assert.match(ics, /DTSTAMP:20261115T120000Z/);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.throws(() => buildIcs([{ uid: 'x', summary: 's', start: 'mañana' }], { name: 'n' }), /fecha inválida/);
});

test('buildIcs se lee con el parser del sitio (ida y vuelta)', () => {
  const ics = buildIcs([{ uid: 'rt@x', summary: 'Amazonia', start: '2026-11-28T23:00:00-03:00', location: 'Av. X 123, Buenos Aires', url: 'https://x.com/t' }], { name: 'n', now: new Date('2026-11-15T12:00:00Z') });
  const { events } = parseIcs(ics, { defaultTz: 'America/Argentina/Buenos_Aires', now: Date.parse('2026-11-15T12:00:00-03:00') });
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, 'Amazonia');
  assert.equal(events[0].id, 'rt@x');
});

/* ---- QR ------------------------------------------------------------------------------------- */
test('qrMatrix: tamaño por versión, patrones de búsqueda y determinismo', () => {
  const m = qrMatrix('https://ailencachela.com/', 'M');
  assert.equal(m.length, 25, '25 bytes con M: versión 2 = 25 módulos');
  assert.ok(m.every((r) => r.length === 25));
  // Patrón de búsqueda 7x7 en la esquina superior izquierda
  const ring = [0, 1, 2, 3, 4, 5, 6].every((i) => m[0][i] && m[6][i] && m[i][0] && m[i][6]);
  assert.ok(ring);
  assert.equal(m[3][3], true);
  assert.equal(m[1][1], false);
  assert.deepEqual(m, qrMatrix('https://ailencachela.com/', 'M'));
  assert.notDeepEqual(m, qrMatrix('https://ailencachela.com/x', 'M'));
});

test('qrMatrix: sube de versión con el largo y rechaza lo que no entra', () => {
  assert.equal(qrMatrix('a', 'L').length, 21);
  assert.equal(qrMatrix('x'.repeat(200), 'M').length, 57, 'versión 10');
  assert.throws(() => qrMatrix('x'.repeat(400), 'M'), /no entra/);
});

test('qrSvg: SVG válido, currentColor por defecto y accesibilidad opcional', () => {
  const svg = qrSvg('https://x.com');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/);
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(qrSvg('x', { title: 'QR de "x"' }), /role="img" aria-label="QR de &quot;x&quot;"/);
  assert.match(qrSvg('x', { background: '#fff', fill: '#000' }), /<rect [^>]*fill="#fff"\/><path fill="#000"/);
});

/* ---- mailto y respuestas -------------------------------------------------------------------- */
test('buildMailto: asunto y cuerpo codificados, saltos CRLF', () => {
  const url = buildMailto({ to: 'a@b.com', subject: 'Booking: Club & Ciudad', body: ['Hola Ailén,', 'Fecha: 2026-12-01'] });
  assert.ok(url.startsWith('mailto:a@b.com?subject=Booking%3A%20Club%20%26%20Ciudad&body='));
  assert.ok(url.includes('Hola%20Ail%C3%A9n%2C%0D%0AFecha'));
  assert.equal(fitsMailto({ to: 'a@b.com', subject: 's', body: 'corto' }), true);
  assert.equal(fitsMailto({ to: 'a@b.com', subject: 's', body: 'x'.repeat(3000) }), false);
  assert.match(plainDraft({ to: 'a@b.com', subject: 's', body: ['l1', 'l2'] }), /^To: a@b\.com\nSubject: s\n\nl1\nl2$/);
});

test('fileResponse y formatBytes', async () => {
  const r = fileResponse('x', 'ics');
  assert.equal(r.headers.get('content-type'), 'text/calendar; charset=utf-8');
  assert.throws(() => fileResponse('x', 'exe'));
  assert.equal(formatBytes(900), '900 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB');
});
