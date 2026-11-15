import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { schema, VERIFIED_MODELS } from '../src/lib/schemas/booking.ts';
import { loadDomain } from '../src/lib/content-loader.ts';
import { countDemo } from '../src/lib/demo-core.ts';
import { ADVANCE_FORM, BOOKING_FORM } from '../src/lib/booking/form.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const ui = parse(read('src/content/ui/booking.yaml')) as Record<string, { es: string; en: string }>;
const raw = read('src/content/booking.yaml');
const snake = (id: string) => id.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('textos de interfaz: prefijo, es y en completos y sin relleno', () => {
  for (const [k, v] of Object.entries(ui)) {
    assert.ok(k.startsWith('booking_'), k);
    assert.ok(v.es.trim() && v.en.trim(), `${k}: falta un idioma`);
    assert.doesNotMatch(`${v.es} ${v.en}`, /lorem|ipsum|\bTODO\b|FIXME/, k);
  }
});

test('todas las claves booking_* que usa el código existen (estáticas y las derivadas de formularios)', () => {
  const files = [...walk(join(root, 'src/components/booking')), ...walk(join(root, 'src/pages/booking')), join(root, 'src/scripts/modules/booking-form.ts')].filter((f) => /\.(astro|ts)$/.test(f));
  const used = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/['"`](booking_[a-z0-9_]+)['"`]/g)) used.add(m[1]);
  for (const k of used) assert.ok(k in ui, `falta la clave ${k}`);
  assert.ok(used.size > 100);
  // derivadas
  const need: string[] = [];
  for (const form of [BOOKING_FORM, ADVANCE_FORM]) {
    const tag = form.id === 'booking' ? 'b' : 'a';
    for (const f of form.fields) {
      need.push(`booking_f${tag}_${snake(f.id)}`);
      for (const o of f.options ?? []) need.push(`booking_o${tag}_${snake(f.id)}_${o}`);
    }
    for (let s = 1; s <= form.fieldSteps; s++) need.push(`booking_s${tag}_${s}`, `booking_si_${tag}_${s}`);
    need.push(`booking_mail_subject_${form.id}`, `booking_mail_greeting_${form.id}`, `booking_form_label_${form.id}`);
  }
  for (const e of ['required', 'email', 'date', 'past', 'time', 'number', 'range', 'url', 'option', 'long']) need.push(`booking_err_${e}`);
  for (const k of ['deck', 'mixer', 'turntable', 'laptop', 'monitor', 'mic', 'synth', 'drum', 'interface', 'fx']) need.push(`booking_k_${k}`, `booking_ks_${k}`);
  for (const m of ['dj', 'live', 'hybrid']) need.push(`booking_mode_${m}`, `booking_mode_${m}_intro`);
  for (const d of ['tech', 'hospitality', 'terms']) need.push(`booking_doc_${d}_title`, `booking_doc_${d}_kicker`, `booking_doc_${d}_text`);
  for (const k of need) assert.ok(k in ui, `falta la clave derivada ${k}`);
  // ninguna clave de interfaz huérfana de opciones o campos
  for (const k of Object.keys(ui).filter((x) => /^booking_(fb|fa)_/.test(x))) assert.ok(need.includes(k), `clave sin campo: ${k}`);
});

test('contenido: valida con demo encendido y apagado; todo es de ejemplo y se apaga', () => {
  const on = loadDomain('booking', raw, schema, true);
  const off = loadDomain('booking', raw, schema, false);
  assert.ok(countDemo(on) > 40);
  assert.equal(countDemo(off), 0);
  for (const key of ['items', 'process', 'rigs', 'requirements', 'brings', 'mismatch', 'inputs', 'cues', 'hospitality', 'terms'] as const) {
    assert.ok(on[key].length > 0, key);
    assert.equal(off[key].length, 0, `${key} no se apaga`);
    assert.ok(on[key].every((x) => x.demo === true), `${key}: todo ítem inventado lleva demo: true`);
  }
});

test('rider: solo los modelos verificados de Pioneer DJ salen como confirmados; el resto es "a confirmar"', () => {
  const on = loadDomain('booking', raw, schema, true);
  const verified = new Set<string>(VERIFIED_MODELS);
  for (const rig of on.rigs) {
    for (const gear of rig.gear) {
      if (gear.confirm) {
        assert.ok(!verified.has(gear.model.es) && !verified.has(gear.model.en), `${rig.id}: ${gear.model.es} es verificado, no debe ir como "a confirmar"`);
      } else {
        assert.ok(verified.has(gear.model.es) && gear.model.es === gear.model.en, `${rig.id}: "${gear.model.es}" no es un modelo verificado`);
      }
    }
    assert.ok(rig.gear.some((g) => g.kind === 'mixer'), `${rig.id}: sin mixer`);
  }
  // una configuración preferida por formato
  for (const mode of ['dj', 'live', 'hybrid'] as const) assert.equal(on.rigs.filter((r) => r.mode === mode && r.primary).length, 1, mode);
  // los cuatro mixers/reproductores del plan aparecen
  const names = new Set(on.rigs.flatMap((r) => r.gear.filter((g) => !g.confirm).map((g) => g.model.es)));
  for (const m of ['CDJ-3000X', 'DJM-V10', 'DJM-A9', 'DJM-S11', 'PLX-1000']) assert.ok(names.has(m), m);
});

test('condiciones: sin montos ni plazos definitivos y cada tema dice qué hay que revisar', () => {
  const on = loadDomain('booking', raw, schema, true);
  const text = (x: { es: string; en: string }) => `${x.es} ${x.en}`;
  for (const t of on.terms) {
    assert.ok(t.review.es.length > 10 && t.review.en.length > 10, t.id);
    const all = [text(t.text), ...t.points.map(text)].join(' ');
    assert.doesNotMatch(all, /\d+\s?%/, `${t.id}: porcentaje concreto`);
    assert.doesNotMatch(all, /[$€]\s?\d|\d\s?(USD|EUR|ARS)\b/, `${t.id}: monto concreto`);
  }
});

test('contenido de ejemplo: sin nombres de agencias, clubes ni marcas reales no verificadas', () => {
  const on = loadDomain('booking', raw, schema, true);
  for (const a of on.items) assert.match(a.agency.es, /de ejemplo/i);
  for (const a of on.items) assert.match(a.agency.en, /sample/i);
  const text = JSON.stringify(on).toLowerCase();
  for (const bad of ['wme', 'caa', 'wasserman', 'aae', 'boiler room', 'cercle', 'hör', 'funktion-one', 'void acoustics']) assert.ok(!text.includes(bad), bad);
});

test('hospitalidad: cada grupo separa lo imprescindible de lo que se pide si está disponible', () => {
  const on = loadDomain('booking', raw, schema, true);
  for (const g of on.hospitality) assert.ok(g.lines.some((l) => l.priority === 'must'), g.id);
  assert.ok(on.hospitality.some((g) => g.lines.some((l) => l.priority === 'nice')));
});
