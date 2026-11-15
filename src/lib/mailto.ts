/**
 * Armado de mails sin backend (booking, consultas, clases): `mailto:` con asunto y cuerpo prellenados.
 * Nada sale del dispositivo hasta que la persona envía el mail desde su cliente. Los clientes cortan los
 * `mailto:` muy largos, por eso `fitsMailto` avisa y el formulario ofrece además copiar el texto.
 */

export interface MailDraft {
  to: string;
  subject: string;
  /** Líneas del cuerpo. Se unen con saltos de línea (CRLF, como pide RFC 6068). */
  body: string[] | string;
}

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

export function bodyText(body: string[] | string): string {
  return Array.isArray(body) ? body.join('\n') : body;
}

export function buildMailto({ to, subject, body }: MailDraft): string {
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlf(bodyText(body)))}`;
  return `mailto:${to}?${params}`;
}

/** Los clientes de correo y los navegadores aguantan ~2000 caracteres de URL de forma confiable. */
export const MAILTO_SAFE_LENGTH = 1900;
export const fitsMailto = (draft: MailDraft) => buildMailto(draft).length <= MAILTO_SAFE_LENGTH;

/** Texto completo para pegar a mano ("Para / Asunto / cuerpo"): el respaldo cuando no hay cliente de correo. */
export function plainDraft({ to, subject, body }: MailDraft): string {
  return `To: ${to}\nSubject: ${subject}\n\n${bodyText(body)}`;
}
