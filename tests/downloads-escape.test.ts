import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVCard } from '../src/lib/downloads/vcard.ts';
import { buildIcs } from '../src/lib/downloads/ics-write.ts';

// Desdobla las líneas plegadas (RFC 5545 §3.1 / RFC 6350 §3.2) antes de mirar el contenido
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');

test('ics: escapa barra, punto y coma, coma y saltos de línea en los campos de texto (RFC 5545 §3.3.11)', () => {
  const ics = unfold(
    buildIcs(
      [{ uid: 'x@y', summary: 'Club; Sala, 2\\3', start: '2026-12-01', location: 'Calle 1; Piso 2, CABA', description: 'Línea 1\nLínea 2; fin, ok' }],
      { name: 'Fechas; de, Ailén', now: new Date('2026-01-01T00:00:00Z') },
    ),
  );
  assert.match(ics, /SUMMARY:Club\\; Sala\\, 2\\\\3\r\n/);
  assert.match(ics, /LOCATION:Calle 1\\; Piso 2\\, CABA\r\n/);
  assert.match(ics, /DESCRIPTION:Línea 1\\nLínea 2\\; fin\\, ok\r\n/);
  assert.match(ics, /X-WR-CALNAME:Fechas\\; de\\, Ailén\r\n/);
  // ningún ; ni , sin escapar dentro de un valor de texto
  for (const line of ics.split('\r\n').filter((l) => /^(SUMMARY|LOCATION|DESCRIPTION):/.test(l))) {
    assert.doesNotMatch(line.slice(line.indexOf(':') + 1), /(^|[^\\])(\\\\)*[;,]/, line);
  }
});

test('vcard: escapa ; , \\ y saltos de línea; los separadores de N y ADR quedan sin escapar (RFC 6350 §3.4)', () => {
  const vcf = unfold(buildVCard({ name: 'Ana María Pérez', org: 'Agencia; Sur, SA', note: 'Uno\nDos; tres, cuatro \\ fin', city: 'Buenos Aires', country: 'Argentina', email: 'a@b.com' }));
  assert.match(vcf, /ORG:Agencia\\; Sur\\, SA\r\n/);
  assert.match(vcf, /NOTE:Uno\\nDos\\; tres\\, cuatro \\\\ fin\r\n/);
  assert.match(vcf, /\nN:Pérez;Ana María;;;\r\n/);
  assert.match(vcf, /ADR;TYPE=WORK:;;;Buenos Aires;;;Argentina\r\n/);
  assert.ok(vcf.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n') && vcf.endsWith('END:VCARD\r\n'));
});
