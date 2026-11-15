/**
 * Consultas por mail sin backend (servicios, clases, convocatoria de demos). Lógica pura (se prueba con node:test):
 * arma el borrador con `src/lib/mailto.ts`, valida los campos y mide si entra en un `mailto:`.
 * Nada sale del dispositivo hasta que la persona envía el mail desde su cliente.
 */
import { buildMailto, fitsMailto, plainDraft, MAILTO_SAFE_LENGTH, type MailDraft } from '../mailto.ts';

export interface InquiryLine {
  label: string;
  value: string;
}

export interface InquiryInput {
  to: string;
  subject: string;
  greeting: string;
  lines: InquiryLine[];
  /** Texto libre largo (el "mensaje"): va al final, en su propio bloque. */
  message?: InquiryLine;
  closing: string;
  /** Prefijo del asunto para marcar contenido de ejemplo, p. ej. "[Ejemplo] ". */
  subjectPrefix?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Arma el borrador. Los campos vacíos quedan como "etiqueta:" para que se completen a mano en el correo. */
export function buildInquiry(i: InquiryInput): MailDraft {
  const body: string[] = [i.greeting, ''];
  for (const l of i.lines) body.push(`${l.label}: ${clean(l.value)}`.trimEnd());
  if (i.message) {
    body.push('', `${i.message.label}:`, i.message.value.trim());
  }
  body.push('', i.closing);
  return { to: i.to, subject: `${i.subjectPrefix ?? ''}${i.subject}`, body };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

export type FieldError = 'required' | 'email';

/** Valida los campos obligatorios; devuelve clave -> error (vacío si todo está bien). */
export function validateInquiry(values: Record<string, string>, required: readonly string[], emailKeys: readonly string[] = []): Record<string, FieldError> {
  const out: Record<string, FieldError> = {};
  for (const k of required) if (!(values[k] ?? '').trim()) out[k] = 'required';
  for (const k of emailKeys) if (!out[k] && (values[k] ?? '').trim() && !isEmail(values[k])) out[k] = 'email';
  return out;
}

export interface InquiryStatus {
  href: string;
  length: number;
  fits: boolean;
  /** Texto completo para pegar a mano en cualquier cliente (respaldo del mailto). */
  plain: string;
}

export function inquiryStatus(draft: MailDraft): InquiryStatus {
  const href = buildMailto(draft);
  return { href, length: href.length, fits: fitsMailto(draft), plain: plainDraft(draft) };
}

export { MAILTO_SAFE_LENGTH };
