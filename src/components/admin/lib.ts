/** Browser helpers shared by the dashboard islands. */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string>,
    public code?: string,
    public data?: any,
  ) {
    super(message);
  }
}

const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

/** fetch() with the session's CSRF token, JSON bodies and readable errors. */
export async function api<T = any>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-CSRF-Token': csrf() };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    toast('Your session has ended. Redirecting to the sign-in page…', 'error');
    setTimeout(() => (location.href = `/admin/login/?next=${encodeURIComponent(location.pathname + location.search)}`), 1200);
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.errors, data.code, data);
  return data as T;
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = type === 'error' ? '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>' : '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>';
  el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${icon}</svg><span></span>`;
  el.querySelector('span')!.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 4000);
}

/** Shows a toast on the next page load (after a redirect). */
export function flash(message: string) {
  try {
    sessionStorage.setItem('fon-flash', message);
  } catch {
    /* ignore */
  }
}

export const formatDate = (v: string | Date | null | undefined, withTime = false) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) return '—';
  return d.toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

export function timeAgo(v: string | Date) {
  const s = Math.round((Date.now() - new Date(v).valueOf()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return formatDate(v);
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Smallest variant at least `min` pixels wide, for thumbnails. */
export function thumbUrl(m: { url: string; variants?: { w: number; url: string }[] } | null | undefined, min = 300) {
  if (!m) return '';
  const v = (m.variants ?? []).slice().sort((a, b) => a.w - b.w);
  return (v.find((x) => x.w >= min) ?? v[v.length - 1])?.url ?? m.url;
}

/**
 * Large photos are scaled down in the browser before upload so they fit the
 * server's upload limit. Returns the original file when no change is needed.
 */
export async function prepareUpload(file: File, maxBytes: number): Promise<File> {
  const resizable = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!resizable || file.size <= maxBytes) return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => null);
  if (!bitmap) return file;
  let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86));
    if (blob && blob.size <= maxBytes) {
      return new File([blob], file.name.replace(/\.[^.]+$/, type === 'image/webp' ? '.webp' : '.jpg'), { type });
    }
    scale *= 0.75;
  }
  return file;
}
