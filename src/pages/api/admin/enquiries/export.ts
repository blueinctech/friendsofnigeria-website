import type { APIRoute } from 'astro';
import { query } from '../../../../lib/server/db';
import { csvCell, ENQUIRY_TYPE_LABELS, enquiryWhere } from '../../../../lib/server/enquiries';
import { logActivity } from '../../../../lib/server/activity';
import { clientIp, guard, handleError, isResponse } from '../../../../lib/server/http';

/** Downloads the filtered enquiries as CSV (UTF-8 with BOM, opens cleanly in Excel). */
export const GET: APIRoute = async (ctx) => {
  const g = guard(ctx, 'enquiries', 'view');
  if (isResponse(g)) return g;
  try {
    const sp = ctx.url.searchParams;
    const group = sp.get('group') ?? 'contact';
    const { sql, args } = enquiryWhere({ group, q: sp.get('q') ?? '', status: sp.get('status') ?? '', from: sp.get('from') ?? '', to: sp.get('to') ?? '', type: sp.get('type') ?? '' });
    const rows = await query(`SELECT * FROM enquiries ${sql} ORDER BY created_at DESC LIMIT 20000`, args);
    const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.data ?? {})))].filter((k) => !['name', 'email', 'phone', 'organisation', 'topic', 'message', 'consent'].includes(k));
    const header = ['Received', 'Type', 'Status', 'Name', 'Email', 'Phone', 'Organisation', 'Subject', 'Message', ...extraKeys, 'Notes'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 16),
          ENQUIRY_TYPE_LABELS[r.type] ?? r.type,
          r.status,
          r.name,
          r.email,
          r.phone,
          r.organisation,
          r.subject,
          r.message,
          ...extraKeys.map((k) => r.data?.[k]),
          r.notes,
        ]
          .map(csvCell)
          .join(','),
      );
    }
    await logActivity(g.admin, { action: 'export', entityType: 'enquiry', entityLabel: `${rows.length} ${group} enquiries to CSV`, ip: clientIp(ctx) });
    const name = `fon-${group}-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response('﻿' + lines.join('\r\n'), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return handleError(err);
  }
};
