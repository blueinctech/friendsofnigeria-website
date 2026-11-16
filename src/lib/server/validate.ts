/**
 * Server-side validation of dashboard input against the field definitions.
 * Every value is checked and cleaned here before it reaches the database.
 */
import type { BlockSchema, Field } from '../cms/fields.ts';
import { ICONS, isVisible, slugify } from '../cms/fields.ts';
import { cleanRichText, cleanText, cleanUrl, htmlToText } from './sanitize.ts';

export type Errors = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isEmailAddress = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * Validates one value. Returns [cleanValue, error]. `inJson` is true for values
 * stored inside JSON (lists and blocks) where empty strings are kept as ''.
 */
export function validateValue(field: Field, raw: unknown, values: Record<string, unknown>, inJson = false): [unknown, string | null] {
  const visible = isVisible(field, values);
  const required = field.required && visible;
  const nothing = inJson ? '' : null;

  switch (field.type) {
    case 'text':
    case 'textarea': {
      const v = cleanText(raw, field.type === 'textarea');
      const max = field.max ?? (field.type === 'text' ? 300 : 2000);
      if (!v) return [nothing, required ? 'This field is required.' : null];
      if (v.length > max) return [v, `Keep this under ${max} characters (currently ${v.length}).`];
      return [v, null];
    }
    case 'richtext': {
      let v: string;
      try {
        v = cleanRichText(raw);
      } catch (err) {
        return ['', (err as Error).message];
      }
      if (!htmlToText(v) && !/<img/i.test(v)) return [inJson ? '' : '', required ? 'This field is required.' : null];
      return [v, null];
    }
    case 'email': {
      const v = cleanText(raw).toLowerCase();
      if (!v) return [nothing, required ? 'This field is required.' : null];
      return isEmailAddress(v) ? [v, null] : [v, 'Enter a valid email address.'];
    }
    case 'url': {
      const v = cleanUrl(raw);
      if (v === null) return [String(raw), 'Enter a full address starting with https://, or a page on this site starting with /.'];
      if (!v) return [nothing, required ? 'This field is required.' : null];
      if (v.length > 1000) return [v, 'This address is too long.'];
      return [v, null];
    }
    case 'slug': {
      let v = cleanText(raw).toLowerCase();
      if (!v && field.from) v = slugify(String(values[field.from] ?? ''));
      if (!v) return [nothing, required ? 'This field is required.' : null];
      if (!SLUG.test(v)) return [v, 'Use lowercase letters, numbers and single hyphens only.'];
      if (v.length > (field.max ?? 120)) return [v, `Keep this under ${field.max ?? 120} characters.`];
      return [v, null];
    }
    case 'number': {
      if (empty(raw)) return [null, required ? 'This field is required.' : null];
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return [raw, 'Enter a whole number.'];
      if (field.min !== undefined && n < field.min) return [n, `The minimum is ${field.min}.`];
      if (field.max !== undefined && n > field.max) return [n, `The maximum is ${field.max}.`];
      return [n, null];
    }
    case 'date': {
      if (empty(raw)) return [null, required ? 'This field is required.' : null];
      const v = String(raw).slice(0, 10);
      // Round-trip check so impossible dates such as 30 February are refused.
      if (!DATE.test(v) || Number.isNaN(Date.parse(v)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return [v, 'Enter a valid date.'];
      return [v, null];
    }
    case 'datetime': {
      if (empty(raw)) return [null, required ? 'This field is required.' : null];
      const d = new Date(String(raw));
      if (Number.isNaN(d.valueOf())) return [raw, 'Enter a valid date and time.'];
      return [d.toISOString(), null];
    }
    case 'toggle':
      return [raw === true || raw === 'true' || raw === 'on' || raw === 1, null];
    case 'select':
    case 'status':
    case 'icon': {
      const options = field.type === 'icon' ? ICONS : field.options ?? [];
      if (empty(raw)) {
        if (field.default !== undefined) return [field.default, null];
        return [nothing, required ? 'Choose an option.' : null];
      }
      const v = String(raw);
      if (field.type !== 'select' || options.length) {
        if (!options.some((o) => o.value === v)) return [v, 'Choose one of the options.'];
      }
      return [v, null];
    }
    case 'image':
    case 'reference': {
      if (empty(raw)) return [nothing, required ? (field.type === 'image' ? 'Choose an image.' : 'Choose an option.') : null];
      return isUuid(raw) ? [raw, null] : [raw, 'Choose an item from the list.'];
    }
    case 'gallery': {
      const arr = Array.isArray(raw) ? raw : [];
      if (arr.length > 400) return [arr, 'A gallery can hold up to 400 photos.'];
      if (!arr.every(isUuid)) return [arr, 'One of the photos is not valid.'];
      if (required && !arr.length) return [arr, 'Add at least one photo.'];
      return [[...new Set(arr)], null];
    }
    case 'strings': {
      const arr = (Array.isArray(raw) ? raw : []).map((s) => cleanText(s)).filter(Boolean);
      if (required && !arr.length) return [arr, 'Add at least one item.'];
      if (field.max && arr.length > field.max) return [arr, `Add up to ${field.max} items.`];
      if (arr.some((s) => s.length > 300)) return [arr, 'Keep each item under 300 characters.'];
      return [arr, null];
    }
    case 'list': {
      const arr = Array.isArray(raw) ? raw : [];
      if (required && !arr.length) return [[], 'Add at least one item.'];
      if (field.max && arr.length > field.max) return [arr, `Add up to ${field.max} items.`];
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i] && typeof arr[i] === 'object' ? (arr[i] as Record<string, unknown>) : {};
        const clean: Record<string, unknown> = {};
        for (const sub of field.fields ?? []) {
          const [v, err] = validateValue(sub, item[sub.name], item, true);
          if (err) return [arr, `${field.itemLabel ?? 'Item'} ${i + 1}, ${sub.label}: ${err}`];
          clean[sub.name] = v;
        }
        out.push(clean);
      }
      return [out, null];
    }
    case 'blocks':
      return [raw, null];
  }
  return [null, null];
}

/** Validates a set of fields. Unknown keys are ignored. */
export function validateFields(fields: Field[], input: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const errors: Errors = {};
  const context = { ...input };
  for (const f of fields) {
    const [v, err] = validateValue(f, input[f.name], context);
    values[f.name] = v;
    if (err) errors[f.name] = err;
  }
  return { values, errors };
}

/** Validates the content of a block schema (homepage, settings, page sections). */
export function validateBlocks(schema: BlockSchema | undefined, input: unknown) {
  const data = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const values: Record<string, unknown> = {};
  const errors: Errors = {};
  for (const section of schema?.sections ?? []) {
    for (const f of section.fields) {
      const [v, err] = validateValue(f, data[f.name], data, true);
      values[f.name] = v;
      if (err) errors[f.name] = err;
    }
  }
  return { values, errors };
}

/** Essential SEO fields that would be emptied by this change. */
export function clearedSeoFields(fields: Field[], before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return [];
  return fields.filter((f) => f.seoEssential && !empty(before[f.name]) && empty(after[f.name])).map((f) => f.label);
}
