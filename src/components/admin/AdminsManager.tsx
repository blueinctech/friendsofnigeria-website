import { useEffect, useState } from 'preact/hooks';
import { ASSIGNABLE_MODULES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '../../lib/cms/permissions';
import Icon from './Icon';
import { api, ApiError, formatDate, timeAgo, toast } from './lib';
import { confirmAction, Modal, Spinner } from './ui';

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  modules: string[];
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function AdminsManager({ selfId }: { selfId: string }) {
  const [items, setItems] = useState<AdminRow[] | null>(null);
  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);
  const [link, setLink] = useState<{ link: string; emailed: boolean; hours: number; name: string } | null>(null);

  const load = () =>
    api('/api/admin/admins/')
      .then((d) => setItems(d.items))
      .catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
  }, []);

  async function resetLink(a: AdminRow) {
    const ok = await confirmAction({
      title: `Create a password link for ${a.name}?`,
      message: 'They can use it once to choose a new password. Their current password keeps working until then.',
      confirmLabel: 'Create link',
    });
    if (!ok) return;
    try {
      const d = await api(`/api/admin/admins/${a.id}/reset-link/`, { method: 'POST' });
      setLink({ ...d, name: a.name });
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  async function remove(a: AdminRow) {
    const ok = await confirmAction({
      title: `Delete ${a.name}’s account?`,
      message: 'They will be signed out and lose access immediately. Their past activity stays in the log. To pause access instead, disable the account.',
      confirmLabel: 'Delete account',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/admins/${a.id}/`, { method: 'DELETE' });
      toast('Account deleted.');
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  return (
    <>
      <div class="card">
        <div class="card-head">
          <div>
            <h2>Administrator accounts</h2>
            <p>There is no public registration: only super administrators can add accounts.</p>
          </div>
          <button class="btn" type="button" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Invite administrator
          </button>
        </div>
        {!items ? (
          <div class="empty">
            <Spinner />
          </div>
        ) : (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th class="hide-sm">Last sign-in</th>
                  <th>Status</th>
                  <th class="row-actions">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr>
                    <td class="title-cell">
                      <strong>{a.name}</strong>
                      {a.id === selfId && <span class="badge badge--plain" style="margin-left:6px">You</span>}
                      <div class="muted" style="font-size:12px">
                        {a.email}
                      </div>
                    </td>
                    <td>
                      {ROLE_LABELS[a.role]}
                      {a.role === 'content_manager' && (
                        <div class="muted" style="font-size:12px">
                          {a.modules.map((m) => ASSIGNABLE_MODULES.find((x) => x.key === m)?.label ?? m).join(', ')}
                        </div>
                      )}
                    </td>
                    <td class="hide-sm" title={a.last_login_at ? formatDate(a.last_login_at, true) : ''}>
                      {a.last_login_at ? timeAgo(a.last_login_at) : <span class="muted">Never</span>}
                    </td>
                    <td>{a.active ? <span class="badge badge--green">Active</span> : <span class="badge">Disabled</span>}</td>
                    <td class="row-actions">
                      <button class="mini-btn" type="button" title="Edit" onClick={() => setEditing(a)}>
                        <Icon name="edit" size={16} />
                        <span class="sr-only">Edit {a.name}</span>
                      </button>
                      <button class="mini-btn" type="button" title="Create password link" onClick={() => resetLink(a)} disabled={!a.active}>
                        <Icon name="key" size={16} />
                        <span class="sr-only">Create password link for {a.name}</span>
                      </button>
                      {a.id !== selfId && (
                        <button class="mini-btn danger" type="button" title="Delete" onClick={() => remove(a)}>
                          <Icon name="trash" size={16} />
                          <span class="sr-only">Delete {a.name}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div class="card">
        <div class="card-head">
          <h2>What each role can do</h2>
        </div>
        <div class="card-body">
          <ul class="list-plain">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <li style="display:block">
                <strong>{ROLE_LABELS[r]}</strong>
                <div class="muted">{ROLE_DESCRIPTIONS[r]}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {editing && (
        <AdminDialog
          admin={editing === 'new' ? null : editing}
          selfId={selfId}
          onClose={() => setEditing(null)}
          onSaved={(res) => {
            setEditing(null);
            load();
            if (res?.link) setLink(res);
          }}
        />
      )}
      {link && (
        <Modal
          title="Password link"
          onClose={() => setLink(null)}
          footer={
            <button class="btn" type="button" onClick={() => setLink(null)}>
              Done
            </button>
          }
        >
          {link.emailed ? (
            <p class="notice notice--green">
              <Icon name="check-circle" /> We emailed this link to {link.name}.
            </p>
          ) : (
            <p class="notice notice--amber">
              <Icon name="alert" /> Email is not configured, so nothing was sent. Give this link to {link.name} through a secure channel.
            </p>
          )}
          <p style="margin-bottom:8px">
            It works once and expires in {link.hours} hours. You will not see it again after closing this window.
          </p>
          <code class="code-box">{link.link}</code>
          <button
            class="btn btn--ghost btn--sm"
            style="margin-top:10px"
            type="button"
            onClick={() => navigator.clipboard.writeText(link.link).then(() => toast('Link copied.'), () => toast('Copy failed.', 'error'))}
          >
            <Icon name="copy" size={14} /> Copy link
          </button>
        </Modal>
      )}
    </>
  );
}

function AdminDialog({ admin, selfId, onClose, onSaved }: { admin: AdminRow | null; selfId: string; onClose: () => void; onSaved: (res?: any) => void }) {
  const [name, setName] = useState(admin?.name ?? '');
  const [email, setEmail] = useState(admin?.email ?? '');
  const [role, setRole] = useState<Role>(admin?.role ?? 'editor');
  const [modules, setModules] = useState<string[]>(admin?.modules?.length ? admin.modules : ['news']);
  const [active, setActive] = useState(admin?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isSelf = admin?.id === selfId;

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const body = { name, email, role, modules, active };
      const res = admin ? await api(`/api/admin/admins/${admin.id}/`, { method: 'PATCH', body }) : await api('/api/admin/admins/', { method: 'POST', body });
      toast(admin ? 'Account updated.' : 'Administrator invited.');
      onSaved(admin ? undefined : { ...res, name });
    } catch (err) {
      const e = err as ApiError;
      setErrors(e.errors ?? {});
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={admin ? `Edit ${admin.name}` : 'Invite an administrator'}
      onClose={onClose}
      footer={
        <>
          <button class="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button class="btn" type="button" onClick={submit} disabled={saving}>
            {saving && <Spinner />} {admin ? 'Save' : 'Create account'}
          </button>
        </>
      }
    >
      {error && (
        <div class="form-error">
          <Icon name="alert" /> {error}
        </div>
      )}
      <div class="field">
        <label for="adm-name">Full name</label>
        <input id="adm-name" type="text" value={name} maxLength={120} onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-invalid={Boolean(errors.name)} />
        {errors.name && <span class="err">{errors.name}</span>}
      </div>
      <div class="field">
        <label for="adm-email">Email</label>
        <input id="adm-email" type="email" value={email} disabled={Boolean(admin)} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} aria-invalid={Boolean(errors.email)} />
        {errors.email && <span class="err">{errors.email}</span>}
        {!admin && <span class="help">They receive a one-time link to choose their own password. You never see or set it.</span>}
      </div>
      <div class="field">
        <label for="adm-role">Role</label>
        <select id="adm-role" value={role} disabled={isSelf} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <span class="help">{ROLE_DESCRIPTIONS[role]}</span>
      </div>
      {role === 'content_manager' && (
        <fieldset class="field" style="border:0;padding:0;margin:0 0 18px">
          <legend class="field-label" style="margin-bottom:6px">
            Modules this person can manage
          </legend>
          {ASSIGNABLE_MODULES.map((m) => (
            <label class="check" style="margin-bottom:4px">
              <input
                type="checkbox"
                checked={modules.includes(m.key)}
                onChange={(e) => setModules((e.target as HTMLInputElement).checked ? [...modules, m.key] : modules.filter((x) => x !== m.key))}
              />
              {m.label}
            </label>
          ))}
          {errors.modules && <span class="err">{errors.modules}</span>}
        </fieldset>
      )}
      {admin && !isSelf && (
        <label class="switch">
          <input type="checkbox" checked={active} onChange={(e) => setActive((e.target as HTMLInputElement).checked)} /> Account active
        </label>
      )}
    </Modal>
  );
}
