import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { ADVANCE_FORM, BOOKING_FORM, buildDraft, buildSubject, buildTemplate, copyText, displayValue, fitDraft, isValidDate, validate, validateField, type Labels, type Values } from '../src/lib/booking/form.ts';
import { MAILTO_SAFE_LENGTH, buildMailto, fitsMailto } from '../src/lib/mailto.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const ui = parse(readFileSync(`${root}src/content/ui/booking.yaml`, 'utf8')) as Record<string, { es: string; en: string }>;
const snake = (id: string) => id.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

/** Los mismos Labels que arma components/booking/ui.ts, pero leyendo el YAML (sin Vite). */
function labels(form: typeof BOOKING_FORM, lang: 'es' | 'en'): Labels {
  const tag = form.id === 'booking' ? 'b' : 'a';
  const fields: Labels['fields'] = {};
  const options: Labels['options'] = {};
  for (const f of form.fields) {
    fields[f.id] = ui[`booking_f${tag}_${snake(f.id)}`][lang];
    for (const o of f.options ?? []) options[`${f.id}.${o}`] = ui[`booking_o${tag}_${snake(f.id)}_${o}`][lang];
  }
  const sections: Labels['sections'] = {};
  for (let s = 1; s <= form.fieldSteps; s++) sections[s] = ui[`booking_s${tag}_${s}`][lang];
  return {
    fields,
    options,
    sections,
    yes: ui.booking_yes[lang],
    subject: ui[`booking_mail_subject_${form.id}`][lang],
    greeting: ui[`booking_mail_greeting_${form.id}`][lang],
    closing: ui.booking_mail_closing[lang],
    trimmedNote: ui.booking_mail_trimmed[lang],
  };
}

const TODAY = '2026-11-15';
const good: Values = {
  contactName: 'Julia Prueba',
  email: 'julia@example.com',
  eventType: 'club',
  date: '2027-03-05',
  city: 'Rosario',
  venue: 'Club Ejemplo',
};

test('validación: obligatorios, email, fecha, hora, número, link y opciones', () => {
  assert.deepEqual(validate(BOOKING_FORM, good, TODAY), {});
  const bad = validate(BOOKING_FORM, { date: '2026-11-14', email: 'no-es-mail', eventType: 'otro', capacity: '0', startTime: '25:00', links: 'ftp://x.com' }, TODAY);
  assert.equal(bad.contactName, 'required');
  assert.equal(bad.email, 'email');
  assert.equal(bad.eventType, 'option');
  assert.equal(bad.date, 'past');
  assert.equal(bad.capacity, 'range');
  assert.equal(bad.startTime, 'time');
  assert.equal(bad.links, 'url');
  assert.equal(bad.city, 'required');
  assert.equal(bad.venue, 'required');
});

test('validación por paso: solo mira los campos de ese paso', () => {
  const step1 = validate(BOOKING_FORM, { capacity: 'x', people: '99' }, TODAY, 1);
  assert.ok('capacity' in step1 && !('people' in step1));
  const step3 = validate(BOOKING_FORM, { people: '99' }, TODAY, 3);
  assert.equal(step3.people, 'range');
});

test('fechas: formato y existencia', () => {
  assert.equal(isValidDate('2027-02-29'), false);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('05/03/2027'), false);
  const date = BOOKING_FORM.fields.find((f) => f.id === 'date')!;
  assert.equal(validateField(date, '2026-11-15', TODAY), null, 'hoy es válido');
  assert.equal(validateField(date, '2026-13-01', TODAY), 'date');
});

test('límite de largo por campo', () => {
  const notes = BOOKING_FORM.fields.find((f) => f.id === 'notes')!;
  assert.equal(validateField(notes, 'x'.repeat(801), TODAY), 'long');
  assert.equal(validateField(notes, 'x'.repeat(800), TODAY), null);
});

test('el borrador incluye solo lo completado, con etiquetas y opciones del idioma', () => {
  const L = labels(BOOKING_FORM, 'es');
  const d = buildDraft(BOOKING_FORM, { ...good, capacity: '800', monitors: 'on', notes: 'Línea 1\nLínea 2' }, L, 'x@y.com');
  const body = String(Array.isArray(d.body) ? d.body.join('\n') : d.body);
  assert.match(body, /Tipo de evento: Club/);
  assert.match(body, /Capacidad: 800/);
  assert.match(body, /Hay monitores de cabina: Sí/);
  assert.match(body, /Algo más que quieras contar: Línea 1 \/ Línea 2/);
  assert.doesNotMatch(body, /Fecha alternativa/, 'sin campos vacíos');
  assert.match(d.subject, /^Consulta de booking · Club · 2027-03-05 · Rosario$/);
  const en = buildDraft(BOOKING_FORM, good, labels(BOOKING_FORM, 'en'), 'x@y.com');
  assert.match(String(en.body), /Event type: Club/);
});

test('el asunto usa el nombre del evento si existe', () => {
  assert.equal(buildSubject(BOOKING_FORM, { ...good, eventName: 'Noche Ejemplo' }, labels(BOOKING_FORM, 'es')), 'Consulta de booking · Noche Ejemplo · 2027-03-05 · Rosario');
});

