import { render, type ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import Icon from './Icon';

export function Spinner() {
  return <span class="spinner" aria-hidden="true" />;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const items = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!items.length) return;
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="mini-btn" onClick={onClose} data-close aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Asks for confirmation. Resolves true when confirmed. */
export function confirmAction(opts: { title: string; message: ComponentChildren; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const done = (v: boolean) => {
      render(null, host);
      host.remove();
      resolve(v);
    };
    render(
      <Modal
        title={opts.title}
        onClose={() => done(false)}
        footer={
          <>
            <button type="button" class="btn btn--ghost" onClick={() => done(false)}>
              Cancel
            </button>
            <button type="button" class={`btn ${opts.danger ? 'btn--danger-solid' : ''}`} onClick={() => done(true)}>
              {opts.confirmLabel ?? 'Confirm'}
            </button>
          </>
        }
      >
        <div style="color:var(--a-ink-2)">{opts.message}</div>
      </Modal>,
      host,
    );
  });
}

export function StatusBadge({ status, publishedAt, labels }: { status: string; publishedAt?: string | null; labels?: Record<string, string> }) {
  if (status === 'published' && publishedAt && new Date(publishedAt).valueOf() > Date.now()) return <span class="badge badge--blue">Scheduled</span>;
  if (status === 'published') return <span class="badge badge--green">{labels?.published ?? 'Published'}</span>;
  if (status === 'draft') return <span class="badge badge--amber">{labels?.draft ?? 'Draft'}</span>;
  if (status === 'pending') return <span class="badge badge--amber">Pending</span>;
  if (status === 'contacted') return <span class="badge badge--blue">Contacted</span>;
  if (status === 'resolved') return <span class="badge badge--green">Resolved</span>;
  return <span class="badge">{status}</span>;
}

export function Empty({ icon = 'inbox', title, children }: { icon?: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={icon} size={36} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function FieldShell({
  id,
  label,
  required,
  help,
  error,
  children,
  counter,
  full,
}: {
  id?: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ComponentChildren;
  counter?: { value: number; max: number };
  full?: boolean;
}) {
  return (
    <div class={`field ${full ? 'full' : ''}`}>
      {id ? (
        <label for={id}>
          {label} {required && <span class="req" aria-hidden="true">*</span>}
        </label>
      ) : (
        <span class="field-label">
          {label} {required && <span class="req" aria-hidden="true">*</span>}
        </span>
      )}
      {children}
      {counter && counter.max && counter.value > counter.max * 0.7 && (
        <span class={`counter ${counter.value > counter.max ? 'over' : ''}`}>
          {counter.value} / {counter.max}
        </span>
      )}
      {help && !error && (
        <span class="help" id={id ? `${id}-help` : undefined}>
          {help}
        </span>
      )}
      {error && (
        <span class="err" id={id ? `${id}-err` : undefined} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
