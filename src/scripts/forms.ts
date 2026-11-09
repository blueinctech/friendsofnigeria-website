/**
 * Progressive form handling for every <form data-form>.
 *
 * - Validates with the browser's constraint API and shows friendly inline errors.
 * - Submits with fetch as URL-encoded data to the form's action. On Netlify, forms
 *   marked `data-netlify="true"` are captured automatically (see README).
 * - Without JavaScript the form still posts normally and lands on /thank-you/.
 */

const messages: Record<string, (el: HTMLInputElement) => string> = {
  valueMissing: (el) =>
    el.type === 'checkbox' ? 'Please tick this box to continue.' : el.type === 'radio' ? 'Please choose an option.' : 'This field is required.',
  typeMismatch: (el) => (el.type === 'email' ? 'Please enter a valid email address, e.g. name@company.com.' : el.type === 'url' ? 'Please enter a full web address, e.g. https://example.com.' : 'Please check this value.'),
  patternMismatch: (el) => el.dataset.patternMessage || 'Please check the format of this value.',
  tooShort: (el) => `Please enter at least ${el.minLength} characters.`,
  tooLong: (el) => `Please keep this under ${el.maxLength} characters.`,
};

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function errorFor(field: Field): string {
  const v = field.validity;
  for (const key of Object.keys(messages) as (keyof ValidityState)[]) {
    if (v[key]) return messages[key](field as HTMLInputElement);
  }
  return v.valid ? '' : 'Please check this field.';
}

function errorEl(form: HTMLFormElement, field: Field): HTMLElement | null {
  const id = field.getAttribute('aria-describedby')?.split(' ').find((x) => x.endsWith('-error'));
  return id ? form.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
}

function showError(form: HTMLFormElement, field: Field) {
  const msg = errorFor(field);
  // Radio groups share one error element.
  const group = field.type === 'radio' ? Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${field.name}"]`)) : [field];
  group.forEach((f) => f.setAttribute('aria-invalid', msg ? 'true' : 'false'));
  const el = errorEl(form, field);
  if (el) el.textContent = msg;
  return !msg;
}

function setStatus(form: HTMLFormElement, state: 'success' | 'error' | null, html = '') {
  const status = form.querySelector<HTMLElement>('[data-form-status]');
  if (!status) return;
  if (!state) {
    status.removeAttribute('data-state');
    status.innerHTML = '';
    return;
  }
  const icon =
    state === 'success'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>';
  status.setAttribute('data-state', state);
  status.innerHTML = `${icon}<div>${html}</div>`;
}

function init(form: HTMLFormElement) {
  form.noValidate = true;
  const fields = () => Array.from(form.querySelectorAll<Field>('input:not([type=hidden]):not(.honeypot input), select, textarea')).filter((f) => !f.closest('.honeypot'));

  fields().forEach((field) => {
    const evt = field.type === 'checkbox' || field.type === 'radio' || field.tagName === 'SELECT' ? 'change' : 'blur';
    field.addEventListener(evt, () => showError(form, field));
    field.addEventListener('input', () => {
      if (field.getAttribute('aria-invalid') === 'true') showError(form, field);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(form, null);
    let firstInvalid: Field | null = null;
    for (const f of fields()) {
      if (!showError(form, f) && !firstInvalid) firstInvalid = f;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      setStatus(form, 'error', 'Please correct the highlighted fields and try again.');
      return;
    }

    const button = form.querySelector<HTMLButtonElement>('button[type=submit]');
    const original = button?.innerHTML;
    if (button) {
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Sending…';
    }

    try {
      const body = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      const res = await fetch(form.getAttribute('action') || '/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
        body,
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      fields().forEach((f) => f.removeAttribute('aria-invalid'));
      setStatus(form, 'success', form.dataset.success || 'Thank you. Your message has been sent.');
      form.querySelector<HTMLElement>('[data-form-status]')?.focus();
    } catch {
      const email = form.dataset.fallbackEmail || 'contact@friendsofnigeria.net';
      setStatus(
        form,
        'error',
        `Sorry, we couldn't send this right now. Please try again in a moment, or email us at <a href="mailto:${email}">${email}</a>.`,
      );
    } finally {
      if (button) {
        button.removeAttribute('aria-busy');
        if (original) button.innerHTML = original;
      }
    }
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(init);
