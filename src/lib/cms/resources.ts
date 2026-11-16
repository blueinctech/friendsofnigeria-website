/**
 * Content types managed in the dashboard. Each resource maps to one database
 * table; the generic list, editor and API are driven by these definitions.
 */
import type { Field, Option } from './fields.ts';
import { STATUS_OPTIONS } from './fields.ts';
import type { Module } from './permissions.ts';

export interface ListColumn {
  name: string;
  label: string;
  kind?: 'text' | 'status' | 'date' | 'datetime' | 'image' | 'ref' | 'badge' | 'count';
}

export interface Resource {
  key: string;
  table: string;
  module: Module;
  label: string;
  singular: string;
  description?: string;
  labelField: string;
  fields: Field[];
  columns: ListColumn[];
  searchFields: string[];
  filters?: { name: string; label: string; options: Option[] }[];
  defaultSort: string;
  /** Drag-and-drop ordering through a sort_order column. */
  sortable?: boolean;
  /** Has status draft/published. */
  publishable?: boolean;
  /** Has SEO fields. */
  seo?: boolean;
  /** Public address of a record, for "View on website". */
  publicPath?: (row: Record<string, any>) => string | null;
  /** Related resources shown as tabs above the list. */
  tabs?: { key: string; label: string }[];
}

const seoFields: Field[] = [
  { name: 'seo_title', label: 'SEO title', type: 'text', max: 70, section: 'seo', seoEssential: true, help: 'Shown in search results and browser tabs. Leave empty to use the title. Keep under 60 characters.' },
  { name: 'seo_description', label: 'Meta description', type: 'textarea', max: 300, rows: 3, section: 'seo', seoEssential: true, help: 'Shown under the title in search results and when shared. Aim for 120–160 characters.' },
  { name: 'og_image', label: 'Social sharing image', type: 'image', section: 'seo', help: 'Leave empty to use the main image. Best at 1200 × 630.' },
  { name: 'canonical_url', label: 'Canonical URL', type: 'url', section: 'seo', help: 'Only if this content first appeared at another address.' },
];

const status = (labels?: [string, string]): Field => ({
  name: 'status',
  label: 'Status',
  type: 'status',
  section: 'side',
  default: 'draft',
  options: labels ? [{ value: 'draft', label: labels[0] }, { value: 'published', label: labels[1] }] : STATUS_OPTIONS,
});

export const ALBUM_TYPES = ['Flagship event', 'Business & investment', 'Bilateral engagement', 'Diaspora engagement', 'Delegation'];
export const PROGRAMME_TYPES: Option[] = [
  { value: 'area', label: 'Area of work (What we do)' },
  { value: 'membership', label: 'Membership programme' },
  { value: 'programme', label: 'Other programme' },
];

