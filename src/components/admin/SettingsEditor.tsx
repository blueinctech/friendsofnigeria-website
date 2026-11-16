import { useEffect, useMemo, useState } from 'preact/hooks';
import { SETTINGS_SCHEMAS } from '../../lib/cms/blocks';
import { blockDefaults } from '../../lib/cms/fields';
import Icon from './Icon';
import { api, ApiError, toast } from './lib';
import { BlocksForm, MediaCtx, useMediaMap } from './Fields';
import { confirmAction, Spinner } from './ui';

/** Edits a settings group: the homepage, general settings or SEO defaults. */
export default function SettingsEditor({ settingsKey, previewUrl }: { settingsKey: 'home' | 'site' | 'seo'; previewUrl?: string }) {
  const schema = SETTINGS_SCHEMAS[settingsKey];
  const mediaCtx = useMediaMap();
  const [value, setValue] = useState<Record<string, any> | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/api/admin/settings/${settingsKey}/`)
      .then((d) => {
        mediaCtx.remember(Object.values(d.media));
        const v = { ...blockDefaults(schema), ...d.value };
        setValue(v);
        setSaved(JSON.stringify(v));
      })
      .catch((e) => setFormError(e.message));
  }, []);

  const dirty = useMemo(() => value !== null && JSON.stringify(value) !== saved, [value, saved]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(confirmSeo = false) {
    setSaving(true);
    setFormError('');
    try {
      const d = await api(`/api/admin/settings/${settingsKey}/`, { method: 'PUT', body: { value, _confirmSeoClear: confirmSeo } });
      mediaCtx.remember(Object.values(d.media));
      const v = { ...blockDefaults(schema), ...d.value };
      setValue(v);
      setSaved(JSON.stringify(v));
      setErrors({});
      toast('Saved. The website shows the changes within a minute.');
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'seo_clear') {
        setSaving(false);
        const ok = await confirmAction({ title: 'Remove SEO information?', message: e.message + ' Continue?', confirmLabel: 'Save anyway', danger: true });
        if (ok) return save(true);
        return;
      }
      setErrors(e.errors ?? {});
      setFormError(e.message);
      setTimeout(() => document.querySelector('[aria-invalid="true"], .err')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } finally {
      setSaving(false);
    }
  }

  if (!value) {
    return formError ? (
      <div class="form-error">
        <Icon name="alert" /> {formError}
      </div>
    ) : (
      <div class="empty">
        <Spinner />
      </div>
    );
  }

  return (
    <MediaCtx.Provider value={mediaCtx}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div class="card" style="position:sticky;top:70px;z-index:5;margin-bottom:4px">
          <div class="card-body" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 16px">
            <span class="muted">{dirty ? <strong style="color:var(--a-amber)">You have unsaved changes</strong> : 'All changes saved'}</span>
            <span style="display:flex;gap:8px">
              {previewUrl && (
                <a class="btn btn--ghost" href={previewUrl} target="_blank" rel="noopener">
                  <Icon name="external" size={16} /> View on website
                </a>
              )}
              <button class="btn" type="submit" disabled={saving || !dirty}>
                {saving ? <Spinner /> : <Icon name="check" size={16} />} Save changes
              </button>
            </span>
          </div>
        </div>
        {formError && (
          <div class="form-error" role="alert" style="margin-top:12px">
            <Icon name="alert" /> {formError}
          </div>
        )}
        <BlocksForm schema={schema} value={value} onChange={setValue} errors={errors} idPrefix={settingsKey} />
        <div style="margin-top:16px;display:flex;justify-content:flex-end">
          <button class="btn" type="submit" disabled={saving || !dirty}>
            {saving && <Spinner />} Save changes
          </button>
        </div>
      </form>
    </MediaCtx.Provider>
  );
}
