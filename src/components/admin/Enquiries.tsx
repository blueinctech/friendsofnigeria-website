import { useEffect, useRef, useState } from 'preact/hooks';
import Icon from './Icon';
import { api, formatDate, timeAgo, toast } from './lib';
import { confirmAction, Empty, Modal, Spinner, StatusBadge } from './ui';

const TYPE_LABELS: Record<string, string> = {
  contact: 'Contact message',
  membership: 'Membership enquiry',
  fonen: 'FONEN registration',
  newsletter: 'Newsletter sign-up',
};
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  topic: 'Subject',
  message: 'Message',
  programme: 'Programme',
  organisation: 'Organisation',
  country: 'Country',
  category: 'Membership category',
  company: 'Company',
  website: 'Website',
  sector: 'Sector',
  turnover: 'Annual turnover',
  address: 'Address',
  postcode: 'Postal code',
  contactName: 'Contact person',
  contactPhone: 'Contact phone',
  contactEmail: 'Contact email',
  consent: 'Consent given',
};

export default function Enquiries({ group, canDelete, canEdit }: { group: 'membership' | 'contact'; canDelete: boolean; canEdit: boolean }) {
  const initial = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const [tab, setTab] = useState<string>(group === 'contact' && initial.get('tab') === 'newsletter' ? 'newsletter' : group);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initial.get('status') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(initial.get('id'));
  const first = useRef(true);

  const params = (p = page) => {
    const sp = new URLSearchParams({ group: tab, page: String(p) });
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    return sp;
  };

  async function load(p = page) {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/api/admin/enquiries/?${params(p)}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(
      () => {
        first.current = false;
        setPage(1);
        load(1);
      },
      first.current ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [q, status, from, to, tab]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const counts = data?.counts ?? {};

  return (
    <>
      {group === 'contact' && (
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'contact'} onClick={() => setTab('contact')}>
            Contact messages
          </button>
          <button role="tab" aria-selected={tab === 'newsletter'} onClick={() => setTab('newsletter')}>
            Newsletter sign-ups
          </button>
        </div>
      )}
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
        {[
          ['', 'All', (counts.pending ?? 0) + (counts.contacted ?? 0) + (counts.resolved ?? 0)],
          ['pending', 'Pending', counts.pending ?? 0],
          ['contacted', 'Contacted', counts.contacted ?? 0],
          ['resolved', 'Resolved', counts.resolved ?? 0],
        ].map(([key, label, n]) => (
          <button type="button" class="card stat-card" style={`text-align:left;cursor:pointer;font:inherit;${status === key ? 'border-color:var(--a-green);box-shadow:0 0 0 3px var(--a-green-50)' : ''}`} onClick={() => setStatus(key as string)}>
            <div class="stat-top">{label}</div>
            <div class="stat-value">{n}</div>
          </button>
        ))}
      </div>
      <div class="card">
        <div class="toolbar">
          <input class="grow" type="search" placeholder="Search name, email, organisation or message" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search enquiries" />
          <label class="muted" style="font-size:13px;display:flex;gap:6px;align-items:center">
            From <input type="date" value={from} onInput={(e) => setFrom((e.target as HTMLInputElement).value)} />
          </label>
          <label class="muted" style="font-size:13px;display:flex;gap:6px;align-items:center">
            To <input type="date" value={to} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
          </label>
          <a class="btn btn--ghost" href={`/api/admin/enquiries/export/?${params(1)}`} download>
            <Icon name="download" size={16} /> Export CSV
          </a>
          {loading && <Spinner />}
        </div>
        {error && (
          <div class="form-error" style="margin:16px">
            <Icon name="alert" /> {error}
          </div>
        )}
        {data && data.items.length === 0 ? (
          <Empty icon="inbox" title={q || status || from || to ? 'No enquiries match these filters' : 'No enquiries yet'}>
            Submissions from the website forms appear here as soon as they are sent.
          </Empty>
        ) : data ? (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>From</th>
                  {tab !== 'newsletter' && <th class="hide-sm">Subject</th>}
                  {tab === 'membership' && <th class="hide-sm">Type</th>}
                  <th>Received</th>
                  <th>Status</th>
                  <th class="row-actions">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e: any) => (
                  <tr>
                    <td class="title-cell">
                      <a
                        href={`?id=${e.id}`}
                        onClick={(ev) => {
                          ev.preventDefault();
                          setOpenId(e.id);
                        }}
                      >
                        {e.name || e.email}
                      </a>
                      <div class="muted" style="font-size:12px">
                        {e.email}
                        {e.organisation ? ` · ${e.organisation}` : ''}
                      </div>
                    </td>
                    {tab !== 'newsletter' && (
                      <td class="hide-sm">
                        <div>{e.subject || <span class="muted">—</span>}</div>
                        {e.preview && (
                          <div class="muted" style="font-size:12px;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                            {e.preview}
                          </div>
                        )}
                      </td>
                    )}
                    {tab === 'membership' && (
                      <td class="hide-sm">
                        <span class="badge badge--plain">{e.type === 'fonen' ? 'FONEN registration' : 'Enquiry'}</span>
                      </td>
                    )}
                    <td class="nowrap" title={formatDate(e.created_at, true)}>
                      {timeAgo(e.created_at)}
                    </td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                    <td class="row-actions">
                      <button type="button" class="btn btn--ghost btn--sm" onClick={() => setOpenId(e.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="empty">
            <Spinner />
          </div>
        )}
        {data && data.total > 0 && (
          <div class="pager">
            <span>{data.total} submissions</span>
            {pages > 1 && (
              <span style="display:flex;gap:6px;align-items:center">
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
                {page} / {pages}
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
            )}
          </div>
        )}
      </div>
      {openId && (
        <EnquiryDetail
          id={openId}
          canDelete={canDelete}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onChanged={() => load()}
        />
      )}
    </>
  );
}

function EnquiryDetail({ id, onClose, onChanged, canDelete, canEdit }: { id: string; onClose: () => void; onChanged: () => void; canDelete: boolean; canEdit: boolean }) {
  const [item, setItem] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api(`/api/admin/enquiries/${id}/`)
      .then((d) => {
        setItem(d.item);
        setNotes(d.item.notes ?? '');
      })
      .catch((e) => {
        toast(e.message, 'error');
        onClose();
      });
  }, [id]);

  async function update(body: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      const d = await api(`/api/admin/enquiries/${id}/`, { method: 'PATCH', body });
      setItem(d.item);
      toast(message);
      onChanged();
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirmAction({
      title: 'Delete this submission?',
      message: 'The personal information in it will be permanently deleted. Delete only when it is no longer needed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/enquiries/${id}/`, { method: 'DELETE' });
      toast('Submission deleted.');
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  return (
    <Modal title={item ? TYPE_LABELS[item.type] : 'Submission'} onClose={onClose} wide>
      {!item ? (
        <div class="empty">
          <Spinner />
        </div>
      ) : (
        <div class="detail-grid">
          <div>
            <dl class="kv" style="font-size:14px;gap:8px 16px;margin-top:0">
              {Object.entries(item.data ?? {})
                .filter(([k]) => k !== 'message')
                .map(([k, v]) => (
                  <>
                    <dt>{FIELD_LABELS[k] ?? k}</dt>
                    <dd>{k === 'email' || k === 'contactEmail' ? <a href={`mailto:${v}`}>{String(v)}</a> : k === 'website' && /^https?:/.test(String(v)) ? <a href={String(v)} target="_blank" rel="noopener noreferrer">{String(v)}</a> : String(v)}</dd>
                  </>
                ))}
            </dl>
            {item.message && (
              <>
                <span class="field-label">Message</span>
                <div class="message-box" style="margin-top:6px">{item.message}</div>
              </>
            )}
          </div>
          <div>
            <div class="field">
              <span class="field-label">Status</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                {['pending', 'contacted', 'resolved'].map((s) => (
                  <button
                    type="button"
                    class={`btn btn--sm ${item.status === s ? '' : 'btn--ghost'}`}
                    disabled={!canEdit || saving || item.status === s}
                    onClick={() => update({ status: s }, `Marked as ${s}.`)}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div class="field">
              <label for="enq-notes">Internal notes</label>
              <textarea id="enq-notes" rows={4} value={notes} disabled={!canEdit} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="Visible to administrators only" />
              {canEdit && (
                <button type="button" class="btn btn--ghost btn--sm" disabled={saving || notes === (item.notes ?? '')} onClick={() => update({ notes }, 'Notes saved.')}>
                  Save notes
                </button>
              )}
            </div>
            <dl class="kv">
              <dt>Received</dt>
              <dd>{formatDate(item.created_at, true)}</dd>
              <dt>Emailed to team</dt>
              <dd>{item.email_sent ? 'Yes' : 'No (email not configured or failed)'}</dd>
              {item.handled_by_name && (
                <>
                  <dt>Last handled by</dt>
                  <dd>
                    {item.handled_by_name}, {formatDate(item.updated_at, true)}
                  </dd>
                </>
              )}
            </dl>
            <a class="btn btn--block" href={`mailto:${item.email}?subject=${encodeURIComponent('Re: ' + (item.subject || TYPE_LABELS[item.type]))}`}>
              <Icon name="contact" size={16} /> Reply by email
            </a>
            {canDelete && (
              <button type="button" class="btn btn--danger btn--block" style="margin-top:8px" onClick={remove}>
                <Icon name="trash" size={16} /> Delete submission
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
