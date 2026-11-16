import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { BlockSchema, Field, Option } from '../../lib/cms/fields';
import { ICONS, isVisible } from '../../lib/cms/fields';
import Icon from './Icon';
import RichText from './RichText';
import { MediaPicker, type MediaItem } from './MediaBrowser';
import { api, thumbUrl } from './lib';
import { FieldShell } from './ui';

// ------------------------------------------------------------------ Media context

export interface MediaCtxValue {
  media: Record<string, MediaItem>;
  remember: (items: MediaItem[]) => void;
}
export const MediaCtx = createContext<MediaCtxValue>({ media: {}, remember: () => {} });

export function useMediaMap(initial: Record<string, MediaItem> = {}): MediaCtxValue {
  const [media, setMedia] = useState<Record<string, MediaItem>>(initial);
  return { media, remember: (items) => setMedia((m) => ({ ...m, ...Object.fromEntries(items.map((i) => [i.id, i])) })) };
}

// ------------------------------------------------------------------ Reference options

const refCache = new Map<string, Promise<Option[]>>();
export function useRefOptions(resource?: string) {
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    if (!resource) return;
    if (!refCache.has(resource)) refCache.set(resource, api(`/api/admin/refs/${resource}/`).then((d) => d.options));
    refCache.get(resource)!.then(setOptions).catch(() => setOptions([]));
  }, [resource]);
  return options;
}

// ------------------------------------------------------------------ Helpers

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function ImageField({ id, value, onChange, invalid }: { id: string; value: string | null; onChange: (v: string | null) => void; invalid?: boolean }) {
  const { media, remember } = useContext(MediaCtx);
  const [open, setOpen] = useState(false);
  const m = value ? media[value] : null;
  return (
    <div class="image-field" id={id} style={invalid ? 'border-color:var(--a-red)' : ''}>
      {m ? (
        <img src={thumbUrl(m, 300)} alt="" class={m.mime === 'image/svg+xml' || m.mime === 'image/png' ? 'contain' : ''} />
      ) : (
        <span style="width:96px;height:72px;display:grid;place-items:center;border-radius:8px;background:#fff;border:1px solid var(--a-line);color:var(--a-ink-3)">
          <Icon name="media" size={24} />
        </span>
      )}
      <div class="meta">
        {value && !m ? (
          <strong>Image selected</strong>
        ) : m ? (
          <>
            <strong>{m.filename}</strong>
            {m.width ? `${m.width} × ${m.height} px` : ''}
            {!m.alt && ' · no alt text in library'}
          </>
        ) : (
          <>
            <strong>No image</strong>Choose from the media library or upload a new one.
          </>
        )}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
          {value ? 'Replace' : 'Choose image'}
        </button>
        {value && (
          <button type="button" class="btn btn--danger btn--sm" onClick={() => onChange(null)} aria-label="Remove image">
            Remove
          </button>
        )}
      </div>
      {open && (
        <MediaPicker
          onClose={() => setOpen(false)}
          onPick={([item]) => {
            if (item) {
              remember([item]);
              onChange(item.id);
            }
          }}
        />
      )}
    </div>
  );
}