test('mailto: con datos cortos entra tal cual y el texto copiado trae exactamente el cuerpo del mail', () => {
  const L = labels(BOOKING_FORM, 'es');
  const fitted = fitDraft(BOOKING_FORM, good, L, 'ailen@example.com');
  assert.equal(fitted.trimmed, false);
  const draft = buildDraft(BOOKING_FORM, good, L, 'ailen@example.com');
  assert.equal(buildMailto(fitted.draft), buildMailto(draft));
  const copied = copyText(BOOKING_FORM, good, L, 'ailen@example.com');
  const body = (Array.isArray(draft.body) ? draft.body.join('\n') : draft.body) as string;
  assert.ok(copied.endsWith(body), 'el texto copiado contiene el cuerpo completo');
  // el cuerpo que viaja en el mailto, decodificado, es el mismo (salvo CRLF)
  const url = buildMailto(fitted.draft);
  const decoded = decodeURIComponent(url.split('&body=')[1]).replace(/\r\n/g, '\n');
  assert.equal(decoded, body);
});

test('mailto: con datos largos NUNCA supera MAILTO_SAFE_LENGTH, avisa (trimmed) y conserva los campos clave', () => {
  const long = 'Á'.repeat(790);
  const values: Values = { ...good, organization: 'Org '.repeat(20), eventName: 'Noche Ejemplo', lineup: long, techNotes: long, notes: long, fee: '1000 USD', links: 'https://example.com/' + 'a'.repeat(200) };
  for (const lang of ['es', 'en'] as const) {
    const L = labels(BOOKING_FORM, lang);
    assert.equal(fitsMailto(buildDraft(BOOKING_FORM, values, L, 'ailen@example.com')), false, 'el completo no entra');
    const fitted = fitDraft(BOOKING_FORM, values, L, 'ailen@example.com');
    assert.equal(fitted.trimmed, true);
    const url = buildMailto(fitted.draft);
    assert.ok(url.length <= MAILTO_SAFE_LENGTH, `${url.length} <= ${MAILTO_SAFE_LENGTH}`);
    const body = decodeURIComponent(url.split('&body=')[1]);
    assert.match(body, /Julia Prueba/);
    assert.match(body, /julia@example\.com/);
    assert.match(body, /2027-03-05/);
    assert.match(body, new RegExp(L.trimmedNote.slice(0, 20).replace(/[()]/g, '\\$&')));
    // el texto completo para copiar sigue completo
    assert.ok(copyText(BOOKING_FORM, values, L, 'ailen@example.com').includes(long));
  }
});

test('mailto: aun con campos clave larguísimos entra (último recurso)', () => {
  const values: Values = { ...good, contactName: 'N'.repeat(120), venue: 'V'.repeat(140), city: 'C'.repeat(100), eventName: 'E'.repeat(140), email: `${'a'.repeat(100)}@example.com`, fee: 'F'.repeat(80) };
  const fitted = fitDraft(BOOKING_FORM, values, labels(BOOKING_FORM, 'es'), 'ailen@example.com');
  assert.ok(buildMailto(fitted.draft).length <= MAILTO_SAFE_LENGTH);
});

test('plantilla sin JS: solo campos clave, vacíos, y entra en un mailto', () => {
  for (const form of [BOOKING_FORM, ADVANCE_FORM]) {
    const t = buildTemplate(form, labels(form, 'es'), 'ailen@example.com');
    assert.ok(fitsMailto(t));
    const body = String(Array.isArray(t.body) ? t.body.join('\n') : t.body);
    const core = form.fields.filter((f) => f.core);
    assert.ok(core.length >= 5);
    assert.doesNotMatch(body, /Algo más que quieras contar|Notas:/);
  }
});

test('advance: validación de horas y teléfono obligatorio', () => {
  const e = validate(ADVANCE_FORM, { setStart: '9:00' }, TODAY);
  assert.equal(e.setStart, 'time');
  assert.equal(e.setEnd, 'required');
  assert.equal(e.sitePhone, 'required');
  assert.equal(e.senderEmail, 'required');
});

test('displayValue: casillas y selects', () => {
  const L = labels(BOOKING_FORM, 'en');
  const monitors = BOOKING_FORM.fields.find((f) => f.id === 'monitors')!;
  const slot = BOOKING_FORM.fields.find((f) => f.id === 'slot')!;
  assert.equal(displayValue(monitors, 'on', L), 'Yes');
  assert.equal(displayValue(monitors, '', L), '');
  assert.equal(displayValue(slot, 'peak', L), 'Peak time');
});

test('cada campo select tiene opciones y cada campo obligatorio está en el paso 1 o en el advance', () => {
  for (const form of [BOOKING_FORM, ADVANCE_FORM]) {
    for (const f of form.fields) {
      if (f.kind === 'select') assert.ok(f.options?.length, `${form.id}.${f.id} sin opciones`);
      assert.ok(f.step >= 1 && f.step <= form.fieldSteps);
    }
    assert.equal(form.steps, form.fieldSteps + 1);
  }
  assert.ok(BOOKING_FORM.fields.filter((f) => f.required).every((f) => f.step === 1));
});
