/**
 * Formulario de alta por mail (newsletter): arma el `mailto:` con lo que la persona elige y ofrece copiar el texto.
 * Sin JS el enlace trae un mensaje base. Nada se envía ni se guarda: el mail lo manda la persona desde su programa.
 */
import { newsletterDraft, buildMailto, plainDraft, type NewsletterMailStrings } from '../../lib/fans/mail.ts';

interface Props {
  strings: NewsletterMailStrings;
  langNames: Record<'es' | 'en' | 'both', string>;
}

export default function (root: HTMLElement, raw: Record<string, unknown>) {
  const { strings, langNames } = raw as unknown as Props;
  const form = root.querySelector<HTMLFormElement>('[data-mailform]');
  const link = root.querySelector<HTMLAnchorElement>('[data-mail-link]');
  const copy = root.querySelector<HTMLButtonElement>('[data-copy]');
  if (!form || !link) return;
  if (copy) copy.hidden = false;

  const refresh = () => {
    const name = form.querySelector<HTMLInputElement>('[data-field="name"]')?.value ?? '';
    const lang = form.querySelector<HTMLInputElement>('[data-field="lang"]:checked')?.value as keyof typeof langNames | undefined;
    const topics = Array.from(form.querySelectorAll<HTMLInputElement>('[data-field="topic"]:checked')).map((i) => i.closest('label')?.textContent?.trim() ?? i.value);
    const draft = newsletterDraft(strings, { name, lang: langNames[lang ?? 'both'], topics });
    link.href = buildMailto(draft);
    if (copy) copy.dataset.copy = plainDraft(draft);
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  refresh();
}
