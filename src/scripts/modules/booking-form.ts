/**
 * Formulario por pasos de booking / advance (módulo de LazyModule). Mejora progresiva sobre el marcado de
 * MailForm.astro: sin este script todos los pasos se ven apilados y el botón final abre el correo.
 * Nada se envía a un servicio: arma un `mailto:` (siempre dentro de MAILTO_SAFE_LENGTH) y ofrece copiar el texto completo.
 */
import { FORMS, buildMailto, copyText, displayValue, fitDraft, validate, type ErrorCode, type FormDef, type Labels, type Values } from '../../lib/booking/form.ts';

interface Props {
  form: 'booking' | 'advance';
  to: string;
  labels: Labels;
  ui: {
    progress: string;
    next: string;
    review: string;
    back: string;
    errorsTitle: string;
    summaryEmpty: string;
    copied: string;
    copyFailed: string;
    openedAfterCopy: string;
    errors: Record<ErrorCode, string>;
  };
}

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

function todayIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

async function copyToClipboard(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* sin permiso: se prueba el método clásico */
  }
  // Sin portapapeles: se deja el texto seleccionado para que la persona lo copie con el teclado
  fallback?.focus();
  fallback?.select();
  return false;
}

export default function (el: HTMLElement, props: Props) {
  const def: FormDef = FORMS[props.form];
  const { labels, ui, to } = props;
  const form = el.querySelector<HTMLFormElement>('[data-mf-form]');
  if (!form) return;
  const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel);
  const steps = Array.from(el.querySelectorAll<HTMLElement>('[data-step]'));
  const summaryStep = def.fieldSteps + 1;
  const top = q('[data-mf-top]');
  const progress = q('[data-mf-progress]');
  const alertBox = q('[data-mf-alert]');
  const nav = q('[data-mf-nav]');
  const nojs = q('[data-mf-nojs]');
  const back = q<HTMLButtonElement>('[data-mf-back]');
  const next = q<HTMLButtonElement>('[data-mf-next]');
  const open = q<HTMLAnchorElement>('[data-mf-open]');
  const copy = q<HTMLButtonElement>('[data-mf-copy]');
  const copyLabel = q('[data-mf-copy-label]');
  const status = q('[data-mf-status]');
  const raw = q<HTMLTextAreaElement>('[data-mf-raw]');
  const summary = q('[data-mf-summary]');
  const trim = q('[data-mf-trim]');
  if (!top || !progress || !alertBox || !nav || !back || !next || !open || !copy || !raw || !summary) return;

  // ---- Mejora: se oculta lo de "sin JS" y aparecen progreso y navegación ----
  el.classList.add('is-enhanced');
  form.noValidate = true;
  top.hidden = false;
  nav.hidden = false;
  if (nojs) nojs.hidden = true;
  el.style.setProperty('--mf-count', String(def.steps));
  const today = todayIso();
  for (const f of def.fields) if (f.future) form.querySelector<HTMLInputElement>(`[name="${f.id}"]`)?.setAttribute('min', today);

  const field = (id: string) => form.querySelector<HTMLElement>(`[data-field="${id}"]`);
  const control = (id: string) => form.elements.namedItem(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

  const values = (): Values => {
    const v: Values = {};
    for (const f of def.fields) {
      const c = control(f.id);
      if (!c) continue;
      v[f.id] = c instanceof HTMLInputElement && c.type === 'checkbox' ? (c.checked ? 'on' : '') : c.value;
    }
    return v;
  };

  // ---- Errores ----
  const clearError = (id: string) => {
    const box = field(id);
    box?.classList.remove('has-error');
    const msg = box?.querySelector<HTMLElement>('[data-mf-error]');
    if (msg) {
      msg.hidden = true;
      msg.textContent = '';
    }
    control(id)?.removeAttribute('aria-invalid');
  };
  const showError = (id: string, code: ErrorCode) => {
    const box = field(id);
    box?.classList.add('has-error');
    const msg = box?.querySelector<HTMLElement>('[data-mf-error]');
    if (msg) {
      msg.textContent = ui.errors[code];
      msg.hidden = false;
    }
    control(id)?.setAttribute('aria-invalid', 'true');
  };
  const clearAll = () => {
    for (const f of def.fields) clearError(f.id);
    alertBox.hidden = true;
    alertBox.replaceChildren();
  };

  /** Valida un paso. Si hay errores los muestra, arma el resumen de errores y enfoca el primer campo. */
  const checkStep = (step: number): boolean => {
    clearAll();
    const errors = validate(def, values(), today, step);
    const ids = def.fields.filter((f) => errors[f.id]).map((f) => f.id);
    if (!ids.length) return true;
    for (const id of ids) showError(id, errors[id]);
    const title = document.createElement('p');
    title.className = 'label';
    title.textContent = fill(ui.errorsTitle, { n: ids.length });
    const list = document.createElement('ul');
    for (const id of ids) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const c = control(id);
      a.href = `#${c?.id ?? ''}`;
      a.textContent = `${labels.fields[id]}: ${ui.errors[errors[id]]}`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        c?.focus();
      });
      li.append(a);
      list.append(li);
    }
    alertBox.replaceChildren(title, list);
    alertBox.hidden = false;
    control(ids[0])?.focus();
    return false;
  };

  // ---- Pasos ----
  let current = 1;
  const stepTitle = (n: number) => (n === summaryStep ? el.querySelector<HTMLElement>(`[data-step="${n}"] [data-mf-title]`)?.textContent ?? '' : labels.sections[n]);

  function show(n: number, focus = true) {
    current = n;
    for (const s of steps) s.hidden = Number(s.dataset.step) !== n;
    progress!.textContent = fill(ui.progress, { n, total: def.steps, title: stepTitle(n) ?? '' });
    el.querySelectorAll<HTMLElement>('[data-seg]').forEach((seg) => {
      const i = Number(seg.dataset.seg);
      seg.classList.toggle('is-done', i < n);
      seg.classList.toggle('is-current', i === n);
    });
    back!.hidden = n === 1;
    next!.hidden = n === summaryStep;
    next!.textContent = n === def.fieldSteps ? ui.review : ui.next;
    if (n === summaryStep) renderSummary();
    if (focus) steps.find((s) => Number(s.dataset.step) === n)?.querySelector<HTMLElement>('[data-mf-title]')?.focus();
  }

  // ---- Resumen, mail y copia ----
  let lastTrimmed = false;
  function renderSummary() {
    const v = values();
    summary!.replaceChildren();
    let any = false;
    for (let step = 1; step <= def.fieldSteps; step++) {
      const rows = def.fields.filter((f) => f.step === step && displayValue(f, v[f.id] ?? '', labels));
      if (!rows.length) continue;
      any = true;
      const head = document.createElement('div');
      head.className = 'mf__sec';
      const h = document.createElement('dt');
      h.className = 'label';
      h.textContent = labels.sections[step];
      head.append(h);
      summary!.append(head);
      for (const f of rows) {
        const row = document.createElement('div');
        const k = document.createElement('dt');
        k.className = 'label';
        k.textContent = labels.fields[f.id];
        const val = document.createElement('dd');
        val.textContent = displayValue(f, v[f.id] ?? '', labels);
        row.append(k, val);
        summary!.append(row);
      }
    }
    if (!any) {
      const p = document.createElement('p');
      p.textContent = ui.summaryEmpty;
      summary!.append(p);
    }
    const fitted = fitDraft(def, v, labels, to);
    lastTrimmed = fitted.trimmed;
    open!.href = buildMailto(fitted.draft);
    raw!.value = copyText(def, v, labels, to);
    if (trim) trim.hidden = !fitted.trimmed;
    if (status) status.textContent = '';
  }

  function flash(text: string) {
    if (status) status.textContent = text;
  }

  copy.addEventListener('click', async () => {
    const ok = await copyToClipboard(raw.value, raw);
    flash(ok ? ui.copied : ui.copyFailed);
    if (ok && copyLabel) {
      const original = copyLabel.textContent;
      copyLabel.textContent = ui.copied;
      setTimeout(() => (copyLabel.textContent = original), 2200);
    }
  });

  // Con el mail compacto, el texto completo ya queda en el portapapeles para pegarlo en el mensaje.
  open.addEventListener('click', () => {
    if (!lastTrimmed) return;
    void copyToClipboard(raw.value, null).then((ok) => flash(ok ? ui.openedAfterCopy : ui.copyFailed));
  });

  next.addEventListener('click', () => {
    if (!checkStep(current)) return;
    show(current + 1);
  });
  back.addEventListener('click', () => {
    clearAll();
    show(current - 1);
  });
  // Enter dentro de un campo: avanza (no abre un mail a medio completar)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (current < summaryStep && checkStep(current)) show(current + 1);
  });
  // Corrección en vivo: al escribir se limpia el error de ese campo; al salir se revisa si ya tiene valor
  form.addEventListener('input', (e) => {
    const id = (e.target as HTMLElement | null)?.getAttribute('name');
    if (id) clearError(id);
  });
  form.addEventListener('focusout', (e) => {
    const t = e.target as HTMLInputElement | null;
    const id = t?.getAttribute?.('name');
    const f = def.fields.find((x) => x.id === id);
    if (!id || !f || !(t?.value ?? '').trim()) return;
    const err = validate(def, values(), today, f.step)[id];
    if (err) showError(id, err);
  });

  show(1, false);
}
