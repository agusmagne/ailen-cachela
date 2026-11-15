/**
 * Formulario de consulta por mail (paquete oficio). Mejora el `mailto:` base de Inquiry.astro: arma el mensaje en vivo,
 * valida al abrir el correo, avisa si el mensaje es largo y ofrece copiar el texto. No envía nada a ningún servicio.
 */
import { buildInquiry, inquiryStatus, validateInquiry, type InquiryLine } from '../../lib/oficio/inquiry.ts';

interface FieldProp {
  key: string;
  label: string;
  required: boolean;
  email: boolean;
}
interface Props {
  to: string;
  subject: string;
  subjectPrefix: string;
  greeting: string;
  closing: string;
  messageKey: string;
  fields: FieldProp[];
  msg: { required: string; email: string; ready: string; long: string; copied: string; copyFail: string; fix: string };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = (document as unknown as { execCommand(cmd: string): boolean }).execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export default function init(el: HTMLElement, raw: Record<string, unknown>) {
  const p = raw as unknown as Props;
  const form = el.querySelector<HTMLFormElement>('[data-inq]');
  const open = el.querySelector<HTMLAnchorElement>('[data-inq-open]');
  const copy = el.querySelector<HTMLButtonElement>('[data-inq-copy]');
  const status = el.querySelector<HTMLElement>('[data-inq-status]');
  if (!form || !open) return;
  const id = form.dataset.inqId ?? 'inq';
  const control = (key: string) => form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-inq-field="${key}"]`);
  const optionText = (c: HTMLSelectElement) => c.selectedOptions[0]?.textContent?.trim() ?? c.value;

  const values = () => Object.fromEntries(p.fields.map((f) => [f.key, control(f.key)?.value ?? '']));
  const display = (f: FieldProp) => {
    const c = control(f.key);
    return c instanceof HTMLSelectElement ? optionText(c) : (c?.value ?? '');
  };
  const draft = () => {
    const lines: InquiryLine[] = p.fields.filter((f) => f.key !== p.messageKey).map((f) => ({ label: f.label, value: display(f) }));
    const m = p.fields.find((f) => f.key === p.messageKey);
    return buildInquiry({
      to: p.to,
      subject: p.subject,
      subjectPrefix: p.subjectPrefix,
      greeting: p.greeting,
      closing: p.closing,
      lines,
      message: m ? { label: m.label, value: control(m.key)?.value ?? '' } : undefined,
    });
  };
  const say = (text: string) => {
    if (status) status.textContent = text;
  };

  const refresh = () => {
    const s = inquiryStatus(draft());
    open.href = s.href;
    say(s.fits ? '' : p.msg.long);
    return s;
  };

  const showErrors = (errs: Record<string, 'required' | 'email'>) => {
    for (const f of p.fields) {
      const c = control(f.key);
      const out = form.querySelector<HTMLElement>(`#${id}-${f.key}-err`);
      const e = errs[f.key];
      if (c) c.setAttribute('aria-invalid', e ? 'true' : 'false');
      if (out) {
        out.hidden = !e;
        out.textContent = e ? (e === 'email' ? p.msg.email : p.msg.required) : '';
      }
    }
  };

  const check = () => {
    const errs = validateInquiry(
      values(),
      p.fields.filter((f) => f.required).map((f) => f.key),
      p.fields.filter((f) => f.email).map((f) => f.key),
    );
    showErrors(errs);
    return errs;
  };

  form.addEventListener('input', () => {
    refresh();
    // Corrige los errores a medida que la persona escribe
    if (form.querySelector('[aria-invalid="true"]')) check();
  });
  form.addEventListener('change', refresh);
  form.addEventListener('submit', (e) => e.preventDefault());

  open.addEventListener('click', (e) => {
    const errs = check();
    const first = p.fields.find((f) => errs[f.key]);
    if (first) {
      e.preventDefault();
      say(p.msg.fix);
      control(first.key)?.focus();
      return;
    }
    refresh();
  });

  if (copy) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      const errs = check();
      const first = p.fields.find((f) => errs[f.key]);
      if (first) {
        say(p.msg.fix);
        control(first.key)?.focus();
        return;
      }
      const ok = await copyText(refresh().plain);
      say(ok ? p.msg.copied : p.msg.copyFail);
    });
  }
  refresh();
  if (!status?.textContent) say('');
}
