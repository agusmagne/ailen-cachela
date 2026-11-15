/**
 * Ayudas del paquete booking que dependen de los textos de interfaz (`t`): por eso viven junto a los componentes y no
 * en src/lib/booking (que es puro y se prueba con node).
 */
import { t, site, type Lang } from '../../lib/content';
import type { FormDef, Labels } from '../../lib/booking/form';
import type { GearInput } from '../../lib/booking/booth';
import type { Rig } from '../../lib/schemas/booking';
import { buildVCard } from '../../lib/downloads/vcard';

/** "contactName" -> "contact_name": las claves de interfaz son minúsculas con guiones bajos. */
export const snake = (id: string) => id.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const tag = (form: FormDef) => (form.id === 'booking' ? 'b' : 'a');
const has = (key: string) => key in site.ui;

export const fieldLabelKey = (form: FormDef, id: string) => `booking_f${tag(form)}_${snake(id)}`;
export const fieldHintKey = (form: FormDef, id: string) => `booking_h${tag(form)}_${snake(id)}`;
export const optionKey = (form: FormDef, id: string, value: string) => `booking_o${tag(form)}_${snake(id)}_${value}`;
export const sectionKey = (form: FormDef, step: number) => `booking_s${tag(form)}_${step}`;

export const hint = (form: FormDef, id: string, lang: Lang): string => (has(fieldHintKey(form, id)) ? t(fieldHintKey(form, id), lang) : '');

/** Todos los textos que necesita la lógica pura para armar el mail, en el idioma de la página. */
export function formLabels(form: FormDef, lang: Lang): Labels {
  const fields: Labels['fields'] = {};
  const options: Labels['options'] = {};
  for (const f of form.fields) {
    fields[f.id] = t(fieldLabelKey(form, f.id), lang);
    for (const o of f.options ?? []) options[`${f.id}.${o}`] = t(optionKey(form, f.id, o), lang);
  }
  const sections: Labels['sections'] = {};
  for (let s = 1; s <= form.fieldSteps; s++) sections[s] = t(sectionKey(form, s), lang);
  return {
    fields,
    options,
    sections,
    yes: t('booking_yes', lang),
    subject: t(`booking_mail_subject_${form.id}`, lang),
    greeting: t(`booking_mail_greeting_${form.id}`, lang),
    closing: t('booking_mail_closing', lang),
    trimmedNote: t('booking_mail_trimmed', lang),
  };
}

/** Piezas de un rider en el idioma de la página, listas para el diagrama. */
export const gearInputs = (rig: Rig, lang: Lang): GearInput[] =>
  rig.gear.map((g) => ({ kind: g.kind, qty: g.qty, model: g.model[lang], confirm: g.confirm }));

/** "2 × CDJ-3000X + 1 × DJM-V10": resumen en una línea de una configuración. */
export const rigSummary = (rig: Rig, lang: Lang): string =>
  rig.gear
    .filter((g) => !g.confirm || g.kind === 'mixer')
    .map((g) => `${g.qty} × ${g.model[lang]}`)
    .join(' + ');

/** Nombre de archivo de un PDF/descarga del paquete. */
export const dl = {
  tech: (lang: Lang) => `ailen-cachela-rider-tecnico-${lang}.pdf`,
  hospitality: (lang: Lang) => `ailen-cachela-rider-hospitalidad-${lang}.pdf`,
  advance: (lang: Lang) => `ailen-cachela-advance-${lang}.pdf`,
  vcard: (lang: Lang) => `ailen-cachela-booking-${lang}.vcf`,
  pack: (lang: Lang) => `ailen-cachela-booking-pack-${lang}.zip`,
};
export const dlPath = (file: string) => `downloads/booking/${file}`;

/** vCard del contacto de booking: solo el email verificado (sin teléfono). */
export const bookingVCard = (lang: Lang, siteUrl: string): string =>
  buildVCard({
    name: site.artist.name,
    org: site.artist.name,
    title: t('booking_vcard_title', lang),
    email: site.contact.email,
    url: siteUrl,
    city: site.artist.city,
    country: site.artist.country,
    note: t('booking_vcard_note', lang),
  });
