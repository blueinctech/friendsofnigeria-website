/**
 * Imports form entries exported from the old WordPress site (MetForm) into the
 * Enquiries dashboard. Run after the database copy. Safe to run again: entries
 * already imported (same WordPress id) are skipped.
 *
 *   node --env-file=<new .env> --experimental-strip-types scripts/import-wp-entries.ts <entries.json>
 *
 * The JSON file is a list of { wp_id, form, entry, date, fields: [[label, value], ...] },
 * where date is the WordPress local time (Europe/Paris), e.g. "2026-11-20T15:13:11".
 */
import { readFileSync } from 'node:fs';
import { closePool, query } from '../src/lib/server/db.ts';

interface WpEntry {
  wp_id: number;
  form: string;
  entry: string;
  date: string;
  fields: [string, string][];
}

const TYPES: Record<string, string> = {
  'Join Us': 'contact', // the form on the old Contact page
  'FONEN Registration': 'fonen',
  'Footer Subscribe Form': 'newsletter',
  'subscription-form': 'newsletter',
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const pick = (fields: [string, string][], re: RegExp) => fields.find(([label, v]) => re.test(label) && v.trim())?.[1].trim() || null;

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pass the path of the exported entries JSON file.');
  const entries = JSON.parse(readFileSync(file, 'utf8')) as WpEntry[];
  let added = 0;
  let skipped = 0;
  for (const e of entries) {
    const type = TYPES[e.form];
    if (!type) throw new Error(`Unknown form "${e.form}" (entry ${e.wp_id})`);
    const exists = await query(`SELECT 1 FROM enquiries WHERE data->>'wp_id' = $1`, [String(e.wp_id)]);
    if (exists.length) {
      skipped++;
      continue;
    }
    const fields = e.fields.filter(([, v]) => v != null && String(v).trim() !== '');
    const email = fields.map(([, v]) => v.trim()).find(isEmail) ?? '';
    const name =
      pick(fields, /^(full ?)?name$|^nom|^text$/i) ??
      ([pick(fields, /first ?name|pr[ée]nom/i), pick(fields, /last ?name|surname/i)].filter(Boolean).join(' ') || null);
    // Shown as label/value pairs in the dashboard; the message is shown on its own.
    const message = pick(fields, /message|textarea|comment/i);
    const data: Record<string, string | number> = {};
    fields.forEach(([k, v], i) => {
      if (v.trim() === message) return;
      data[k in data ? `${k} (${i + 1})` : k] = v;
    });
    Object.assign(data, { 'Old website form': `${e.form} #${e.entry}`, wp_id: e.wp_id });
    await query(
      `INSERT INTO enquiries (type, name, email, phone, organisation, subject, message, data, status, notes, email_sent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'resolved', $9, true, ($10::timestamp AT TIME ZONE 'Europe/Paris'), ($10::timestamp AT TIME ZONE 'Europe/Paris'))`,
      [
        type,
        name,
        email,
        pick(fields, /phone|t[ée]l|number|mobile/i),
        pick(fields, /organi[sz]ation|company|soci[ée]t[ée]|entreprise/i),
        pick(fields, /subject|objet|topic/i),
        message,
        JSON.stringify(data),
        `Imported from the old WordPress site (${e.form}, entry #${e.entry}).`,
        e.date,
      ],
    );
    added++;
  }
  console.log(`✔ ${added} WordPress entries imported, ${skipped} already there.`);
}

main()
  .catch((err) => {
    console.error(`✖ ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
