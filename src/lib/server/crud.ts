/**
 * Generic create/read/update/delete for the resources in src/lib/cms/resources.ts.
 * Column and table names only ever come from those definitions; values are
 * always passed as query parameters.
 */
import type { Field } from '../cms/fields.ts';
import { RESOURCES, type Resource } from '../cms/resources.ts';
import { PAGE_SCHEMAS, RESERVED_PATHS } from '../cms/blocks.ts';
import { isForeignKeyViolation, isUniqueViolation, one, query, transaction, type Row, type Tx } from './db.ts';
import { clearedSeoFields, isUuid, validateBlocks, validateFields, type Errors } from './validate.ts';
import { mediaByIds, publicMedia } from './media.ts';

export class CrudError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors?: Errors,
    public code?: string,
  ) {
    super(message);
  }
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Bad identifier ${name}`);
  return `"${name}"`;
};

/** Fields stored as columns (galleries live in join tables, blocks in "content"). */
const columnFields = (r: Resource) => r.fields.filter((f) => f.type !== 'gallery');
const hasColumn = (r: Resource, name: string) => r.fields.some((f) => f.name === name && f.type !== 'gallery');
const hasPublishedAt = (r: Resource) => r.publishable;

/** Extra computed columns for lists. */
const EXTRA_SELECT: Record<string, string> = {
  'news-categories': `(SELECT count(*)::int FROM news n WHERE n.category_id = t.id) AS article_count`,
  'team-groups': `(SELECT count(*)::int FROM team_members m WHERE m.group_id = t.id) AS member_count`,
  albums: `(SELECT count(*)::int FROM album_photos p WHERE p.album_id = t.id) AS photo_total`,
  events: `CASE WHEN t.timing <> 'auto' THEN t.timing
               WHEN coalesce(t.end_date, t.start_date) >= current_date THEN 'upcoming'
               WHEN t.start_date IS NULL THEN 'undated' ELSE 'past' END AS timing_state`,
  pages: 't.kind, t.key',
};

export interface ListParams {
  q?: string;
  filters?: Record<string, string>;
  page?: number;
  perPage?: number;
  sort?: string;
}

export async function listRecords(r: Resource, params: ListParams) {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };

  const q = (params.q ?? '').trim().slice(0, 100);
  if (q) {
    const p = add(`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    where.push(`(${r.searchFields.map((f) => `t.${ident(f)}::text ILIKE ${p}`).join(' OR ')})`);
  }
  for (const [name, value] of Object.entries(params.filters ?? {})) {
    if (!value || !r.filters?.some((f) => f.name === name)) continue;
    if (name === 'status' && r.key === 'news' && value === 'scheduled') {
      where.push(`t.status = 'published' AND t.published_at > now()`);
    } else if (name === 'status' && r.key === 'news' && value === 'published') {
      where.push(`t.status = 'published' AND (t.published_at IS NULL OR t.published_at <= now())`);
    } else if (name === 'timing_state') {
      where.push(`${EXTRA_SELECT.events.replace(/ AS timing_state$/, '')} = ${add(value)}`);
    } else if (name === 'group_id' && !isUuid(value)) {
      continue;
    } else {
      where.push(`t.${ident(name)}::text = ${add(value)}`);
    }
  }

  // Sorting: only by known columns.
  const known = new Set(['created_at', 'updated_at', 'sort_order', ...r.fields.map((f) => f.name), 'path']);
  let orderBy: string;
  const sort = params.sort || r.defaultSort;
  if (sort === 'group,sort_order') {
    orderBy = `(SELECT g.sort_order FROM team_groups g WHERE g.id = t.group_id), t.sort_order, t.name`;
  } else {
    const desc = sort.startsWith('-');
    const col = sort.replace(/^-/, '');
    orderBy = known.has(col) ? `t.${ident(col)} ${desc ? 'DESC' : 'ASC'} NULLS LAST, t.created_at DESC` : 't.created_at DESC';
  }

  const perPage = Math.min(Math.max(Number(params.perPage) || 25, 1), 200);
  const page = Math.max(Number(params.page) || 1, 1);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const extra = EXTRA_SELECT[r.key] ? `, ${EXTRA_SELECT[r.key]}` : '';
  const listCols = new Set(['id', 'created_at', 'updated_at', r.labelField, ...r.columns.map((c) => c.name).filter((c) => hasColumn(r, c) || ['path', 'slug', 'sort_order', 'published_at', 'updated_at'].includes(c))]);
  if (hasColumn(r, 'slug')) listCols.add('slug');
  if (r.sortable) listCols.add('sort_order');
  if (r.publishable) listCols.add('published_at');
  if (r.key === 'pages') listCols.add('path');
  if (r.key === 'programmes') listCols.add('type');
  if (r.key === 'team') listCols.add('bio');
  const select = [...listCols].map((c) => `t.${ident(c)}`).join(', ');

  const [rows, count] = await Promise.all([
    query(`SELECT ${select}${extra} FROM ${ident(r.table)} t ${whereSql} ORDER BY ${orderBy} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`, args),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM ${ident(r.table)} t ${whereSql}`, args),
  ]);
  for (const row of rows) if (r.key === 'team') row.bio = row.bio ? true : false;

  // Labels for reference columns, and thumbnails for image columns.
  const refs: Record<string, Record<string, string>> = {};
  for (const col of r.columns.filter((c) => c.kind === 'ref')) {
    const field = r.fields.find((f) => f.name === col.name);
    const target = field?.ref ? RESOURCES[field.ref] : undefined;
    if (!target) continue;
    const ids = [...new Set(rows.map((x) => x[col.name]).filter(isUuid))];
    const labels = ids.length ? await query(`SELECT id, ${ident(target.labelField)} AS label FROM ${ident(target.table)} WHERE id = ANY($1::uuid[])`, [ids]) : [];
    refs[col.name] = Object.fromEntries(labels.map((l) => [l.id, l.label]));
  }
  const imageCols = r.columns.filter((c) => c.kind === 'image').map((c) => c.name);
  const media = imageCols.length ? await mediaByIds(rows.flatMap((x) => imageCols.map((c) => x[c]))) : {};

  return {
    items: rows.map((row) => ({ ...row, _public: r.publicPath?.(row) ?? null })),
    total: count?.n ?? 0,
    page,
    perPage,
    refs,
    media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, publicMedia(v)])),
  };
}

/** Options for reference fields: [{ value: id, label }]. */
export async function referenceOptions(refKey: string) {
  const target = RESOURCES[refKey];
  if (!target) return [];
  const order = target.sortable ? 'sort_order, ' : '';
  const rows = await query(`SELECT id, ${ident(target.labelField)} AS label FROM ${ident(target.table)} ORDER BY ${order}${ident(target.labelField)}`);
  return rows.map((x) => ({ value: x.id as string, label: x.label as string }));
}

export async function getRecord(r: Resource, id: string) {
  if (!isUuid(id)) return null;
  const row = await one(`SELECT * FROM ${ident(r.table)} WHERE id = $1`, [id]);
  if (!row) return null;
  for (const f of r.fields.filter((x) => x.type === 'gallery' && x.join)) {
    const rows = await query(`SELECT media_id FROM ${ident(f.join!.table)} WHERE ${ident(f.join!.fk)} = $1 ORDER BY sort_order`, [id]);
    row[f.name] = rows.map((x) => x.media_id);
  }
  return row;
}

/** All media referenced by a record, so the editor can show previews. */
export async function mediaForRecord(r: Resource, row: Row) {
  const ids: unknown[] = [];
  const collect = (fields: Field[], data: Record<string, unknown>) => {
    for (const f of fields) {
      const v = data?.[f.name];
      if (f.type === 'image') ids.push(v);
      else if (f.type === 'gallery' && Array.isArray(v)) ids.push(...v);
      else if (f.type === 'list' && Array.isArray(v)) for (const item of v) collect(f.fields ?? [], item as Record<string, unknown>);
    }
  };
  collect(r.fields, row);
  if (r.key === 'pages' && row.key && PAGE_SCHEMAS[row.key]) collect(PAGE_SCHEMAS[row.key].sections.flatMap((s) => s.fields), row.content ?? {});
  const media = await mediaByIds(ids as string[]);
  return Object.fromEntries(Object.entries(media).map(([k, v]) => [k, publicMedia(v)]));
}

function publicPathConflicts(path: string) {
  const first = path.replace(/^\/|\/$/g, '').split('/')[0];
  return RESERVED_PATHS.includes(first);
}

interface SaveContext {
  actorId: string;
  confirmSeoClear?: boolean;
}

async function writeGalleries(tx: Tx, r: Resource, id: string, values: Record<string, unknown>) {
  for (const f of r.fields.filter((x) => x.type === 'gallery' && x.join)) {
    const ids = (values[f.name] as string[]) ?? [];
    await tx.query(`DELETE FROM ${ident(f.join!.table)} WHERE ${ident(f.join!.fk)} = $1`, [id]);
    for (let i = 0; i < ids.length; i++) {
      await tx.query(`INSERT INTO ${ident(f.join!.table)} (${ident(f.join!.fk)}, media_id, sort_order) VALUES ($1, $2, $3)`, [id, ids[i], i]);
    }
  }
}

function friendlyDbError(err: unknown, r: Resource): never {
  if (isUniqueViolation(err)) {
    const detail = String((err as { detail?: string }).detail ?? '');
    const field = /\((?:[a-z_]+, )?([a-z_]+)\)/.exec(detail)?.[1] ?? 'slug';
    throw new CrudError('Another item already uses this value.', 409, { [field === 'path' ? 'slug' : field]: 'Another item already uses this. Choose a different one.' });
  }
  if (isForeignKeyViolation(err)) {
    throw new CrudError(`This ${r.singular} is linked to other content (for example a board that still has members). Move or remove those first.`, 409);
  }
  throw err;
}

/** Validates and saves a record. Returns { row, action }. */
export async function saveRecord(r: Resource, id: string | null, input: Record<string, unknown>, ctx: SaveContext) {
  const existing = id ? await getRecord(r, id) : null;
  if (id && !existing) throw new CrudError('Not found.', 404);

  // Built-in pages keep their kind, key and address.
  let data = { ...input };
  if (r.key === 'pages') {
    data.kind = existing?.kind ?? 'custom';
    if (existing?.kind === 'system') data.slug = existing.slug;
  }
  const fields = columnFields(r);
  const { values, errors } = validateFields(r.fields, data);

  if (r.key === 'pages') {
    if (data.kind === 'system') {
      const schema = PAGE_SCHEMAS[existing!.key];
      const blocks = validateBlocks(schema, input.content);
      values.content = blocks.values;
      for (const [k, v] of Object.entries(blocks.errors)) errors[`content.${k}`] = v;
      values.path = existing!.path;
      values.body = existing!.body;
    } else {
      values.content = {};
      values.path = `/${values.slug}/`;
      if (values.slug && publicPathConflicts(values.path as string)) errors.slug = 'This address is used by the website. Choose a different one.';
    }
    values.kind = data.kind;
  }
  if (Object.keys(errors).length) throw new CrudError('Please correct the highlighted fields.', 422, errors);

  const cleared = clearedSeoFields(r.fields, existing, values);
  if (cleared.length && !ctx.confirmSeoClear) {
    throw new CrudError(`You are removing essential SEO information (${cleared.join(', ')}). Search engines will fall back to defaults.`, 409, undefined, 'seo_clear');
  }

  // Publishing sets the publication date if none was chosen.
  let action: 'create' | 'update' | 'publish' | 'unpublish' = existing ? 'update' : 'create';
  if (r.publishable) {
    const wasPublished = existing?.status === 'published';
    const isPublished = values.status === 'published';
    if (isPublished && !values.published_at) values.published_at = existing?.published_at ?? new Date().toISOString();
    if (existing && wasPublished !== isPublished) action = isPublished ? 'publish' : 'unpublish';
  }

  const cols = fields.map((f) => f.name).filter((n) => n !== 'content' || r.key === 'pages');
  if (r.key === 'pages') cols.push('path', 'kind');
  if (hasPublishedAt(r) && !cols.includes('published_at')) cols.push('published_at');
  const uniqueCols = [...new Set(cols)];
  const jsonCols = new Set(r.fields.filter((f) => f.type === 'list' || f.type === 'strings' || f.type === 'blocks').map((f) => f.name));
  const param = (c: string) => (jsonCols.has(c) ? JSON.stringify(values[c] ?? (c === 'content' ? {} : [])) : values[c] ?? null);

  try {
    const row = await transaction(async (tx) => {
      let saved: Row;
      if (existing) {
        const sets = uniqueCols.map((c, i) => `${ident(c)} = $${i + 2}`);
        [saved] = await tx.query(
          `UPDATE ${ident(r.table)} SET ${sets.join(', ')}, updated_by = $${uniqueCols.length + 2}, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, ...uniqueCols.map(param), ctx.actorId],
        );
      } else {
        const extraCols = r.sortable ? ['sort_order'] : [];
        const allCols = [...uniqueCols, ...extraCols, 'created_by', 'updated_by'];
        const sortOrder = r.sortable ? ((await tx.query(`SELECT coalesce(max(sort_order), 0) + 1 AS n FROM ${ident(r.table)}`))[0].n as number) : null;
        const params = [...uniqueCols.map(param), ...(r.sortable ? [sortOrder] : []), ctx.actorId, ctx.actorId];
        [saved] = await tx.query(
          `INSERT INTO ${ident(r.table)} (${allCols.map(ident).join(', ')}) VALUES (${allCols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
          params,
        );
      }
      await writeGalleries(tx, r, saved.id, values);
      return saved;
    });
    return { row, action, label: String(row[r.labelField] ?? '') };
  } catch (err) {
    friendlyDbError(err, r);
  }
}

export async function deleteRecord(r: Resource, id: string) {
  const existing = await getRecord(r, id);
  if (!existing) throw new CrudError('Not found.', 404);
  if (r.key === 'pages' && existing.kind === 'system') throw new CrudError('Built-in pages cannot be deleted. You can unpublish them instead.', 400);
  if (r.key === 'team-groups') {
    const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM team_members WHERE group_id = $1', [id]);
    if (n?.n) throw new CrudError(`This board still has ${n.n} member${n.n > 1 ? 's' : ''}. Move them to another board first.`, 409);
  }
  try {
    await query(`DELETE FROM ${ident(r.table)} WHERE id = $1`, [id]);
  } catch (err) {
    friendlyDbError(err, r);
  }
  return { label: String(existing[r.labelField] ?? '') };
}

export async function reorderRecords(r: Resource, ids: unknown) {
  if (!r.sortable) throw new CrudError('This list cannot be reordered.', 400);
  if (!Array.isArray(ids) || !ids.every(isUuid) || ids.length > 1000) throw new CrudError('Invalid order.', 400);
  await transaction(async (tx) => {
    // Keep the relative positions of items that were not part of this list.
    const current = await tx.query(`SELECT id, sort_order FROM ${ident(r.table)} WHERE id = ANY($1::uuid[]) ORDER BY sort_order`, [ids]);
    let slots = current.map((x) => x.sort_order as number).sort((a, b) => a - b);
    if (new Set(slots).size !== slots.length || slots.length !== ids.length) {
      const start = slots[0] ?? 0;
      slots = ids.map((_, i) => start + i);
    }
    for (let i = 0; i < ids.length; i++) {
      await tx.query(`UPDATE ${ident(r.table)} SET sort_order = $2 WHERE id = $1`, [ids[i], slots[i]]);
    }
  });
}
