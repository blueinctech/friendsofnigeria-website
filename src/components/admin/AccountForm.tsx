import { useState } from 'preact/hooks';
import Icon from './Icon';
import { api, ApiError, toast } from './lib';
import { Spinner } from './ui';

export default function AccountForm({ name: initialName, email }: { name: string; email: string }) {
  const [name, setName] = useState(initialName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'' | 'name' | 'pw'>('');

  async function saveName(e: Event) {
    e.preventDefault();
    setBusy('name');
    try {
      await api('/api/admin/account/', { method: 'PATCH', body: { name } });
      toast('Name updated.');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function savePassword(e: Event) {
    e.preventDefault();
    if (next !== confirm) return setErrors({ confirm: 'The two new passwords do not match.' });
    setBusy('pw');
    setErrors({});
    try {
      await api('/api/admin/account/', { method: 'PATCH', body: { currentPassword: current, newPassword: next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast('Password changed. Other devices have been signed out.');
    } catch (err) {
      const ex = err as ApiError;
      setErrors(ex.errors ?? { newPassword: ex.message });
    } finally {
      setBusy('');
    }
  }

  return (
    <div class="dash-grid">
      <div>
        <form class="card" onSubmit={saveName}>
          <div class="card-head">
            <h2>Profile</h2>
          </div>
          <div class="card-body">
            <div class="field">
              <label for="acc-name">Full name</label>
              <input id="acc-name" type="text" value={name} maxLength={120} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </div>
            <div class="field">
              <label for="acc-email">Email</label>
              <input id="acc-email" type="email" value={email} disabled />
              <span class="help">Ask a super administrator to change your email address.</span>
            </div>
            <button class="btn" type="submit" disabled={busy !== '' || !name.trim()}>
              {busy === 'name' && <Spinner />} Save
            </button>
          </div>
        </form>
      </div>
      <div>
        <form class="card" onSubmit={savePassword}>
          <div class="card-head">
            <h2>Change password</h2>
          </div>
          <div class="card-body">
            <div class="field">
              <label for="acc-current">Current password</label>
              <input id="acc-current" type="password" autocomplete="current-password" value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} aria-invalid={Boolean(errors.currentPassword)} />
              {errors.currentPassword && <span class="err">{errors.currentPassword}</span>}
            </div>
            <div class="field">
              <label for="acc-new">New password</label>
              <input id="acc-new" type="password" autocomplete="new-password" minLength={12} value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} aria-invalid={Boolean(errors.newPassword)} />
              {errors.newPassword ? <span class="err">{errors.newPassword}</span> : <span class="help">At least 12 characters. A short sentence is easy to remember and hard to guess.</span>}
            </div>
            <div class="field">
              <label for="acc-confirm">Repeat new password</label>
              <input id="acc-confirm" type="password" autocomplete="new-password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} aria-invalid={Boolean(errors.confirm)} />
              {errors.confirm && <span class="err">{errors.confirm}</span>}
            </div>
            <button class="btn" type="submit" disabled={busy !== '' || !current || !next}>
              {busy === 'pw' ? <Spinner /> : <Icon name="key" size={16} />} Change password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
