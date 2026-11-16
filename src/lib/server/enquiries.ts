/**
 * Membership enquiries, contact messages and newsletter sign-ups received
 * through the website forms.
 */
import { one, query } from './db.ts';
import { isUuid } from './validate.ts';

export const ENQUIRY_GROUPS: Record<string, string[]> = {
  membership: ['membership', 'fonen'],
  contact: ['contact'],
  newsletter: ['newsletter'],
};

export const ENQUIRY_TYPE_LABELS: Record<string, string> = {
  contact: 'Contact message',
  membership: 'Membership enquiry',
  fonen: 'FONEN registration',
  newsletter: 'Newsletter sign-up',
};

export const ENQUIRY_STATUSES = ['pending', 'contacted', 'resolved'];

export interface EnquiryFilters {
  group: string;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  type?: string;
}

export function enquiryWhere(f: EnquiryFilters) {
  const types = ENQUIRY_GROUPS[f.group] ?? ENQUIRY_GROUPS.contact;
  const args: unknown[] = [types];
  const where = ['type = ANY($1)'];
  const add = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (f.type && types.includes(f.type)) where.push(`type = ${add(f.type)}`);
  if (f.status && ENQUIRY_STATUSES.includes(f.status)) where.push(`status = ${add(f.status)}`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) where.push(`created_at >= ${add(f.from)}::date`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) where.push(`created_at < (${add(f.to)}::date + 1)`);
  const q = (f.q ?? '').trim().slice(0, 100);
  if (q) {
    const p = add(`%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    where.push(`(name ILIKE ${p} OR email ILIKE ${p} OR organisation ILIKE ${p} OR subject ILIKE ${p} OR message ILIKE ${p})`);
  }
  return { sql: `WHERE ${where.join(' AND ')}`, args };
}

export async function listEnquiries(f: EnquiryFilters, page = 1, perPage = 25) {
  const { sql, args } = enquiryWhere(f);
  perPage = Math.min(Math.max(perPage, 1), 100);
  page = Math.max(page, 1);
  const [items, count, counts] = await Promise.all([
    query(
      `SELECT id, type, name, email, phone, organisation, subject, left(coalesce(message, ''), 160) AS preview, status, created_at
         FROM enquiries ${sql} ORDER BY created_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
      args,
    ),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM enquiries ${sql}`, args),
    query(`SELECT status, count(*)::int AS n FROM enquiries WHERE type = ANY($1) GROUP BY status`, [ENQUIRY_GROUPS[f.group] ?? []]),
  ]);
  return { items, total: count?.n ?? 0, page, perPage, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

export async function getEnquiry(id: string) {
  if (!isUuid(id)) return null;
  return one(
    `SELECT e.*, a.name AS handled_by_name FROM enquiries e LEFT JOIN admins a ON a.id = e.handled_by WHERE e.id = $1`,
    [id],
  );
}

/** CSV cell, neutralising spreadsheet formulas. */
export function csvCell(value: unknown) {
  let s = value == null ? '' : value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
