/** Mails armados sin backend para la tienda y la newsletter (puro: se prueba con node:test). Usa src/lib/mailto.ts. */
import { buildMailto, fitsMailto, plainDraft, type MailDraft } from '../mailto.ts';

export interface ShopMailStrings {
  to: string;
  subject: string;
  hello: string;
  intro: string;
  nameLabel: string;
  signoff: string;
}

/** Consulta de tienda: una línea por producto y, si hay, el nombre. */
export function shopDraft(s: ShopMailStrings, items: string[], name = ''): MailDraft {
  const body = [s.hello, '', s.intro, ...items.map((i) => `- ${i}`), ''];
  if (name.trim()) body.push(`${s.nameLabel}: ${name.trim()}`, '');
  body.push(s.signoff);
  return { to: s.to, subject: s.subject, body };
}

export interface NewsletterMailStrings {
  to: string;
  subject: string;
  hello: string;
  nameLabel: string;
  langLabel: string;
  topicsLabel: string;
  anyTopic: string;
  signoff: string;
}

export function newsletterDraft(s: NewsletterMailStrings, data: { name?: string; lang: string; topics: string[] }): MailDraft {
  const body = [s.hello, ''];
  if (data.name?.trim()) body.push(`${s.nameLabel}: ${data.name.trim()}`);
  body.push(`${s.langLabel}: ${data.lang}`);
  body.push(`${s.topicsLabel}: ${data.topics.length ? data.topics.join(', ') : s.anyTopic}`, '', s.signoff);
  return { to: s.to, subject: s.subject, body };
}

export { buildMailto, fitsMailto, plainDraft };
