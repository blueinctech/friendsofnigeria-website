/**
 * Audit log: who created, edited, published or deleted what, and when.
 */
import { query } from './db.ts';

export interface Actor {
  id: string;
  name: string;
}

export interface LogEntry {
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  entityLabel?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

export async function logActivity(actor: Actor | null, entry: LogEntry) {
  try {
    await query(
      `INSERT INTO activity_log (admin_id, admin_name, action, entity_type, entity_id, entity_label, details, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor?.id ?? null,
        actor?.name ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId == null ? null : String(entry.entityId),
        entry.entityLabel ? String(entry.entityLabel).slice(0, 300) : null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ip ?? null,
      ],
    );
  } catch (err) {
    // Never fail the user's action because the log could not be written.
    console.error('[activity] could not write log entry', (err as Error).message);
  }
}

export const ACTION_LABELS: Record<string, string> = {
  create: 'created',
  update: 'edited',
  publish: 'published',
  unpublish: 'unpublished',
  delete: 'deleted',
  reorder: 'reordered',
  upload: 'uploaded',
  login: 'signed in',
  logout: 'signed out',
  login_failed: 'failed to sign in as',
  password_reset_requested: 'requested a password reset',
  password_reset: 'reset their password',
  password_changed: 'changed their password',
  reset_link_created: 'created a password link for',
  status: 'updated the status of',
  export: 'exported',
  setup: 'completed the first-time setup',
};

export interface ActivityRow {
  id: string | number;
  admin_id: string | null;
  admin_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  created_at: string | Date;
}

const ENTITY_NAMES: Record<string, string> = {
  pages: 'page',
  news: 'article',
  'news-categories': 'news category',
  events: 'event',
  programmes: 'programme',
  albums: 'activity',
  team: 'team member',
  'team-groups': 'board',
  partners: 'partner',
  media: 'file',
  enquiry: 'enquiry',
  admin: 'administrator',
  navigation: 'menu',
  settings: 'settings',
};

const RESOURCE_TYPES = new Set(['pages', 'news', 'news-categories', 'events', 'programmes', 'albums', 'team', 'team-groups', 'partners']);
const SETTINGS_LINKS: Record<string, string> = { home: '/admin/homepage/', site: '/admin/settings/', seo: '/admin/seo/' };

/** A readable sentence and an optional dashboard link for one log entry. */
export function describeActivity(row: ActivityRow): { verb: string; noun: string; label: string; href: string | null } {
  const verb = ACTION_LABELS[row.action] ?? row.action.replace(/_/g, ' ');
  const type = row.entity_type ?? '';
  const selfAction = ['login', 'logout', 'login_failed', 'password_reset_requested', 'password_reset', 'password_changed', 'setup'].includes(row.action);
  const noun = selfAction || row.action === 'reorder' || row.action === 'export' ? '' : (ENTITY_NAMES[type] ?? type);
  const label = row.action === 'login_failed' ? (row.entity_label ?? '') : selfAction ? '' : (row.entity_label ?? '');
  let href: string | null = null;
  if (row.action !== 'delete' && row.entity_id) {
    if (RESOURCE_TYPES.has(type)) href = `/admin/${type}/${row.entity_id}/`;
    else if (type === 'media') href = `/admin/media/?id=${encodeURIComponent(row.entity_id)}`;
    else if (type === 'settings') href = SETTINGS_LINKS[row.entity_id] ?? null;
    else if (type === 'navigation') href = '/admin/navigation/';
  }
  return { verb, noun, label, href };
}
