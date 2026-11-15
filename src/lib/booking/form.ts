/**
 * Lógica pura de los formularios de booking y advance (sin Astro ni Vite: se prueba con node:test).
 *
 * Nada se envía a un servicio: el resultado es un `mailto:` con el cuerpo prellenado y el mismo texto para copiar.
 * Los clientes de correo cortan los `mailto:` largos, así que `fitDraft` arma una versión compacta (campos clave)
 * que SIEMPRE entra en MAILTO_SAFE_LENGTH; el texto completo se ofrece para copiar y pegar.
 */
import { buildMailto, fitsMailto, plainDraft, type MailDraft } from '../mailto.ts';

export type FieldKind = 'text' | 'email' | 'date' | 'time' | 'number' | 'url' | 'select' | 'textarea' | 'checkbox';

export interface FieldDef {
  id: string;
  /** Paso del formulario (1..fieldSteps). */
  step: number;
  kind: FieldKind;
  required?: boolean;
  /** select: valores permitidos (los textos salen de la interfaz: booking_o_<campo>_<valor>). */
  options?: readonly string[];
  /** date: no puede ser anterior a hoy. */
  future?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  autocomplete?: string;
  inputmode?: 'text' | 'numeric' | 'tel' | 'email' | 'url';
  /** Va también en el mail compacto y en la plantilla sin JS. */
  core?: boolean;
}

export interface FormDef {
  id: 'booking' | 'advance';
  /** Cantidad de pasos, contando el resumen final (que no tiene campos). */
  steps: number;
  /** Pasos con campos (1..fieldSteps). El siguiente es el resumen. */
  fieldSteps: number;
  fields: FieldDef[];
}

export const BOOKING_FORM: FormDef = {
  id: 'booking',
  steps: 4,
  fieldSteps: 3,
  fields: [
    // 1 · Evento y lugar
    { id: 'contactName', step: 1, kind: 'text', required: true, core: true, autocomplete: 'name', maxLength: 120 },
    { id: 'organization', step: 1, kind: 'text', autocomplete: 'organization', maxLength: 120 },
    { id: 'email', step: 1, kind: 'email', required: true, core: true, autocomplete: 'email', inputmode: 'email', maxLength: 160 },
    { id: 'eventName', step: 1, kind: 'text', maxLength: 140, core: true },
    { id: 'eventType', step: 1, kind: 'select', required: true, core: true, options: ['club', 'festival', 'after', 'private', 'stream', 'other'] },
    { id: 'date', step: 1, kind: 'date', required: true, core: true, future: true },
    { id: 'altDate', step: 1, kind: 'date', future: true },
    { id: 'city', step: 1, kind: 'text', required: true, core: true, maxLength: 100 },
    { id: 'country', step: 1, kind: 'text', maxLength: 100 },
    { id: 'venue', step: 1, kind: 'text', required: true, core: true, maxLength: 140 },
    { id: 'capacity', step: 1, kind: 'number', min: 1, max: 500000, inputmode: 'numeric' },
    { id: 'startTime', step: 1, kind: 'time' },
    { id: 'endTime', step: 1, kind: 'time' },
    // 2 · Line-up y técnica
    { id: 'lineup', step: 2, kind: 'textarea', maxLength: 800 },
    { id: 'slot', step: 2, kind: 'select', options: ['warmup', 'peak', 'closing', 'after', 'tbd'], core: true },
    { id: 'format', step: 2, kind: 'select', options: ['dj', 'live', 'hybrid', 'tbd'], core: true },
    { id: 'duration', step: 2, kind: 'select', options: ['1h', '2h', '3h', 'other'] },
    { id: 'equipment', step: 2, kind: 'select', options: ['rider', 'other', 'unknown'] },
    { id: 'monitors', step: 2, kind: 'checkbox' },
    { id: 'mic', step: 2, kind: 'checkbox' },
    { id: 'links', step: 2, kind: 'url', maxLength: 300, inputmode: 'url' },
    { id: 'techNotes', step: 2, kind: 'textarea', maxLength: 600 },
    // 3 · Economía y logística
    { id: 'fee', step: 3, kind: 'text', maxLength: 80, core: true },
    { id: 'currency', step: 3, kind: 'select', options: ['ars', 'usd', 'eur', 'other'] },
    { id: 'travel', step: 3, kind: 'select', options: ['promoter', 'included', 'discuss'] },
    { id: 'people', step: 3, kind: 'number', min: 1, max: 10, inputmode: 'numeric' },
    { id: 'nights', step: 3, kind: 'number', min: 0, max: 14, inputmode: 'numeric' },
    { id: 'transfer', step: 3, kind: 'checkbox' },
    { id: 'notes', step: 3, kind: 'textarea', maxLength: 800 },
  ],
};

