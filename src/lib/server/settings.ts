/**
 * Settings groups ('site', 'seo', 'home') stored as JSON, merged over the
 * defaults in src/lib/cms/blocks.ts so a missing key never blanks a section.
 */
import { blockDefaults } from '../cms/fields.ts';
import { SETTINGS_SCHEMAS } from '../cms/blocks.ts';
import { one, query } from './db.ts';

export type SettingsKey = 'site' | 'seo' | 'home';

/** Defaults without unresolved "asset:" image references. */
export function defaultsFor(key: string) {
  const d = blockDefaults(SETTINGS_SCHEMAS[key]);
  return JSON.parse(JSON.stringify(d), (_k, v) => (typeof v === 'string' && /^(asset|event):/.test(v) ? null : v));
}

export async function getSettings<T = Record<string, any>>(key: SettingsKey): Promise<T> {
  const row = await one<{ value: Record<string, unknown> }>('SELECT value FROM settings WHERE key = $1', [key]);
  return { ...defaultsFor(key), ...(row?.value ?? {}) } as T;
}

export async function getAllSettings() {
  const rows = await query<{ key: string; value: Record<string, unknown> }>('SELECT key, value FROM settings WHERE key = ANY($1)', [['site', 'seo', 'home']]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    site: { ...defaultsFor('site'), ...(by.site ?? {}) },
    seo: { ...defaultsFor('seo'), ...(by.seo ?? {}) },
    home: { ...defaultsFor('home'), ...(by.home ?? {}) },
  };
}

export async function saveSettings(key: SettingsKey, value: Record<string, unknown>, adminId: string | null) {
  await query(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), adminId],
  );
}
