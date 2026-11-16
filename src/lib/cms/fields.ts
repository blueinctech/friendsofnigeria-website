/**
 * Field definitions shared by the dashboard (to draw forms) and the server
 * (to validate and store values). Plain data, safe to import anywhere.
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'email'
  | 'url'
  | 'slug'
  | 'number'
  | 'date'
  | 'datetime'
  | 'toggle'
  | 'select'
  | 'icon'
  | 'image'
  | 'gallery'
  | 'list'
  | 'strings'
  | 'reference'
  | 'status'
  | 'blocks';

export interface Option {
  value: string;
  label: string;
}

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  /** Maximum length for text, maximum value for numbers, maximum items for lists. */
  max?: number;
  min?: number;
  rows?: number;
  options?: Option[];
  /** Fields of each item in a 'list'. */
  fields?: Field[];
  itemLabel?: string;
  /** For 'slug': the field the slug is generated from. */
  from?: string;
  /** For 'reference': which resource to pick from. */
  ref?: string;
  /** Where the field appears in the editor. */
  section?: 'main' | 'side' | 'seo';
  width?: 'half' | 'full';
  /** Show the field only when another field has one of these values. */
  showIf?: { field: string; equals: (string | boolean)[] };
  /** Field cannot be changed after creation (or at all for system records). */
  readOnly?: boolean;
  /** For 'gallery': join table holding the ordered media ids. */
  join?: { table: string; fk: string };
  /** Default value for new records and for content blocks. */
  default?: unknown;
  /** Marks essential SEO metadata: clearing it asks for confirmation. */
  seoEssential?: boolean;
}

export interface BlockSection {
  title: string;
  description?: string;
  fields: Field[];
}

export interface BlockSchema {
  key: string;
  label: string;
  description?: string;
  sections: BlockSection[];
}

export const ICONS: Option[] = [
  'globe', 'users', 'user', 'building', 'trending-up', 'graduation', 'landmark', 'calendar', 'clock', 'map-pin',
  'award', 'images', 'mail', 'phone', 'check', 'check-circle', 'send', 'external', 'arrow-right',
].map((v) => ({ value: v, label: v }));

export const STATUS_OPTIONS: Option[] = [
  { value: 'draft', label: 'Draft (hidden)' },
  { value: 'published', label: 'Published' },
];

/** Default values of a block schema, as stored for a new record. */
export function blockDefaults(schema: BlockSchema | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of schema?.sections ?? []) for (const f of s.fields) if (f.default !== undefined) out[f.name] = f.default;
  return out;
}

export const allBlockFields = (schema: BlockSchema | undefined) => (schema?.sections ?? []).flatMap((s) => s.fields);

export function slugify(input: string) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/, '');
}

export function isVisible(field: Field, values: Record<string, unknown>) {
  if (!field.showIf) return true;
  return field.showIf.equals.includes(values[field.showIf.field] as string | boolean);
}
