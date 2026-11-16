import { useEffect, useMemo, useState } from 'preact/hooks';
import { RESOURCES } from '../../lib/cms/resources';
import { PAGE_SCHEMAS } from '../../lib/cms/blocks';
import { blockDefaults, isVisible, slugify, type Field } from '../../lib/cms/fields';
import Icon from './Icon';
import { api, ApiError, flash, formatDate, toast } from './lib';
import { FieldInput, MediaCtx, useMediaMap } from './Fields';
import { confirmAction, Spinner, StatusBadge } from './ui';

interface Props {
  resource: string;
  id: string | null;
  canDelete: boolean;
  siteOrigin: string;
}

function newRecord(fields: Field[]) {
  const v: Record<string, any> = {};
  for (const f of fields) {
    if (f.default !== undefined) v[f.name] = f.default;
    else if (f.type === 'list' || f.type === 'strings' || f.type === 'gallery') v[f.name] = [];
    else if (f.type === 'toggle') v[f.name] = false;
  }
  return v;
}

export default function ResourceEditor({ resource, id, canDelete, siteOrigin }: Props) {
  const r = RESOURCES[resource];
  const mediaCtx = useMediaMap();
  const [values, setValues] = useState<Record<string, any> | null>(id ? null : { ...newRecord(r.fields), ...(resource === 'pages' ? { kind: 'custom' } : {}) });
  const [saved, setSaved] = useState<Record<string, any> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [publicPath, setPublicPath] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api(`/api/admin/r/${resource}/${id}/`)
      .then((d) => {
        mediaCtx.remember(Object.values(d.media));
        const item = d.item;
        if (resource === 'pages' && item.kind === 'system') item.content = { ...blockDefaults(PAGE_SCHEMAS[item.key]), ...(item.content ?? {}) };
        setValues(item);
        setSaved(item);
        setPublicPath(d.publicPath);
      })
      .catch((e) => setLoadError(e.message));
  }, [id]);

  const dirty = useMemo(() => (values && saved ? JSON.stringify(values) !== JSON.stringify(saved) : Boolean(values && !id)), [values, saved]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  if (loadError) {
    return (
      <div class="form-error">
        <Icon name="alert" /> {loadError}
      </div>
    );
  }
  if (!values) {
    return (
      <div class="empty">
        <Spinner />
      </div>
    );
  }

  const isSystemPage = resource === 'pages' && values.kind === 'system';
  const set = (name: string, v: any) => {
    setValues((cur) => {
      const next = { ...cur!, [name]: v };
      const slugField = r.fields.find((f) => f.type === 'slug');
      if (slugField && slugField.from === name && !slugTouched) next[slugField.name] = slugify(v ?? '');
      return next;
    });
    if (r.fields.find((f) => f.name === name)?.type === 'slug') setSlugTouched(true);
    if (errors[name]) setErrors(({ [name]: _x, ...rest }) => rest);
  };

  async function save(override: Record<string, any> = {}, confirmSeo = false) {
    setSaving(true);
    setFormError('');
    const body = { ...values, ...override, ...(confirmSeo ? { _confirmSeoClear: true } : {}) };
    try {
      const res = await api(id ? `/api/admin/r/${resource}/${id}/` : `/api/admin/r/${resource}/`, { method: id ? 'PUT' : 'POST', body });
      if (!id) {
        flash(`${cap(r.singular)} created.`);
        location.href = `/admin/${resource}/${res.item.id}/`;
        return;
      }
      mediaCtx.remember(Object.values(res.media ?? {}));
      const item = res.item;
      if (isSystemPage) item.content = { ...blockDefaults(PAGE_SCHEMAS[item.key]), ...(item.content ?? {}) };
      setValues(item);
      setSaved(item);
      setPublicPath(res.publicPath);
      setErrors({});
      const st = item.status;
      toast(
        override.status === 'published'
          ? 'Published. It appears on the website within a minute.'
          : override.status === 'draft'
            ? 'Unpublished. It is now hidden from the website.'
            : st === 'published'
              ? 'Changes saved and live on the website within a minute.'
              : 'Changes saved.',
      );
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'seo_clear') {
        const ok = await confirmAction({ title: 'Remove SEO information?', message: e.message + ' Continue?', confirmLabel: 'Save anyway', danger: true });
        setSaving(false);
        if (ok) return save(override, true);
        return;
      }
      const errs: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.errors ?? {})) errs[k.replace(/^content\./, 'content.')] = v;
      setErrors(errs);
      setFormError(e.message);
      setTimeout(() => document.querySelector('[aria-invalid="true"], .err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirmAction({
      title: `Delete this ${r.singular}?`,
      message: (
        <>
          <strong>{values![r.labelField]}</strong> will be permanently deleted{r.publishable ? ' and removed from the website' : ''}. This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/r/${resource}/${id}/`, { method: 'DELETE' });
      flash(`${cap(r.singular)} deleted.`);
      setSaved(values);
      location.href = `/admin/${resource}/`;
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  const visible = (f: Field) => isVisible(f, values) && !(isSystemPage && f.name === 'slug');
  const main = r.fields.filter((f) => (!f.section || f.section === 'main') && f.type !== 'status' && visible(f));
  const side = r.fields.filter((f) => f.section === 'side' && f.type !== 'status' && visible(f));
  const seo = r.fields.filter((f) => f.section === 'seo' && visible(f));
  const statusField = r.fields.find((f) => f.type === 'status');
  const contentErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith('content.')).map(([k, v]) => [k.slice(8), v]));
  const isPublished = values.status === 'published';
  const scheduled = isPublished && values.published_at && new Date(values.published_at).valueOf() > Date.now();
  const path = publicPath ?? (id ? null : null);

  const renderField = (f: Field) => (
    <FieldInput
      field={f}
      value={values[f.name]}
      values={values}
      error={errors[f.name]}
      onChange={(v) => set(f.name, v)}
      blocks={f.type === 'blocks' && isSystemPage ? PAGE_SCHEMAS[values.key] : undefined}
      blockErrors={contentErrors}
    />
  );

  const titleField = values[r.labelField] || `New ${r.singular}`;
  const seoTitle = values.seo_title || values.title || values.name || '';
  const seoDesc = values.seo_description || values.excerpt || values.summary || values.lead || '';

  return (
    <MediaCtx.Provider value={mediaCtx}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div class="page-head">
          <div>
            <div class="crumbs">
              <a href={`/admin/${resource}/`}>{r.label}</a> / {id ? 'Edit' : 'New'}
            </div>
            <h1>{titleField}</h1>
            {isSystemPage && <p>Built-in page at {values.path}. Its layout is fixed; you can edit its text, images, sections and SEO.</p>}
          </div>
          <div class="head-actions">
            {path && (
              <a class="btn btn--ghost" href={isPublished && !scheduled ? path : `${path}?preview=1`} target="_blank" rel="noopener">
                <Icon name={isPublished && !scheduled ? 'external' : 'eye'} size={16} />
                {isPublished && !scheduled ? 'View on website' : 'Preview'}
              </a>
            )}
            <button class="btn" type="submit" disabled={saving}>
              {saving ? <Spinner /> : <Icon name="check" size={16} />} {id ? 'Save changes' : `Create ${r.singular}`}
            </button>
          </div>
        </div>

        {formError && (
          <div class="form-error" role="alert">
            <Icon name="alert" /> {formError}
          </div>
        )}

        <div class="editor-layout">
          <div>
            <div class="card">
              <div class="card-body field-grid">{main.filter((f) => f.type !== 'blocks').map(renderField)}</div>
            </div>
            {main.filter((f) => f.type === 'blocks').map(renderField)}
            {seo.length > 0 && (
              <div class="card" style="margin-top:16px">
                <div class="card-head">
                  <div>
                    <h2>Search engines and social sharing</h2>
                    <p>How this appears in Google and when the link is shared.</p>
                  </div>
                </div>
                <div class="card-body">
                  <div class="seo-preview" aria-label="Search result preview">
                    <div class="u">
                      {siteOrigin.replace(/^https?:\/\//, '')}
                      {path ?? '/…'}
                    </div>
                    <div class="t">{seoTitle ? (seoTitle.length > 60 ? seoTitle.slice(0, 58) + '…' : seoTitle) : 'Title'}</div>
                    <div class="d">{seoDesc ? (seoDesc.length > 160 ? seoDesc.slice(0, 157) + '…' : seoDesc) : 'Add a meta description to control this text.'}</div>
                  </div>
                  <div class="field-grid">{seo.map(renderField)}</div>
                </div>
              </div>
            )}
          </div>

          <aside class="editor-side">
            <div class="card">
              <div class="card-head">
                <h2>{r.publishable ? 'Publishing' : 'Save'}</h2>
                {statusField && <StatusBadge status={saved?.status ?? values.status} publishedAt={saved?.published_at} />}
              </div>
              <div class="card-body">
                {statusField && renderField(statusField)}
                {side.map(renderField)}
                {id && saved && (
                  <p class="muted" style="font-size:12px;margin:4px 0 14px">
                    Last saved {formatDate(saved.updated_at, true)}
                    {dirty && <strong style="color:var(--a-amber)"> · unsaved changes</strong>}
                  </p>
                )}
                <div class="save-bar">
                  <button class="btn" type="submit" disabled={saving}>
                    {saving && <Spinner />} {id ? 'Save' : 'Create'}
                  </button>
                  {r.publishable && id && !isPublished && (
                    <button type="button" class="btn btn--ghost" disabled={saving} onClick={() => save({ status: 'published' })}>
                      Publish now
                    </button>
                  )}
                  {r.publishable && id && isPublished && !(isSystemPage && values.key === 'home') && (
                    <button type="button" class="btn btn--ghost" disabled={saving} onClick={() => save({ status: 'draft' })}>
                      Unpublish
                    </button>
                  )}
                </div>
                {canDelete && id && !isSystemPage && (
                  <button type="button" class="btn btn--danger btn--sm" style="margin-top:14px" onClick={remove}>
                    <Icon name="trash" size={14} /> Delete {r.singular}
                  </button>
                )}
              </div>
            </div>
          </aside>
        </div>
      </form>
    </MediaCtx.Provider>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