export const ADVANCE_FORM: FormDef = {
  id: 'advance',
  steps: 2,
  fieldSteps: 1,
  fields: [
    { id: 'event', step: 1, kind: 'text', required: true, core: true, maxLength: 140 },
    { id: 'date', step: 1, kind: 'date', required: true, core: true, future: true },
    { id: 'venue', step: 1, kind: 'text', required: true, core: true, maxLength: 140 },
    { id: 'address', step: 1, kind: 'text', maxLength: 200 },
    { id: 'siteName', step: 1, kind: 'text', required: true, core: true, maxLength: 120 },
    { id: 'sitePhone', step: 1, kind: 'text', required: true, core: true, maxLength: 40, inputmode: 'tel', autocomplete: 'tel' },
    { id: 'loadIn', step: 1, kind: 'time', core: true },
    { id: 'soundcheck', step: 1, kind: 'time' },
    { id: 'setStart', step: 1, kind: 'time', required: true, core: true },
    { id: 'setEnd', step: 1, kind: 'time', required: true, core: true },
    { id: 'curfew', step: 1, kind: 'time' },
    { id: 'equipment', step: 1, kind: 'select', options: ['rider', 'changes', 'unknown'] },
    { id: 'monitors', step: 1, kind: 'checkbox' },
    { id: 'guestDeadline', step: 1, kind: 'date' },
    { id: 'guestCount', step: 1, kind: 'number', min: 0, max: 200, inputmode: 'numeric' },
    { id: 'hotel', step: 1, kind: 'select', options: ['yes', 'no', 'tbd'] },
    { id: 'transport', step: 1, kind: 'textarea', maxLength: 400 },
    { id: 'payment', step: 1, kind: 'text', maxLength: 160 },
    { id: 'notes', step: 1, kind: 'textarea', maxLength: 800 },
    { id: 'senderName', step: 1, kind: 'text', required: true, core: true, autocomplete: 'name', maxLength: 120 },
    { id: 'senderEmail', step: 1, kind: 'email', required: true, autocomplete: 'email', inputmode: 'email', maxLength: 160 },
  ],
};

export const FORMS = { booking: BOOKING_FORM, advance: ADVANCE_FORM } as const;