function GalleryField({ id, value, onChange }: { id: string; value: string[]; onChange: (v: string[]) => void }) {
  const { media, remember } = useContext(MediaCtx);
  const [open, setOpen] = useState(false);
  const list = value ?? [];
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div id={id}>
      {list.length > 0 && (
        <div class="gallery-grid" style="margin-bottom:10px">
          {list.map((mid, i) => (
            <div class="g-item">
              {media[mid] ? <img src={thumbUrl(media[mid], 200)} alt={media[mid].alt} loading="lazy" /> : <span class="muted">…</span>}
              <div class="g-tools">
                <span style="display:flex;gap:2px">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                    <Icon name="chevron-left" size={14} />
                  </button>
                  <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`}>
                    <Icon name="chevron-right" size={14} />
                  </button>
                </span>
                <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" class="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        <Icon name="image-plus" size={16} /> Add photos
      </button>
      <span class="muted" style="margin-left:10px;font-size:12px">
        {list.length} photo{list.length === 1 ? '' : 's'}
      </span>
      {open && (
        <MediaPicker
          multiple
          onClose={() => setOpen(false)}
          onPick={(items) => {
            remember(items);
            onChange([...list, ...items.map((m) => m.id).filter((x) => !list.includes(x))]);
          }}
        />
      )}
    </div>
  );
}

function StringsField({ id, value, onChange, max }: { id: string; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const list = value ?? [];
  const set = (i: number, v: string) => onChange(list.map((x, j) => (j === i ? v : x)));
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div class="repeat" id={id}>
      {list.map((s, i) => (
        <div class="string-row">
          <input type="text" value={s} maxLength={300} onInput={(e) => set(i, (e.target as HTMLInputElement).value)} aria-label={`Item ${i + 1}`} />
          <button type="button" class="mini-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
            <Icon name="chevron-up" size={16} />
          </button>
          <button type="button" class="mini-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
            <Icon name="chevron-down" size={16} />
          </button>
          <button type="button" class="mini-btn danger" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove item">
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      {(!max || list.length < max) && (
        <div>
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => onChange([...list, ''])}>
            <Icon name="plus" size={16} /> Add item
          </button>
        </div>
      )}
    </div>
  );
}

function itemTitle(field: Field, item: Record<string, any>, i: number, media: Record<string, MediaItem>) {
  for (const f of field.fields ?? []) {
    const v = item?.[f.name];
    if ((f.type === 'text' || f.type === 'textarea') && v) return String(v);
  }
  const img = (field.fields ?? []).find((f) => f.type === 'image');
  if (img && item?.[img.name] && media[item[img.name]]) return media[item[img.name]].filename;
  return `${field.itemLabel ?? 'Item'} ${i + 1}`;
}

function ListField({ id, field, value, onChange }: { id: string; field: Field; value: Record<string, any>[]; onChange: (v: Record<string, any>[]) => void }) {
  const { media } = useContext(MediaCtx);
  const list = Array.isArray(value) ? value : [];
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(list.length > 3 ? list.map((_, i) => i) : []));
  const blank = () => Object.fromEntries((field.fields ?? []).map((f) => [f.name, f.default ?? (f.type === 'list' || f.type === 'strings' ? [] : f.type === 'toggle' ? false : '')]));
  const move = (i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  const toggle = (i: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  return (
    <div class="repeat" id={id}>
      {list.map((item, i) => (
        <div class={`repeat-item ${collapsed.has(i) ? 'collapsed' : ''}`}>
          <div class="repeat-head">
            <button type="button" class="mini-btn" onClick={() => toggle(i)} aria-expanded={!collapsed.has(i)} aria-label={collapsed.has(i) ? 'Expand' : 'Collapse'}>
              <Icon name={collapsed.has(i) ? 'chevron-right' : 'chevron-down'} size={16} />
            </button>
            <span class="grow">{itemTitle(field, item, i, media)}</span>
            <button type="button" class="mini-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              <Icon name="chevron-up" size={16} />
            </button>
            <button type="button" class="mini-btn" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              <Icon name="chevron-down" size={16} />
            </button>
            <button type="button" class="mini-btn danger" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${field.itemLabel ?? 'item'}`}>
              <Icon name="trash" size={16} />
            </button>
          </div>
          <div class="repeat-body field-grid">
            {(field.fields ?? []).map((sub) =>
              isVisible(sub, item ?? {}) ? (
                <FieldInput
                  field={sub}
                  idPrefix={`${id}-${i}`}
                  value={item?.[sub.name]}
                  values={item ?? {}}
                  onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, [sub.name]: v } : x)))}
                />
              ) : null,
            )}
          </div>
        </div>
      ))}
      {(!field.max || list.length < field.max) && (
        <div>
          <button type="button" class="btn btn--ghost btn--sm" onClick={() => onChange([...list, blank()])}>
            <Icon name="plus" size={16} /> Add {(field.itemLabel ?? 'item').toLowerCase()}
          </button>
        </div>
      )}
    </div>
  );
}

