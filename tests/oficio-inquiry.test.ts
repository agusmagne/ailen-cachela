import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInquiry, validateInquiry, inquiryStatus, isEmail } from '../src/lib/oficio/inquiry.ts';
import { MAILTO_SAFE_LENGTH } from '../src/lib/mailto.ts';

const base = {
  to: 'a@example.com',
  subject: 'Consulta de servicio',
  greeting: 'Hola',
  closing: 'Gracias',
  lines: [
    { label: 'Nombre', value: '  Ana   Pérez ' },
    { label: 'Servicio', value: 'Mezcla' },
    { label: 'Fecha', value: '' },
  ],
  message: { label: 'Proyecto', value: 'Un tema de 130 BPM.\nCon bajo ácido.' },
};

test('buildInquiry: asunto con prefijo, líneas normalizadas y campos vacíos como "etiqueta:"', () => {
  const d = buildInquiry({ ...base, subjectPrefix: '[Ejemplo] ' });
  assert.equal(d.to, 'a@example.com');
  assert.equal(d.subject, '[Ejemplo] Consulta de servicio');
  const body = d.body as string[];
  assert.equal(body[0], 'Hola');
  assert.ok(body.includes('Nombre: Ana Pérez'));
  assert.ok(body.includes('Fecha:'), 'un campo vacío queda sin espacio al final');
  assert.ok(body.includes('Proyecto:'));
  assert.ok(body.includes('Un tema de 130 BPM.\nCon bajo ácido.'));
  assert.equal(body.at(-1), 'Gracias');
});

test('buildInquiry: sin prefijo ni mensaje', () => {
  const d = buildInquiry({ ...base, message: undefined });
  assert.equal(d.subject, 'Consulta de servicio');
  assert.ok(!(d.body as string[]).some((l) => l.startsWith('Proyecto')));
});

test('inquiryStatus: el mailto codifica el cuerpo y el texto plano lleva Para/Asunto', () => {
  const s = inquiryStatus(buildInquiry(base));
  assert.ok(s.href.startsWith('mailto:a@example.com?subject='));
  assert.ok(s.href.includes('body='));
  assert.ok(s.fits);
  assert.match(s.plain, /^To: a@example\.com\nSubject: Consulta de servicio\n\nHola/);
  assert.ok(s.plain.includes('Un tema de 130 BPM.'), 'el texto copiado coincide con el del mail');
});

test('inquiryStatus: avisa cuando el mensaje no entra en un mailto', () => {
  const long = buildInquiry({ ...base, message: { label: 'Proyecto', value: 'x'.repeat(MAILTO_SAFE_LENGTH) } });
  const s = inquiryStatus(long);
  assert.equal(s.fits, false);
  assert.ok(s.length > MAILTO_SAFE_LENGTH);
  assert.ok(s.plain.includes('x'.repeat(100)), 'el respaldo de copia conserva el texto completo');
});

test('validateInquiry: obligatorios y email', () => {
  assert.deepEqual(validateInquiry({ email: '', message: ' ' }, ['email', 'message'], ['email']), { email: 'required', message: 'required' });
  assert.deepEqual(validateInquiry({ email: 'no-es-mail', message: 'ok' }, ['email', 'message'], ['email']), { email: 'email' });
  assert.deepEqual(validateInquiry({ email: 'ana@example.com', message: 'ok' }, ['email', 'message'], ['email']), {});
  assert.deepEqual(validateInquiry({ email: '' }, [], ['email']), {}, 'un email opcional vacío es válido');
});

test('isEmail', () => {
  assert.ok(isEmail(' ana@example.com '));
  assert.ok(!isEmail('ana@example'));
  assert.ok(!isEmail('ana example@x.com'));
});