/** Valores del formulario por id de campo. Una casilla marcada es "on"; vacía, "". */
export type Values = Record<string, string>;
export type ErrorCode = 'required' | 'email' | 'date' | 'past' | 'time' | 'number' | 'range' | 'url' | 'option' | 'long';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(v: string): boolean {
  if (!ISO.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(v);
}

/** Valida un campo. `today` es "YYYY-MM-DD" (se pasa de afuera para que la prueba sea determinista). */
export function validateField(def: FieldDef, raw: string | undefined, today: string): ErrorCode | null {
  const value = (raw ?? '').trim();
  if (value === '') return def.required ? 'required' : null;
  if (def.maxLength && value.length > def.maxLength) return 'long';
  switch (def.kind) {
    case 'email':
      return EMAIL.test(value) ? null : 'email';
    case 'date':
      if (!isValidDate(value)) return 'date';
      return def.future && value < today ? 'past' : null;
    case 'time':
      return TIME.test(value) ? null : 'time';
    case 'number': {
      if (!/^\d{1,7}$/.test(value)) return 'number';
      const n = Number(value);
      return (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max) ? 'range' : null;
    }
    case 'url':
      try {
        const u = new URL(value);
        return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'url';
      } catch {
        return 'url';
      }
    case 'select':
      return def.options?.includes(value) ? null : 'option';
    default:
      return null;
  }
}

/** Errores por campo. `step` limita la validación a un paso (para el botón "Siguiente"). */
export function validate(form: FormDef, values: Values, today: string, step?: number): Record<string, ErrorCode> {
  const errors: Record<string, ErrorCode> = {};
  for (const f of form.fields) {
    if (step !== undefined && f.step !== step) continue;
    const e = validateField(f, values[f.id], today);
    if (e) errors[f.id] = e;
  }
  return errors;
}

/** Textos ya resueltos al idioma de la página (los arma el componente con `t()`). */
export interface Labels {
  /** Etiqueta de cada campo, por id. */
  fields: Record<string, string>;
  /** Texto de cada opción, con la clave "<campo>.<valor>". */
  options: Record<string, string>;
  /** Título de cada paso con campos, por número. */
  sections: Record<number, string>;
  /** Texto de una casilla marcada. */
  yes: string;
  subject: string;
  greeting: string;
  closing: string;
  /** Línea que se agrega al mail compacto cuando se recortó. */
  trimmedNote: string;
}

export interface Section {
  title: string;
  lines: { text: string; core: boolean }[];
}

/** Texto de un valor ya presentable ("Club", "Sí", "128", ...). */
export function displayValue(def: FieldDef, value: string, labels: Labels): string {
  const v = value.trim();
  if (def.kind === 'checkbox') return v ? labels.yes : '';
  if (def.kind === 'select') return labels.options[`${def.id}.${v}`] ?? v;
  return v.replace(/\s*\r?\n\s*/g, ' / ');
}

export interface SectionOptions {
  /** Incluye también los campos vacíos como "Etiqueta:" (plantilla para completar a mano). */
  includeEmpty?: boolean;
  /** Solo los campos clave. */
  coreOnly?: boolean;
}

export function buildSections(form: FormDef, values: Values, labels: Labels, opts: SectionOptions = {}): Section[] {
  const out: Section[] = [];
  for (let step = 1; step <= form.fieldSteps; step++) {
    const lines: Section['lines'] = [];
    for (const f of form.fields.filter((x) => x.step === step)) {
      if (opts.coreOnly && !f.core) continue;
      const shown = displayValue(f, values[f.id] ?? '', labels);
      if (!shown && !opts.includeEmpty) continue;
      lines.push({ text: `${labels.fields[f.id] ?? f.id}: ${shown}`.trimEnd(), core: Boolean(f.core) });
    }
    if (lines.length) out.push({ title: labels.sections[step] ?? '', lines });
  }
  return out;
}

/** Nombre de quien escribe (según el formulario). */
const senderOf = (form: FormDef, values: Values) => (values[form.id === 'booking' ? 'contactName' : 'senderName'] ?? '').trim();

export function renderBody(form: FormDef, sections: Section[], values: Values, labels: Labels, extra: string[] = []): string[] {
  const lines = [labels.greeting, ''];
  for (const s of sections) {
    if (s.title) lines.push(`— ${s.title} —`);
    for (const l of s.lines) lines.push(l.text);
    lines.push('');
  }
  for (const e of extra) lines.push(e, '');
  lines.push(labels.closing);
  const who = senderOf(form, values);
  if (who) lines.push(who);
  return lines;
}

/** Asunto: "Consulta de booking · Evento · 2027-03-05 · Ciudad", sin partes vacías. */
export function buildSubject(form: FormDef, values: Values, labels: Labels): string {
  const get = (id: string) => (values[id] ?? '').trim();
  const name = form.id === 'booking' ? get('eventName') || displayValue(BOOKING_FORM.fields.find((f) => f.id === 'eventType')!, get('eventType'), labels) : get('event');
  const where = form.id === 'booking' ? get('city') : get('venue');
  return [labels.subject, name, get('date'), where].filter(Boolean).join(' · ').slice(0, 150);
}

/** Borrador completo (el que se copia). */
export function buildDraft(form: FormDef, values: Values, labels: Labels, to: string): MailDraft {
  return { to, subject: buildSubject(form, values, labels), body: renderBody(form, buildSections(form, values, labels), values, labels) };
}

/** Plantilla sin JS: solo campos clave, vacíos, para completar en el cliente de correo. */
export function buildTemplate(form: FormDef, labels: Labels, to: string): MailDraft {
  const sections = buildSections(form, {}, labels, { includeEmpty: true, coreOnly: true });
  return { to, subject: labels.subject, body: renderBody(form, sections, {}, labels) };
}

export interface FittedDraft {
  /** Lo que se abre con el botón "Abrir en mi correo": siempre cabe en un mailto. */
  draft: MailDraft;
  /** true si hubo que recortar: se avisa y se ofrece copiar el texto completo. */
  trimmed: boolean;
}

/**
 * Devuelve el borrador completo si entra en un `mailto:`; si no, uno compacto: saca los renglones no clave desde el final,
 * agrega la nota de recorte y, como último recurso, acorta los renglones más largos. Nunca devuelve algo que no entre.
 */
export function fitDraft(form: FormDef, values: Values, labels: Labels, to: string): FittedDraft {
  const full = buildDraft(form, values, labels, to);
  if (fitsMailto(full)) return { draft: full, trimmed: false };

  const sections = buildSections(form, values, labels).map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }));
  const make = () => ({ to, subject: full.subject, body: renderBody(form, sections.filter((s) => s.lines.length), values, labels, [labels.trimmedNote]) });

  // 1) quitar renglones no clave, de atrás para adelante
  for (let si = sections.length - 1; si >= 0 && !fitsMailto(make()); si--) {
    for (let li = sections[si].lines.length - 1; li >= 0 && !fitsMailto(make()); li--) {
      if (!sections[si].lines[li].core) sections[si].lines.splice(li, 1);
    }
  }
  // 2) acortar renglones largos (los clave también), de a poco
  let max = 160;
  while (!fitsMailto(make()) && max >= 24) {
    for (const s of sections) for (const l of s.lines) if (l.text.length > max) l.text = `${l.text.slice(0, max - 1).trimEnd()}…`;
    max = Math.floor(max * 0.7);
  }
  // 3) asunto corto como último recurso
  let draft = make();
  if (!fitsMailto(draft)) draft = { ...draft, subject: labels.subject };
  if (!fitsMailto(draft)) draft = { to, subject: labels.subject, body: [labels.greeting, '', labels.trimmedNote] };
  return { draft, trimmed: true };
}

/** El texto que se copia: encabezado "To / Subject" y cuerpo completo, el mismo que arma el mail. */
export const copyText = (form: FormDef, values: Values, labels: Labels, to: string): string => plainDraft(buildDraft(form, values, labels, to));

export { buildMailto, fitsMailto };
