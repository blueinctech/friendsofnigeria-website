import { useEffect, useRef, useState } from 'preact/hooks';
import Icon from './Icon';
import { api, ApiError, formatBytes, formatDate, prepareUpload, thumbUrl, toast } from './lib';
import { confirmAction, Empty, Modal, Spinner } from './ui';

export interface MediaItem {
  id: string;
  kind: 'image' | 'document';
  url: string;
  mime: string;
  width: number | null;
  height: number | null;
  alt: string;
  filename: string;
  size: number;
  variants: { w: number; h: number; url: string }[];
  og_url?: string | null;
  created_at?: string;
}

interface Props {
  mode: 'pick' | 'manage';
  multiple?: boolean;
  accept?: 'image' | 'any';
  onPick?: (items: MediaItem[]) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const ACCEPT_IMAGES = '.jpg,.jpeg,.png,.webp,.gif,.svg';
const ACCEPT_ALL = `${ACCEPT_IMAGES},.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv`;

export function MediaTile({ m, selected, onClick }: { m: MediaItem; selected?: boolean; onClick: () => void }) {
  const isSvgOrLogo = m.mime === 'image/svg+xml' || m.mime === 'image/png';
  return (
    <button type="button" class={`media-tile ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected} title={m.filename}>
      <span class="pic">
        {m.kind === 'image' ? (
          <img src={thumbUrl(m, 300)} alt="" loading="lazy" class={isSvgOrLogo ? 'contain' : ''} />
        ) : (
          <span class="doc">
            <Icon name="file" size={32} />
            {m.filename.split('.').pop()}
          </span>
        )}
      </span>
      <span class="cap">
        {m.filename}
        <small>
          {m.kind === 'image' && m.width ? `${m.width} × ${m.height} · ` : ''}
          {formatBytes(m.size)}
          {m.kind === 'image' && !m.alt ? ' · no alt text' : ''}
        </small>
      </span>
      {selected && (
        <span class="check-mark">
          <Icon name="check" size={14} />
        </span>
      )}
    </button>
  );
}

export function MediaBrowser({ mode, multiple, accept = 'image', onPick, canEdit = true, canDelete = false }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(accept === 'image' ? 'image' : '');
  const [missingAlt, setMissingAlt] = useState(() => (typeof location !== 'undefined' ? new URLSearchParams(location.search).has('missingAlt') : false));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [active, setActive] = useState<MediaItem | null>(null);
  const [uploads, setUploads] = useState<{ name: string; state: 'uploading' | 'done' | 'error'; message?: string }[]>([]);
  const [over, setOver] = useState(false);
  const [maxBytes, setMaxBytes] = useState(4 * 1024 * 1024);
  const fileRef = useRef<HTMLInputElement>(null);
  const perPage = 48;

  async function load(p = page) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), perPage: String(perPage) });
      if (q) params.set('q', q);
      if (kind) params.set('kind', kind);
      if (missingAlt) params.set('missingAlt', '1');
      const data = await api(`/api/admin/media/?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setMaxBytes(data.maxBytes);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind, missingAlt]);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    setUploads(list.map((f) => ({ name: f.name, state: 'uploading' })));
    const added: MediaItem[] = [];
    for (let i = 0; i < list.length; i++) {
      try {
        const file = await prepareUpload(list[i], maxBytes);
        if (file.size > maxBytes) throw new Error(`Larger than ${formatBytes(maxBytes)}.`);
        const form = new FormData();
        form.append('file', file, file.name);
        const res = await api('/api/admin/media/', { method: 'POST', form });
        added.push(res.item);
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, state: 'done' } : x)));
      } catch (err) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, state: 'error', message: (err as Error).message } : x)));
      }
    }
    if (added.length) {
      setItems((cur) => [...added.reverse(), ...cur.filter((c) => !added.some((a) => a.id === c.id))]);
      setTotal((t) => t + added.length);
      toast(added.length === 1 ? 'File uploaded.' : `${added.length} files uploaded.`);
      if (mode === 'pick') setSelected((s) => (multiple ? [...s, ...added] : [added[0]]));
      if (mode === 'manage' && added.length === 1) setActive(added[0]);
    }
    setTimeout(() => setUploads((u) => u.filter((x) => x.state === 'error')), 2500);
  }

  function click(m: MediaItem) {
    if (mode === 'manage') return setActive(m);
    if (multiple) setSelected((s) => (s.some((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
    else setSelected((s) => (s[0]?.id === m.id ? [] : [m]));
  }

  const pages = Math.max(1, Math.ceil(total / perPage));

  const grid = (
    <div>
      <div
        class={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer?.files) upload(e.dataTransfer.files);
        }}
      >
        <Icon name="upload" size={22} />
        <p style="margin-top:6px">
          <strong>Drag files here</strong> or{' '}
          <button type="button" class="btn--link btn" onClick={() => fileRef.current?.click()}>
            choose files
          </button>
        </p>
        <p class="muted" style="font-size:12px;margin-top:4px">
          {accept === 'image' ? 'JPG, PNG, WebP, GIF or SVG.' : 'Images (JPG, PNG, WebP, GIF, SVG) or documents (PDF, Word, Excel, PowerPoint, TXT, CSV).'} Up to {formatBytes(maxBytes)}; larger photos
          are reduced automatically.
        </p>
        <input ref={fileRef} type="file" hidden multiple accept={accept === 'image' ? ACCEPT_IMAGES : ACCEPT_ALL} onChange={(e) => upload((e.target as HTMLInputElement).files!)} />
        {uploads.length > 0 && (
          <ul class="upload-list">
            {uploads.map((u) => (
              <li>
                {u.state === 'uploading' ? <Spinner /> : u.state === 'done' ? <Icon name="check-circle" size={16} /> : <Icon name="alert" size={16} />}
                <span>
                  {u.name}
                  {u.message && <span style="color:var(--a-red)"> — {u.message}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="toolbar" style="padding:14px 0;border:0">
        <input type="search" class="grow" placeholder="Search by name or description" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search media" />
        {accept !== 'image' && (
          <select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value)} aria-label="File type">
            <option value="">All files</option>
            <option value="image">Images</option>
            <option value="document">Documents</option>
          </select>
        )}
        <label class="check" style="font-size:13px">
          <input type="checkbox" checked={missingAlt} onChange={(e) => setMissingAlt((e.target as HTMLInputElement).checked)} /> Missing alt text
        </label>
        <span class="muted" style="font-size:13px">{total} files</span>
      </div>

      {error && (
        <div class="form-error">
          <Icon name="alert" /> {error}
        </div>
      )}
      {loading && !items.length ? (
        <div class="empty">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <Empty icon="media" title="No files found">
          {q || missingAlt ? 'Try another search.' : 'Upload your first file above.'}
        </Empty>
      ) : (
        <div class="media-grid">
          {items.map((m) => (
            <MediaTile m={m} selected={mode === 'pick' ? selected.some((s) => s.id === m.id) : active?.id === m.id} onClick={() => click(m)} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div class="pager" style="border:0;padding:16px 0 0">
          <span>
            Page {page} of {pages}
          </span>
          <span style="display:flex;gap:6px">
            <button
              class="btn btn--ghost btn--sm"
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
                load(page - 1);
              }}
            >
              Previous
            </button>
            <button
              class="btn btn--ghost btn--sm"
              disabled={page >= pages}
              onClick={() => {
                setPage(page + 1);
                load(page + 1);
              }}
            >
              Next
            </button>
          </span>
        </div>
      )}
    </div>
  );

  if (mode === 'pick') {
    return (
      <>
        {grid}
        <div style="position:sticky;bottom:-20px;background:#fff;padding:14px 0 0;margin-top:14px;border-top:1px solid var(--a-line);display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span class="muted">{selected.length ? `${selected.length} selected` : multiple ? 'Select one or more files' : 'Select a file'}</span>
          <button type="button" class="btn" disabled={!selected.length} onClick={() => onPick?.(selected)}>
            {multiple ? `Add ${selected.length || ''} selected` : 'Use this file'}
          </button>
        </div>
      </>
    );
  }

  return (
    <div class="media-layout">
      <div class="card">
        <div class="card-body">{grid}</div>
      </div>
      <MediaDetail
        key={active?.id}
        item={active}
        canEdit={canEdit}
        canDelete={canDelete}
        onChange={(m) => {
          setItems((cur) => cur.map((x) => (x.id === m.id ? m : x)));
          setActive(m);
        }}
        onDelete={(id) => {
          setItems((cur) => cur.filter((x) => x.id !== id));
          setTotal((t) => t - 1);
          setActive(null);
        }}
      />
    </div>
  );
}

function MediaDetail({
  item,
  canEdit,
  canDelete,
  onChange,
  onDelete,
}: {
  item: MediaItem | null;
  canEdit: boolean;
  canDelete: boolean;
  onChange: (m: MediaItem) => void;
  onDelete: (id: string) => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [usage, setUsage] = useState<{ type: string; label: string; href: string }[] | null>(null);
  const [filename, setFilename] = useState(item?.filename ?? '');
  const [alt, setAlt] = useState(item?.alt ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    api(`/api/admin/media/${item.id}/`)
      .then((d) => {
        setDetail(d.item);
        setUsage(d.usage);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [item?.id]);

  if (!item) {
    return (
      <div class="card media-detail">
        <Empty icon="media" title="Select a file">
          See its details, edit its name and alt text, copy its address or delete it.
        </Empty>
      </div>
    );
  }
  const absolute = new URL(item.url, location.origin).toString();

  async function save() {
    setSaving(true);
    try {
      const res = await api(`/api/admin/media/${item!.id}/`, { method: 'PATCH', body: { filename, alt } });
      onChange(res.item);
      toast('File details saved.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (usage?.length) return;
    const ok = await confirmAction({ title: 'Delete this file?', message: `“${item!.filename}” will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete file', danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/media/${item!.id}/`, { method: 'DELETE' });
      toast('File deleted.');
      onDelete(item!.id);
    } catch (err) {
      const e = err as ApiError;
      if (e.data?.usage) setUsage(e.data.usage);
      toast(e.message, 'error');
    }
  }

  return (
    <div class="card media-detail">
      <div class="card-head">
        <h2>File details</h2>
        <a class="mini-btn" href={item.url} target="_blank" rel="noopener" title="Open the file">
          <Icon name="external" />
        </a>
      </div>
      <div class="card-body">
        {item.kind === 'image' ? (
          <img class="preview" src={thumbUrl(item, 600)} alt={item.alt} />
        ) : (
          <div class="empty" style="padding:24px">
            <Icon name="file" size={40} />
          </div>
        )}
        <dl class="kv">
          <dt>Type</dt>
          <dd>{item.mime}</dd>
          {item.width && (
            <>
              <dt>Size</dt>
              <dd>
                {item.width} × {item.height} px · {formatBytes(item.size)}
              </dd>
            </>
          )}
          {!item.width && (
            <>
              <dt>Size</dt>
              <dd>{formatBytes(item.size)}</dd>
            </>
          )}
          <dt>Uploaded</dt>
          <dd>
            {formatDate(item.created_at ?? detail?.created_at, true)}
            {detail?.uploaded_by ? ` by ${detail.uploaded_by}` : ''}
          </dd>
          {item.variants?.length > 1 && (
            <>
              <dt>Optimised</dt>
              <dd>WebP in {item.variants.map((v) => v.w).join(', ')} px widths</dd>
            </>
          )}
        </dl>
        <div class="field">
          <label for="m-name">File name</label>
          <input id="m-name" type="text" value={filename} maxLength={200} disabled={!canEdit} onInput={(e) => setFilename((e.target as HTMLInputElement).value)} />
        </div>
        {item.kind === 'image' && (
          <div class="field">
            <label for="m-alt">Alt text</label>
            <textarea id="m-alt" rows={3} maxLength={500} value={alt} disabled={!canEdit} onInput={(e) => setAlt((e.target as HTMLTextAreaElement).value)} />
            <span class="help">Describe the image for people using screen readers. Used where a section has no alt text of its own.</span>
          </div>
        )}
        {canEdit && (
          <button class="btn btn--block" type="button" onClick={save} disabled={saving || (filename === item.filename && alt === item.alt)}>
            {saving && <Spinner />} Save details
          </button>
        )}
        <div class="field" style="margin-top:16px">
          <span class="field-label">File address</span>
          <div style="display:flex;gap:6px">
            <input type="text" readOnly value={absolute} aria-label="File address" onFocus={(e) => (e.target as HTMLInputElement).select()} />
            <button
              type="button"
              class="btn btn--ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(absolute);
                  toast('Address copied.');
                } catch {
                  toast('Copy failed. Select the address and copy it manually.', 'error');
                }
              }}
            >
              <Icon name="copy" size={16} />
              Copy
            </button>
          </div>
        </div>
        <div class="field">
          <span class="field-label">Used in</span>
          {usage === null ? (
            <Spinner />
          ) : usage.length ? (
            <ul class="list-plain">
              {usage.map((u) => (
                <li>
                  <a href={u.href}>{u.label}</a>
                  <span class="badge badge--plain">{u.type}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span class="muted">Not used anywhere on the website.</span>
          )}
        </div>
        {canDelete && (
          <button type="button" class="btn btn--danger btn--block" onClick={remove} disabled={!usage || usage.length > 0} title={usage?.length ? 'Remove it from the pages listed above first' : undefined}>
            <Icon name="trash" size={16} /> Delete file
          </button>
        )}
      </div>
    </div>
  );
}

/** Opens the media library in a dialog to choose one or more files. */
export function MediaPicker({ multiple, accept = 'image', onPick, onClose }: { multiple?: boolean; accept?: 'image' | 'any'; onPick: (m: MediaItem[]) => void; onClose: () => void }) {
  return (
    <Modal title={multiple ? 'Choose images' : accept === 'image' ? 'Choose an image' : 'Choose a file'} onClose={onClose} wide>
      <MediaBrowser
        mode="pick"
        multiple={multiple}
        accept={accept}
        onPick={(m) => {
          onPick(m);
          onClose();
        }}
      />
    </Modal>
  );
}

export default function MediaLibraryPage(props: { canDelete: boolean; canEdit: boolean }) {
  return <MediaBrowser mode="manage" accept="any" canDelete={props.canDelete} canEdit={props.canEdit} />;
}
