import { useEffect, useRef, useState } from 'preact/hooks';
import { RESOURCES, type ListColumn } from '../../lib/cms/resources';
import type { Option } from '../../lib/cms/fields';
import Icon from './Icon';
import { api, formatDate, thumbUrl, toast } from './lib';
import { useRefOptions } from './Fields';
import { confirmAction, Empty, Spinner, StatusBadge } from './ui';

interface Props {
  resource: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const BADGE_LABELS: Record<string, string> = {
  system: 'Built-in',
  custom: 'Custom',
  flagship: 'Flagship',
  event: 'Event',
  upcoming: 'Upcoming',
  past: 'Past',
  undated: 'No date',
  area: 'Area of work',
  membership: 'Membership',
  programme: 'Programme',
};

export default function ResourceList({ resource, canCreate, canEdit, canDelete }: Props) {
  const r = RESOURCES[resource];
  const initial = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const [q, setQ] = useState(initial.get('q') ?? '');
  const [filters, setFilters] = useState<Record<string, string>>(() => Object.fromEntries((r.filters ?? []).map((f) => [f.name, initial.get(f.name) ?? ''])));
  const [page, setPage] = useState(Number(initial.get('page') || 1));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const groupOptions = useRefOptions(r.filters?.some((f) => f.name === 'group_id') ? 'team-groups' : undefined);
  const first = useRef(true);

  const searching = Boolean(q) || Object.entries(filters).some(([k, v]) => v && k !== 'group_id');
  const reorderable = r.sortable && canEdit && !searching;
  const perPage = reorderable ? 200 : 25;

  async function load(p = page) {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(p), perPage: String(perPage) });
    if (q) params.set('q', q);
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    try {
      setData(await api(`/api/admin/r/${resource}/?${params}`));
      const url = new URL(location.href);
      url.search = '';
      if (q) url.searchParams.set('q', q);
      for (const [k, v] of Object.entries(filters)) if (v) url.searchParams.set(k, v);
      if (p > 1) url.searchParams.set('page', String(p));
      history.replaceState(null, '', url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(
      () => {
        const p = first.current ? page : 1;
        first.current = false;
        setPage(p);
        load(p);
      },
      first.current ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [q, JSON.stringify(filters)]);

  async function remove(item: any) {
    const label = item[r.labelField];
    const ok = await confirmAction({
      title: `Delete this ${r.singular}?`,
      message: (
        <>
          <strong>{label}</strong> will be permanently deleted{r.publishable ? ' and removed from the website' : ''}. This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/r/${resource}/${item.id}/`, { method: 'DELETE' });
      toast(`${capitalise(r.singular)} deleted.`);
      load();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }

  async function saveOrder(items: any[]) {
    setData((d: any) => ({ ...d, items }));
    try {
      await api(`/api/admin/r/${resource}/reorder/`, { method: 'POST', body: { ids: items.map((i) => i.id) } });
      toast('Order saved. The website shows the new order within a minute.');
    } catch (err) {
      toast((err as Error).message, 'error');
      load();
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= data.items.length || from === to) return;
    const items = [...data.items];
    const [x] = items.splice(from, 1);
    items.splice(to, 0, x);
    saveOrder(items);
  }

  const cell = (col: ListColumn, item: any) => {
    const v = item[col.name];
    switch (col.kind) {
      case 'status':
        return <StatusBadge status={v} publishedAt={item.published_at} labels={r.fields.find((f) => f.name === 'status')?.options?.reduce((a, o) => ({ ...a, [o.value]: o.label.replace(' (hidden)', '') }), {} as Record<string, string>)} />;
      case 'date':
        return <span class="nowrap">{formatDate(v)}</span>;
      case 'datetime':
        return <span class="nowrap muted">{formatDate(v, true)}</span>;
      case 'badge':
        return v ? <span class={`badge badge--plain ${v === 'upcoming' ? 'badge--green' : ''}`}>{BADGE_LABELS[v] ?? v}</span> : null;
      case 'ref':
        return data.refs?.[col.name]?.[v] ?? <span class="muted">—</span>;
      case 'count':
        return <span class="nowrap">{v ?? 0}</span>;
      case 'image': {
        const m = data.media?.[v];
        return m ? <img class={`thumb ${resource === 'partners' ? 'thumb--contain' : ''}`} src={thumbUrl(m, 100)} alt="" loading="lazy" /> : <span class="thumb" />;
      }
      default:
        if (col.name === r.labelField || col.name === r.columns.find((c) => !c.kind)?.name) {
          return (
            <span class="title-cell">
              {canEdit ? <a href={`/admin/${resource}/${item.id}/`}>{v || '(untitled)'}</a> : <strong>{v}</strong>}
              {resource === 'news' && item.featured && <span class="badge badge--plain" style="margin-left:6px">Featured</span>}
            </span>
          );
        }
        if (col.name === 'url' && v) return <span class="muted" style="font-size:12px">{String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>;
        return v ?? <span class="muted">—</span>;
    }
  };

  const filterDefs = (r.filters ?? []).map((f) => (f.name === 'group_id' ? { ...f, options: (groupOptions ?? []) as Option[] } : f));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <>
      <div class="card">
        <div class="toolbar">
          <input class="grow" type="search" placeholder={`Search ${r.label.toLowerCase()}`} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search" />
          {filterDefs.map((f) => (
            <select value={filters[f.name]} onChange={(e) => setFilters({ ...filters, [f.name]: (e.target as HTMLSelectElement).value })} aria-label={f.label}>
              <option value="">{f.name === 'group_id' ? 'All boards' : `Any ${f.label.toLowerCase()}`}</option>
              {f.options.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          {loading && <Spinner />}
        </div>
        {r.sortable && canEdit && (
          <p class="muted" style="font-size:12px;padding:8px 16px;border-bottom:1px solid var(--a-line);background:var(--a-surface-2)">
            {reorderable ? (
              <>
                <Icon name="grip" size={14} /> Drag rows, or use the arrows, to change the order shown on the website.
              </>
            ) : (
              'Clear the search and filters to change the order.'
            )}
          </p>
        )}
        {error && (
          <div class="form-error" style="margin:16px">
            <Icon name="alert" /> {error}
            <button class="btn btn--ghost btn--sm" onClick={() => load()}>
              Try again
            </button>
          </div>
        )}
        {data && data.items.length === 0 ? (
          <Empty icon="inbox" title={searching ? 'Nothing matches your search' : `No ${r.label.toLowerCase()} yet`}>
            {!searching && canCreate && (
              <p style="margin-top:12px">
                <a class="btn" href={`/admin/${resource}/new/`}>
                  <Icon name="plus" size={16} /> Add {r.singular}
                </a>
              </p>
            )}
          </Empty>
        ) : data ? (
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  {reorderable && <th style="width:70px">Order</th>}
                  {r.columns.map((c) => (
                    <th class={c.kind === 'datetime' ? 'hide-sm' : ''}>{c.label}</th>
                  ))}
                  <th class="row-actions">
                    <span class="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: any, i: number) => (
                  <tr
                    key={item.id}
                    class={`${dragIndex === i ? 'dragging' : ''} ${overIndex === i && dragIndex !== null && dragIndex !== i ? 'drop-target' : ''}`}
                    draggable={reorderable}
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer!.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (dragIndex === null) return;
                      e.preventDefault();
                      setOverIndex(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null) move(dragIndex, i);
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                  >
                    {reorderable && (
                      <td class="nowrap">
                        <span class="drag-handle" aria-hidden="true">
                          <Icon name="grip" size={16} />
                        </span>
                        <button type="button" class="mini-btn" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${item[r.labelField]} up`}>
                          <Icon name="chevron-up" size={14} />
                        </button>
                        <button type="button" class="mini-btn" disabled={i === data.items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${item[r.labelField]} down`}>
                          <Icon name="chevron-down" size={14} />
                        </button>
                      </td>
                    )}
                    {r.columns.map((c) => (
                      <td class={c.kind === 'datetime' ? 'hide-sm' : ''}>{cell(c, item)}</td>
                    ))}
                    <td class="row-actions">
                      {item._public && item.status !== 'draft' && (
                        <a class="mini-btn" href={item._public} target="_blank" rel="noopener" title="View on website">
                          <Icon name="external" size={16} />
                          <span class="sr-only">View {item[r.labelField]} on the website</span>
                        </a>
                      )}
                      {canEdit && (
                        <a class="mini-btn" href={`/admin/${resource}/${item.id}/`} title="Edit">
                          <Icon name="edit" size={16} />
                          <span class="sr-only">Edit {item[r.labelField]}</span>
                        </a>
                      )}
                      {canDelete && !(resource === 'pages' && item.kind === 'system') && (
                        <button type="button" class="mini-btn danger" onClick={() => remove(item)} title="Delete">
                          <Icon name="trash" size={16} />
                          <span class="sr-only">Delete {item[r.labelField]}</span>
                        </button>
                      )}
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
            <span>
              {data.total} {data.total === 1 ? r.singular : r.label.toLowerCase().includes('&') ? 'items' : `${r.singular}s`}
            </span>
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
                <span>
                  {page} / {pages}
                </span>
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
    </>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
