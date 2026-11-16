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
  login_failed: 'failed sign-in',
  password_reset_requested: 'requested a password reset',
  password_reset: 'reset their password',
  password_changed: 'changed their password',
  reset_link_created: 'created a password link for',
  status: 'updated the status of',
  export: 'exported',
  setup: 'completed the first-time setup',
};