function ReferenceSelect({ id, field, value, onChange, invalid }: { id: string; field: Field; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const options = useRefOptions(field.ref);
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange((e.target as HTMLSelectElement).value)} aria-invalid={invalid}>
      <option value="">{options ? (field.required ? 'Choose…' : 'None') : 'Loading…'}</option>
      {(options ?? []).map((o) => (
        <option value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ------------------------------------------------------------------ Generic input

export function FieldInput({
  field,
  value,
  onChange,
  values,
  error,
  idPrefix = 'f',
  blocks,
  blockErrors,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  values: Record<string, any>;
  error?: string;
  idPrefix?: string;
  blocks?: BlockSchema;
  blockErrors?: Record<string, string>;
}) {
  const id = `${idPrefix}-${field.name}`;
  const invalid = Boolean(error);
  const describedBy = error ? `${id}-err` : field.help ? `${id}-help` : undefined;
  const common = { id, 'aria-invalid': invalid ? 'true' : undefined, 'aria-describedby': describedBy } as const;
  const full = field.width !== 'half';
  const str = value == null ? '' : String(value);
  let input;

  switch (field.type) {
    case 'text':
    case 'email':
    case 'url':
    case 'slug':
      input = (
        <input
          {...common}
          type={(field.type === 'email' ? 'email' : 'text') as 'text'}
          inputMode={field.type === 'url' ? ('url' as const) : undefined}
          value={str}
          placeholder={field.placeholder ?? (field.type === 'url' ? 'https://… or /page/' : undefined)}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          readOnly={field.readOnly}
        />
      );
      break;
    case 'textarea':
      input = <textarea {...common} rows={field.rows ?? 3} value={str} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />;
      break;
    case 'richtext':
      input = <RichText id={id} value={str} onChange={onChange} invalid={invalid} />;
      break;
    case 'number':
      input = (
        <input
          {...common}
          type="number"
          value={str}
          min={field.min}
          max={field.max}
          step={1}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            onChange(v === '' ? null : Number(v));
          }}
        />
      );
      break;
    case 'date':
      input = <input {...common} type="date" value={str.slice(0, 10)} onInput={(e) => onChange((e.target as HTMLInputElement).value || null)} />;
      break;
    case 'datetime':
      input = <input {...common} type="datetime-local" value={toLocalInput(value)} onInput={(e) => onChange(fromLocalInput((e.target as HTMLInputElement).value))} />;
      break;
    case 'toggle':
      return (
        <div class={`field ${full ? 'full' : ''}`}>
          <label class="switch">
            <input type="checkbox" id={id} checked={Boolean(value)} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
            {field.label}
          </label>
          {field.help && <span class="help">{field.help}</span>}
        </div>
      );
    case 'select':
    case 'status':
      input = (
        <select {...common} value={str || String(field.default ?? '')} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
          {!field.required && field.default === undefined && <option value="">None</option>}
          {(field.options ?? []).map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'icon':
      input = (
        <div style="display:flex;gap:8px;align-items:center">
          <select {...common} value={str} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
            {ICONS.map((o) => (
              <option value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      );
      break;
    case 'image':
      input = <ImageField id={id} value={value || null} onChange={onChange} invalid={invalid} />;
      break;
    case 'gallery':
      input = <GalleryField id={id} value={value ?? []} onChange={onChange} />;
      break;
    case 'strings':
      input = <StringsField id={id} value={value ?? []} onChange={onChange} max={field.max} />;
      break;
    case 'list':
      input = <ListField id={id} field={field} value={value ?? []} onChange={onChange} />;
      break;
    case 'reference':
      input = <ReferenceSelect id={id} field={field} value={str} onChange={onChange} invalid={invalid} />;
      break;
    case 'blocks':
      return blocks ? <BlocksForm schema={blocks} value={value ?? {}} onChange={onChange} errors={blockErrors ?? {}} idPrefix={id} /> : null;
  }

  const counter = (field.type === 'text' || field.type === 'textarea') && field.max ? { value: str.length, max: field.max } : undefined;
  const labelled = !['image', 'gallery', 'strings', 'list', 'richtext'].includes(field.type);
  return (
    <FieldShell id={labelled ? id : undefined} label={field.label} required={field.required} help={field.help} error={error} counter={counter} full={full}>
      {input}
    </FieldShell>
  );
}

/** Form for a block schema: one card per section. */
export function BlocksForm({
  schema,
  value,
  onChange,
  errors,
  idPrefix = 'b',
}: {
  schema: BlockSchema;
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  errors: Record<string, string>;
  idPrefix?: string;
}) {
  return (
    <>
      {schema.sections.map((section) => (
        <div class="card" style="margin-top:16px">
          <div class="card-head">
            <div>
              <h2>{section.title}</h2>
              {section.description && <p>{section.description}</p>}
            </div>
          </div>
          <div class="card-body field-grid">
            {section.fields.map((f) =>
              isVisible(f, value) ? (
                <FieldInput field={f} idPrefix={idPrefix} value={value[f.name]} values={value} error={errors[f.name]} onChange={(v) => onChange({ ...value, [f.name]: v })} />
              ) : null,
            )}
          </div>
        </div>
      ))}
    </>
  );
}
