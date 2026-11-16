import { useEffect, useState } from 'preact/hooks';
import { ICONS } from '../../lib/cms/fields';
import Icon from './Icon';
import { api, toast } from './lib';
import { confirmAction, Modal, Spinner } from './ui';

interface NavItem {
  label: string;
  url: string;
  description?: string | null;
  icon?: string | null;
  new_tab?: boolean;
  visible?: boolean;
  children?: NavItem[];
}

const MENUS = [
  { key: 'header', label: 'Main menu', help: 'The menu at the top of every page. Items with sub-items open as dropdowns.' },
  { key: 'membership', label: 'Membership links', help: 'Shown under "Membership" in the mobile menu.' },
  { key: 'footer', label: 'Footer', help: 'Each top-level item is a column heading in the footer; its sub-items are the links.' },
] as const;

export default function NavigationEditor() {
  const [menus, setMenus] = useState<Record<string, NavItem[]> | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<string>('header');
  const [editing, setEditing] = useState<{ path: [number, number?]; item: NavItem; isNew: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pages, setPages] = useState<{ path: string; title: string }[]>([]);

  useEffect(() => {
    api('/api/admin/navigation/')
      .then((d) => {
        setMenus(d.menus);
        setSaved(Object.fromEntries(Object.entries(d.menus).map(([k, v]) => [k, JSON.stringify(v)])));
      })
      .catch((e) => setError(e.message));
    api('/api/admin/r/pages/?perPage=200')
      .then((d) => setPages(d.items.map((p: any) => ({ path: p.path, title: p.title }))))
      .catch(() => {});
  }, []);

  if (!menus) return error ? <div class="form-error">{error}</div> : <div class="empty"><Spinner /></div>;
  const items = menus[tab] ?? [];
  const dirty = JSON.stringify(items) !== saved[tab];
  const def = MENUS.find((m) => m.key === tab)!;
  const allowChildren = tab !== 'membership';

  const update = (next: NavItem[]) => setMenus({ ...menus, [tab]: next });
  const moveIn = (list: NavItem[], i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    return next;
  };

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api('/api/admin/navigation/', { method: 'PUT', body: { menu: tab, items } });
      setSaved({ ...saved, [tab]: JSON.stringify(items) });
      toast('Menu saved. The website shows it within a minute.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: number, j?: number) {
    const target = j === undefined ? items[i] : items[i].children![j];
    const ok = await confirmAction({
      title: 'Remove this menu item?',
      message: `“${target.label}”${j === undefined && items[i].children?.length ? ` and its ${items[i].children!.length} sub-items` : ''} will be removed when you save the menu.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    if (j === undefined) update(items.filter((_, k) => k !== i));
    else update(items.map((it, k) => (k === i ? { ...it, children: it.children!.filter((_, l) => l !== j) } : it)));
  }

  function applyEdit(item: NavItem) {
    const { path, isNew } = editing!;
    const [i, j] = path;
    if (j === undefined) {
      if (isNew) update([...items, { ...item, children: [] }]);
      else update(items.map((it, k) => (k === i ? { ...it, ...item, children: it.children } : it)));
    } else {
      update(
        items.map((it, k) => {
          if (k !== i) return it;
          const children = [...(it.children ?? [])];
          if (isNew) children.push(item);
          else children[j] = item;
          return { ...it, children };
        }),
      );
    }
    setEditing(null);
  }

  const row = (it: NavItem, i: number, j?: number, siblings = items.length) => {
    const idx = j ?? i;
    return (
      <div class={`nav-row ${it.visible === false ? 'hidden-item' : ''}`}>
        <span class="grow">
          <strong>
            {it.label}
            {it.visible === false && <span class="badge badge--plain" style="margin-left:8px">Hidden</span>}
            {it.new_tab && <span class="badge badge--plain" style="margin-left:8px">New tab</span>}
          </strong>
          <small>{it.url || (tab === 'footer' && j === undefined ? 'Column heading' : 'No link')}</small>
        </span>
        <button
          type="button"
          class="mini-btn"
          disabled={idx === 0}
          aria-label="Move up"
          onClick={() => (j === undefined ? update(moveIn(items, i, -1)) : update(items.map((x, k) => (k === i ? { ...x, children: moveIn(x.children!, j, -1) } : x))))}
        >
          <Icon name="chevron-up" size={16} />
        </button>
        <button
          type="button"
          class="mini-btn"
          disabled={idx === siblings - 1}
          aria-label="Move down"
          onClick={() => (j === undefined ? update(moveIn(items, i, 1)) : update(items.map((x, k) => (k === i ? { ...x, children: moveIn(x.children!, j, 1) } : x))))}
        >
          <Icon name="chevron-down" size={16} />
        </button>
        <button
          type="button"
          class="mini-btn"
          aria-label={it.visible === false ? 'Show' : 'Hide'}
          title={it.visible === false ? 'Show on website' : 'Hide from website'}
          onClick={() => {
            const toggled = { ...it, visible: it.visible === false };
            if (j === undefined) update(items.map((x, k) => (k === i ? toggled : x)));
            else update(items.map((x, k) => (k === i ? { ...x, children: x.children!.map((c, l) => (l === j ? toggled : c)) } : x)));
          }}
        >
          <Icon name={it.visible === false ? 'eye-off' : 'eye'} size={16} />
        </button>
        <button type="button" class="mini-btn" aria-label={`Edit ${it.label}`} onClick={() => setEditing({ path: [i, j], item: it, isNew: false })}>
          <Icon name="edit" size={16} />
        </button>
        <button type="button" class="mini-btn danger" aria-label={`Remove ${it.label}`} onClick={() => remove(i, j)}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    );
  };

  return (
    <>
      <div class="tabs" role="tablist">
        {MENUS.map((m) => (
          <button
            role="tab"
            aria-selected={tab === m.key}
            onClick={async () => {
              if (dirty && !(await confirmAction({ title: 'Discard changes?', message: 'This menu has unsaved changes.', confirmLabel: 'Discard' }))) return;
              if (dirty) setMenus({ ...menus, [tab]: JSON.parse(saved[tab]) });
              setTab(m.key);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div class="card">
        <div class="card-head">
          <div>
            <h2>{def.label}</h2>
            <p>{def.help}</p>
          </div>
          <span style="display:flex;gap:8px">
            <button type="button" class="btn btn--ghost" onClick={() => setEditing({ path: [items.length], item: { label: '', url: '', visible: true }, isNew: true })}>
              <Icon name="plus" size={16} /> Add item
            </button>
            <button type="button" class="btn" onClick={save} disabled={!dirty || saving}>
              {saving && <Spinner />} Save menu
            </button>
          </span>
        </div>
        <div class="card-body">
          {error && (
            <div class="form-error">
              <Icon name="alert" /> {error}
            </div>
          )}
          {items.length === 0 ? (
            <p class="muted">This menu is empty.</p>
          ) : (
            <ul class="nav-tree">
              {items.map((it, i) => (
                <li>
                  {row(it, i)}
                  {allowChildren && (
                    <ul class="nav-children">
                      {(it.children ?? []).map((c, j) => (
                        <li>{row(c, i, j, it.children!.length)}</li>
                      ))}
                      <li>
                        <button type="button" class="btn btn--link btn--sm" onClick={() => setEditing({ path: [i, (it.children ?? []).length], item: { label: '', url: '', visible: true }, isNew: true })}>
                          + Add {tab === 'footer' ? 'link' : 'dropdown item'} under “{it.label}”
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {dirty && (
            <p class="notice notice--amber" style="margin:16px 0 0">
              <Icon name="alert" /> Unsaved changes. Click “Save menu” to update the website.
            </p>
          )}
        </div>
      </div>
      {editing && <ItemDialog editing={editing} pages={pages} isChild={editing.path[1] !== undefined} menu={tab} onSave={applyEdit} onClose={() => setEditing(null)} />}
    </>
  );
}

function ItemDialog({
  editing,
  pages,
  isChild,
  menu,
  onSave,
  onClose,
}: {
  editing: { item: NavItem; isNew: boolean };
  pages: { path: string; title: string }[];
  isChild: boolean;
  menu: string;
  onSave: (i: NavItem) => void;
  onClose: () => void;
}) {
  const [item, setItem] = useState<NavItem>({ visible: true, new_tab: false, ...editing.item });
  const [err, setErr] = useState('');
  const set = (k: keyof NavItem, v: any) => setItem({ ...item, [k]: v });
  const urlOptional = menu === 'footer' && !isChild;
  const submit = () => {
    if (!item.label.trim()) return setErr('Enter a label.');
    if (!urlOptional && !item.url.trim()) return setErr('Enter a link.');
    if (item.url && !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(item.url.trim())) return setErr('The link must start with / for a page on this site, or https:// for another website.');
    onSave({ ...item, label: item.label.trim(), url: item.url.trim() });
  };
  return (
    <Modal
      title={editing.isNew ? 'Add menu item' : 'Edit menu item'}
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn" type="button" onClick={submit}>
            {editing.isNew ? 'Add' : 'Apply'}
          </button>
        </>
      }
    >
      {err && (
        <div class="form-error">
          <Icon name="alert" /> {err}
        </div>
      )}
      <div class="field">
        <label for="nav-label">Label</label>
        <input id="nav-label" type="text" maxLength={80} value={item.label} onInput={(e) => set('label', (e.target as HTMLInputElement).value)} />
      </div>
      <div class="field">
        <label for="nav-url">Link {urlOptional && <span class="muted">(optional for a column heading)</span>}</label>
        <input id="nav-url" type="text" list="nav-pages" value={item.url} placeholder="/about/ or https://…" onInput={(e) => set('url', (e.target as HTMLInputElement).value)} />
        <datalist id="nav-pages">
          {pages.map((p) => (
            <option value={p.path}>{p.title}</option>
          ))}
        </datalist>
        <span class="help">Start typing to pick one of the website’s pages.</span>
      </div>
      {menu === 'header' && isChild && (
        <>
          <div class="field">
            <label for="nav-desc">Short description (optional)</label>
            <input id="nav-desc" type="text" maxLength={160} value={item.description ?? ''} onInput={(e) => set('description', (e.target as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label for="nav-icon">Icon</label>
            <select id="nav-icon" value={item.icon ?? ''} onChange={(e) => set('icon', (e.target as HTMLSelectElement).value || null)}>
              <option value="">None</option>
              {ICONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </>
      )}
      <label class="check">
        <input type="checkbox" checked={Boolean(item.new_tab)} onChange={(e) => set('new_tab', (e.target as HTMLInputElement).checked)} /> Open in a new tab
      </label>
      <label class="check" style="margin-top:8px">
        <input type="checkbox" checked={item.visible !== false} onChange={(e) => set('visible', (e.target as HTMLInputElement).checked)} /> Show on the website
      </label>
    </Modal>
  );
}