export const RESOURCES: Record<string, Resource> = {
  pages: {
    key: 'pages',
    table: 'pages',
    module: 'pages',
    label: 'Pages',
    singular: 'page',
    description: 'Built-in pages of the website and any extra pages you create.',
    labelField: 'title',
    seo: true,
    publishable: true,
    fields: [
      { name: 'title', label: 'Page heading', type: 'text', required: true, max: 140 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'title', required: true, max: 90, help: 'The page will be at /address/. Lowercase letters, numbers and hyphens.', showIf: { field: 'kind', equals: ['custom'] } },
      { name: 'lead', label: 'Introduction', type: 'textarea', max: 800, rows: 3, help: 'Shown under the heading.' },
      { name: 'hero_image', label: 'Page image', type: 'image', width: 'half' },
      { name: 'hero_image_alt', label: 'Page image alt text', type: 'text', max: 200, width: 'half' },
      { name: 'body', label: 'Page content', type: 'richtext', showIf: { field: 'kind', equals: ['custom'] } },
      { name: 'content', label: 'Page sections', type: 'blocks', showIf: { field: 'kind', equals: ['system'] } },
      status(),
      { name: 'noindex', label: 'Hide from search engines', type: 'toggle', section: 'seo' },
      ...seoFields,
    ],
    columns: [
      { name: 'title', label: 'Page' },
      { name: 'path', label: 'Address' },
      { name: 'kind', label: 'Type', kind: 'badge' },
      { name: 'status', label: 'Status', kind: 'status' },
      { name: 'updated_at', label: 'Updated', kind: 'datetime' },
    ],
    searchFields: ['title', 'path', 'lead'],
    filters: [
      { name: 'kind', label: 'Type', options: [{ value: 'system', label: 'Built-in' }, { value: 'custom', label: 'Custom' }] },
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
    ],
    defaultSort: 'sort_order',
    publicPath: (r) => r.path,
  },

  news: {
    key: 'news',
    table: 'news',
    module: 'news',
    label: 'News & Publications',
    singular: 'article',
    labelField: 'title',
    seo: true,
    publishable: true,
    tabs: [
      { key: 'news', label: 'Articles' },
      { key: 'news-categories', label: 'Categories' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'title', required: true, max: 120, help: 'The article will be at /news/address/.' },
      { name: 'excerpt', label: 'Summary', type: 'textarea', required: true, max: 400, rows: 3, help: 'Shown on news cards and under the title. One or two sentences.' },
      { name: 'body', label: 'Article', type: 'richtext', required: true },
      { name: 'image', label: 'Featured image', type: 'image' },
      { name: 'image_alt', label: 'Featured image alt text', type: 'text', max: 200, help: 'Describe the photo for people using screen readers.' },
      status(),
      { name: 'published_at', label: 'Publication date', type: 'datetime', section: 'side', help: 'Set a future date to schedule a published article.' },
      { name: 'category_id', label: 'Category', type: 'reference', ref: 'news-categories', section: 'side' },
      { name: 'featured', label: 'Featured article', type: 'toggle', section: 'side' },
      ...seoFields,
    ],
    columns: [
      { name: 'title', label: 'Title' },
      { name: 'category_id', label: 'Category', kind: 'ref' },
      { name: 'status', label: 'Status', kind: 'status' },
      { name: 'published_at', label: 'Published', kind: 'date' },
      { name: 'updated_at', label: 'Updated', kind: 'datetime' },
    ],
    searchFields: ['title', 'excerpt'],
    filters: [
      {
        name: 'status',
        label: 'Status',
        options: [
          { value: 'draft', label: 'Draft' },
          { value: 'published', label: 'Published' },
          { value: 'scheduled', label: 'Scheduled' },
        ],
      },
    ],
    defaultSort: '-published_at',
    publicPath: (r) => `/news/${r.slug}/`,
  },

  'news-categories': {
    key: 'news-categories',
    table: 'news_categories',
    module: 'news',
    label: 'News categories',
    singular: 'category',
    labelField: 'name',
    sortable: true,
    tabs: [
      { key: 'news', label: 'Articles' },
      { key: 'news-categories', label: 'Categories' },
    ],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, max: 60 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'name', required: true, max: 60 },
    ],
    columns: [
      { name: 'name', label: 'Name' },
      { name: 'article_count', label: 'Articles', kind: 'count' },
    ],
    searchFields: ['name'],
    defaultSort: 'sort_order',
  },

  events: {
    key: 'events',
    table: 'events',
    module: 'events',
    label: 'Events',
    singular: 'event',
    labelField: 'title',
    seo: true,
    publishable: true,
    sortable: true,
    fields: [
      { name: 'title', label: 'Event name', type: 'text', required: true, max: 200 },
      { name: 'short_title', label: 'Short name', type: 'text', max: 60, width: 'half', help: 'Used in buttons and breadcrumbs, e.g. "NIDA".' },
      { name: 'slug', label: 'Address', type: 'slug', from: 'title', required: true, max: 120, width: 'half', help: 'The event will be at /events/address/.' },
      { name: 'tagline', label: 'Tagline', type: 'text', max: 160 },
      { name: 'summary', label: 'Summary', type: 'textarea', required: true, max: 600, rows: 3, help: 'Shown on event lists and in search results.' },
      { name: 'body', label: 'Description', type: 'richtext' },
      { name: 'image', label: 'Event banner', type: 'image', width: 'half' },
      { name: 'image_alt', label: 'Banner alt text', type: 'text', max: 200, width: 'half' },
      { name: 'start_date', label: 'Start date', type: 'date', width: 'half' },
      { name: 'end_date', label: 'End date', type: 'date', width: 'half', help: 'Leave empty for one-day events.' },
      { name: 'edition_name', label: 'Edition name', type: 'text', max: 120, help: 'e.g. "Spotlight Nigeria 2026 (9th edition)".' },
      { name: 'venue', label: 'Venue', type: 'text', max: 120, width: 'half' },
      { name: 'city', label: 'City', type: 'text', max: 80, width: 'half' },
      { name: 'address', label: 'Address', type: 'text', max: 200 },
      { name: 'registration_url', label: 'Registration link', type: 'url', width: 'half' },
      { name: 'website_url', label: 'Official website', type: 'url', width: 'half' },
      { name: 'highlights', label: 'Who it brings together', type: 'strings', max: 10 },
      {
        name: 'stats',
        label: 'Key figures',
        type: 'list',
        itemLabel: 'Figure',
        max: 6,
        fields: [
          { name: 'value', label: 'Number', type: 'number', required: true, min: 0, max: 1_000_000, width: 'half' },
          { name: 'suffix', label: 'After the number', type: 'text', max: 4, width: 'half', placeholder: '+' },
          { name: 'label', label: 'Label', type: 'text', required: true, max: 160 },
        ],
      },
      { name: 'stats_source', label: 'Source of the figures', type: 'text', max: 120 },
      { name: 'gallery', label: 'Photo gallery', type: 'gallery', join: { table: 'event_gallery', fk: 'event_id' } },
      status(),
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        section: 'side',
        default: 'event',
        options: [
          { value: 'flagship', label: 'Flagship event (recurring)' },
          { value: 'event', label: 'Event' },
        ],
      },
      {
        name: 'timing',
        label: 'Upcoming or past',
        type: 'select',
        section: 'side',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Decide from the dates' },
          { value: 'upcoming', label: 'Always show as upcoming' },
          { value: 'past', label: 'Always show as past' },
        ],
      },
      { name: 'since', label: 'Held since (year)', type: 'text', max: 10, section: 'side' },
      ...seoFields,
    ],
    columns: [
      { name: 'title', label: 'Event' },
      { name: 'kind', label: 'Type', kind: 'badge' },
      { name: 'start_date', label: 'Date', kind: 'date' },
      { name: 'timing_state', label: 'When', kind: 'badge' },
      { name: 'status', label: 'Status', kind: 'status' },
    ],
    searchFields: ['title', 'summary', 'city', 'venue'],
    filters: [
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
      {
        name: 'timing_state',
        label: 'When',
        options: [
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ],
      },
    ],
    defaultSort: 'sort_order',
    publicPath: (r) => `/events/${r.slug}/`,
  },

  programmes: {
    key: 'programmes',
    table: 'programmes',
    module: 'programmes',
    label: 'Activities & Programmes',
    singular: 'programme',
    description: 'Areas of work, membership programmes (FONEN, FONPRO) and other programmes.',
    labelField: 'title',
    seo: true,
    publishable: true,
    sortable: true,
    tabs: [
      { key: 'programmes', label: 'Programmes & areas of work' },
      { key: 'albums', label: 'Activities & photo albums' },
    ],
    fields: [
      { name: 'type', label: 'Type', type: 'select', required: true, default: 'area', options: PROGRAMME_TYPES, section: 'side' },
      { name: 'title', label: 'Name', type: 'text', required: true, max: 120 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'title', required: true, max: 90, help: 'Areas are at /what-we-do/address/, membership at /membership/address/, others at /programmes/address/.' },
      { name: 'full_name', label: 'Full name', type: 'text', max: 120, width: 'half', showIf: { field: 'type', equals: ['membership'] } },
      { name: 'audience', label: 'Audience label', type: 'text', max: 60, width: 'half', showIf: { field: 'type', equals: ['membership'] }, help: 'e.g. "Corporate membership".' },
      { name: 'headline', label: 'Headline', type: 'text', max: 200 },
      { name: 'summary', label: 'Summary', type: 'textarea', required: true, max: 600, rows: 3 },
      { name: 'details', label: 'Details', type: 'textarea', max: 600, rows: 3, showIf: { field: 'type', equals: ['membership'] } },
      { name: 'body', label: 'Description', type: 'richtext', showIf: { field: 'type', equals: ['area', 'programme'] } },
      { name: 'image', label: 'Image', type: 'image', width: 'half' },
      { name: 'image_alt', label: 'Image alt text', type: 'text', max: 200, width: 'half' },
      { name: 'benefits', label: 'Benefits', type: 'strings', max: 12, showIf: { field: 'type', equals: ['membership', 'programme'] } },
      {
        name: 'categories',
        label: 'Membership categories and fees',
        type: 'list',
        itemLabel: 'Category',
        max: 8,
        showIf: { field: 'type', equals: ['membership'] },
        fields: [
          { name: 'name', label: 'Category', type: 'text', required: true, max: 60, width: 'half' },
          { name: 'fee', label: 'Fee', type: 'text', required: true, max: 40, width: 'half' },
        ],
      },
      { name: 'fees_note', label: 'Note under the fees', type: 'textarea', max: 400, rows: 2, showIf: { field: 'type', equals: ['membership'] } },
      { name: 'link_label', label: 'Link label', type: 'text', max: 60, width: 'half' },
      { name: 'link_url', label: 'Link', type: 'url', width: 'half' },
      { name: 'icon', label: 'Icon', type: 'icon', section: 'side', default: 'globe' },
      status(),
      ...seoFields,
    ],
    columns: [
      { name: 'title', label: 'Name' },
      { name: 'type', label: 'Type', kind: 'badge' },
      { name: 'status', label: 'Status', kind: 'status' },
      { name: 'updated_at', label: 'Updated', kind: 'datetime' },
    ],
    searchFields: ['title', 'summary', 'headline'],
    filters: [
      { name: 'type', label: 'Type', options: PROGRAMME_TYPES },
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
    ],
    defaultSort: 'sort_order',
    publicPath: (r) => (r.type === 'area' ? `/what-we-do/${r.slug}/` : r.type === 'membership' ? `/membership/${r.slug}/` : `/programmes/${r.slug}/`),
  },

  albums: {
    key: 'albums',
    table: 'albums',
    module: 'programmes',
    label: 'Activities & photo albums',
    singular: 'activity',
    description: 'Engagements, missions and visits shown on Our Activities and in the photo gallery.',
    labelField: 'title',
    publishable: true,
    tabs: [
      { key: 'programmes', label: 'Programmes & areas of work' },
      { key: 'albums', label: 'Activities & photo albums' },
    ],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, max: 200 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'title', required: true, max: 120, help: 'The album will be at /gallery/address/.' },
      { name: 'summary', label: 'Short description', type: 'textarea', max: 600, rows: 3 },
      { name: 'cover', label: 'Cover photo', type: 'image', required: true },
      { name: 'photos', label: 'Photos', type: 'gallery', join: { table: 'album_photos', fk: 'album_id' } },
      status(['Draft (hidden)', 'Published']),
      { name: 'date', label: 'Date', type: 'date', required: true, section: 'side' },
      { name: 'year_only', label: 'Show the year only', type: 'toggle', section: 'side' },
      { name: 'type', label: 'Type of activity', type: 'select', required: true, section: 'side', default: 'Diaspora engagement', options: ALBUM_TYPES.map((t) => ({ value: t, label: t })) },
      { name: 'photo_count', label: 'Total photos taken', type: 'number', section: 'side', min: 0, max: 100000, help: 'Optional. Shows "a selection of N" when only some photos are here.' },
    ],
    columns: [
      { name: 'cover', label: '', kind: 'image' },
      { name: 'title', label: 'Activity' },
      { name: 'type', label: 'Type', kind: 'badge' },
      { name: 'date', label: 'Date', kind: 'date' },
      { name: 'photo_total', label: 'Photos', kind: 'count' },
      { name: 'status', label: 'Status', kind: 'status' },
    ],
    searchFields: ['title', 'type'],
    filters: [
      { name: 'type', label: 'Type', options: ALBUM_TYPES.map((t) => ({ value: t, label: t })) },
      { name: 'status', label: 'Status', options: STATUS_OPTIONS },
    ],
    defaultSort: '-date',
    publicPath: (r) => `/gallery/${r.slug}/`,
  },

  team: {
    key: 'team',
    table: 'team_members',
    module: 'team',
    label: 'Management Team',
    singular: 'team member',
    labelField: 'name',
    publishable: true,
    sortable: true,
    tabs: [
      { key: 'team', label: 'Team members' },
      { key: 'team-groups', label: 'Boards & chapters' },
    ],
    fields: [
      { name: 'name', label: 'Full name', type: 'text', required: true, max: 120 },
      { name: 'role', label: 'Position', type: 'text', required: true, max: 160 },
      { name: 'slug', label: 'Address', type: 'slug', from: 'name', required: true, max: 120, help: 'The profile page will be at /team/address/ when a biography is added.' },
      { name: 'photo', label: 'Profile photo', type: 'image', required: true, help: 'A portrait photo, ideally at least 600 pixels wide.' },
      { name: 'summary', label: 'Short introduction', type: 'textarea', max: 400, rows: 3, help: 'Shown on the homepage card.' },
      { name: 'bio', label: 'Biography', type: 'richtext', help: 'Members with a biography get their own profile page.' },
      { name: 'linkedin', label: 'LinkedIn profile', type: 'url', width: 'half' },
      { name: 'website', label: 'Website', type: 'url', width: 'half' },
      status(['Hidden', 'Visible on website']),
      { name: 'group_id', label: 'Board or chapter', type: 'reference', ref: 'team-groups', required: true, section: 'side' },
      { name: 'show_on_home', label: 'Show on homepage', type: 'toggle', section: 'side' },
    ],
    columns: [
      { name: 'photo', label: '', kind: 'image' },
      { name: 'name', label: 'Name' },
      { name: 'role', label: 'Position' },
      { name: 'group_id', label: 'Board', kind: 'ref' },
      { name: 'status', label: 'Status', kind: 'status' },
    ],
    searchFields: ['name', 'role'],
    filters: [{ name: 'group_id', label: 'Board', options: [] }],
    defaultSort: 'group,sort_order',
    publicPath: (r) => (r.bio ? `/team/${r.slug}/` : '/team/'),
  },

  'team-groups': {
    key: 'team-groups',
    table: 'team_groups',
    module: 'team',
    label: 'Boards & chapters',
    singular: 'board',
    labelField: 'title',
    sortable: true,
    tabs: [
      { key: 'team', label: 'Team members' },
      { key: 'team-groups', label: 'Boards & chapters' },
    ],
    fields: [
      { name: 'title', label: 'Name', type: 'text', required: true, max: 120 },
      { name: 'slug', label: 'Anchor', type: 'slug', from: 'title', required: true, max: 60, help: 'Used for links such as /team/#anchor.' },
      { name: 'nav_label', label: 'Short label', type: 'text', max: 40, help: 'Used in the jump links at the top of the team page.' },
      { name: 'description', label: 'Description', type: 'textarea', max: 500, rows: 3 },
    ],
    columns: [
      { name: 'title', label: 'Board or chapter' },
      { name: 'member_count', label: 'Members', kind: 'count' },
    ],
    searchFields: ['title'],
    defaultSort: 'sort_order',
  },

  partners: {
    key: 'partners',
    table: 'partners',
    module: 'partners',
    label: 'Partners & Sponsors',
    singular: 'partner',
    labelField: 'name',
    publishable: true,
    sortable: true,
    fields: [
      { name: 'name', label: 'Organisation name', type: 'text', required: true, max: 160 },
      { name: 'logo', label: 'Logo', type: 'image', required: true, help: 'PNG or SVG with a transparent background works best. Proportions are kept as uploaded.' },
      { name: 'url', label: 'Website', type: 'url' },
      status(['Hidden', 'Visible on website']),
    ],
    columns: [
      { name: 'logo', label: '', kind: 'image' },
      { name: 'name', label: 'Organisation' },
      { name: 'url', label: 'Website' },
      { name: 'status', label: 'Status', kind: 'status' },
    ],
    searchFields: ['name', 'url'],
    filters: [{ name: 'status', label: 'Status', options: STATUS_OPTIONS }],
    defaultSort: 'sort_order',
    publicPath: () => '/partners/',
  },
};

export const resourceFor = (key: string): Resource | undefined => (Object.hasOwn(RESOURCES, key) ? RESOURCES[key] : undefined);
