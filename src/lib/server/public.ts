/**
 * Read-only data layer for the public website. Every page reads its content
 * from the same database the dashboard writes to, so a change saved in the
 * dashboard appears on the site on the next request (after the short CDN
 * cache in the middleware expires).
 *
 * Drafts and scheduled items are hidden unless the request is a preview made
 * by a signed-in administrator (?preview=1).
 */
import { blockDefaults } from '../cms/fields.ts';
import { PAGE_SCHEMAS } from '../cms/blocks.ts';
import { query, one } from './db.ts';
import { publicMedia, type PublicMedia } from './media.ts';
import { getAllSettings } from './settings.ts';

export type Media = PublicMedia;
export type MediaMap = Record<string, Media>;

/** SQL condition for "visible on the website". */
export const live = (preview: boolean, alias = '') => {
  const t = alias ? `${alias}.` : '';
  return preview ? 'true' : `${t}status = 'published' AND (${t}published_at IS NULL OR ${t}published_at <= now())`;
};

// ------------------------------------------------------------------ media

export async function mediaMap(ids: (string | null | undefined)[]): Promise<MediaMap> {
  const unique = [...new Set(ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)))];
  if (!unique.length) return {};
  const rows = await query('SELECT * FROM media WHERE id = ANY($1::uuid[])', [unique]);
  return Object.fromEntries(rows.map((r) => [r.id, publicMedia(r)!]));
}

/** Collects every media id referenced in a value (settings, blocks, rows). */
export function mediaIdsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) out.push(value);
  } else if (Array.isArray(value)) value.forEach((v) => mediaIdsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => mediaIdsIn(v, out));
  return out;
}

interface ImgOptions {
  alt?: string;
  sizes?: string;
  loading?: 'lazy' | 'eager';
  fetchpriority?: 'high' | 'low' | 'auto';
  class?: string;
  style?: string;
  /** Largest width worth sending, to keep small slots light. */
  maxWidth?: number;
}

/**
 * Attributes for a responsive <img> from a media record. Spread them on a
 * plain <img> in the page template so the page's scoped styles still apply.
 */
export function img(m: Media | null | undefined, o: ImgOptions = {}): Record<string, string | number | undefined> | null {
  if (!m) return null;
  const variants = (m.variants ?? []).filter((v) => !o.maxWidth || v.w <= o.maxWidth * 2);
  const largest = variants.length ? variants[variants.length - 1] : null;
  const src = (o.maxWidth ? variants.find((v) => v.w >= o.maxWidth!) : null) ?? largest;
  return {
    src: src?.url ?? m.url,
    srcset: variants.length > 1 ? variants.map((v) => `${v.url} ${v.w}w`).join(', ') : undefined,
    sizes: variants.length > 1 ? (o.sizes ?? '100vw') : undefined,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    alt: o.alt ?? m.alt ?? '',
    loading: o.loading ?? 'lazy',
    decoding: 'async',
    fetchpriority: o.fetchpriority,
    class: o.class,
    style: o.style,
  };
}

/** The image to use when a link is shared: 1200 × 630 JPEG. */
export const ogImageUrl = (m: Media | null | undefined) => (m ? (m.og_url ?? m.url) : null);

// ------------------------------------------------------------------ dates

/** 'YYYY-MM-DD' or a timestamp → Date (date-only values are read as UTC). */
export const toDate = (v: string | Date | null | undefined) => (v == null ? null : v instanceof Date ? v : new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v));

// ------------------------------------------------------------------ site-wide

export interface NavLink {
  id: string;
  label: string;
  url: string;
  description: string | null;
  icon: string | null;
  new_tab: boolean;
  children: NavLink[];
}

export interface SiteData {
  site: Record<string, any>;
  seo: Record<string, any>;
  home: Record<string, any>;
  nav: { header: NavLink[]; membership: NavLink[]; footer: NavLink[] };
  media: MediaMap;
}

const siteCache = new WeakMap<object, Promise<SiteData>>();

/** Settings and menus, loaded once per request. */
export function getSite(locals: App.Locals): Promise<SiteData> {
  let p = siteCache.get(locals);
  if (!p) {
    p = loadSite();
    siteCache.set(locals, p);
  }
  return p;
}

async function loadSite(): Promise<SiteData> {
  const [settings, navRows] = await Promise.all([
    getAllSettings(),
    query<NavLink & { menu: string; parent_id: string | null }>(
      `SELECT id, menu, parent_id, label, url, description, icon, new_tab FROM nav_items WHERE visible ORDER BY sort_order, label`,
    ),
  ]);
  const byParent = new Map<string | null, typeof navRows>();
  for (const r of navRows) {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  }
  const build = (parent: string | null, menu: string): NavLink[] =>
    (byParent.get(parent) ?? [])
      .filter((r) => r.menu === menu)
      .map((r) => ({ id: r.id, label: r.label, url: r.url, description: r.description, icon: r.icon, new_tab: r.new_tab, children: build(r.id, menu) }));
  const media = await mediaMap(mediaIdsIn([settings.site, settings.seo]));
  return {
    site: settings.site,
    seo: settings.seo,
    home: settings.home,
    nav: { header: build(null, 'header'), membership: build(null, 'membership'), footer: build(null, 'footer') },
    media,
  };
}

// ------------------------------------------------------------------ pages

export interface PageData {
  id: string;
  key: string | null;
  kind: 'system' | 'custom';
  path: string;
  title: string;
  lead: string | null;
  body: string | null;
  hero: Media | null;
  hero_alt: string;
  content: Record<string, any>;
  seo_title: string | null;
  seo_description: string | null;
  og: Media | null;
  canonical_url: string | null;
  noindex: boolean;
  status: string;
  media: MediaMap;
  updated_at: string;
}

async function pageFrom(row: Record<string, any> | null): Promise<PageData | null> {
  if (!row) return null;
  const content = row.kind === 'system' ? { ...blockDefaults(PAGE_SCHEMAS[row.key]), ...(row.content ?? {}) } : (row.content ?? {});
  const media = await mediaMap([row.hero_image, row.og_image, ...mediaIdsIn(content)]);
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    path: row.path,
    title: row.title,
    lead: row.lead,
    body: row.body,
    hero: media[row.hero_image] ?? null,
    hero_alt: row.hero_image_alt || media[row.hero_image]?.alt || '',
    content: JSON.parse(JSON.stringify(content), (_k, v) => (typeof v === 'string' && /^(asset|event):/.test(v) ? null : v)),
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    og: media[row.og_image] ?? null,
    canonical_url: row.canonical_url,
    noindex: row.noindex,
    status: row.status,
    media,
    updated_at: row.updated_at,
  };
}

/** A built-in page by key; null when it is unpublished (and not previewed). */
export async function getPage(key: string, preview: boolean) {
  return pageFrom(await one(`SELECT * FROM pages WHERE key = $1 AND ${live(preview)}`, [key]));
}

export async function getPageByPath(path: string, preview: boolean) {
  return pageFrom(await one(`SELECT * FROM pages WHERE kind = 'custom' AND path = $1 AND ${live(preview)}`, [path]));
}

// ------------------------------------------------------------------ news

export interface NewsItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string | null;
  category_slug: string | null;
  image: Media | null;
  image_alt: string;
  featured: boolean;
  status: string;
  date: Date;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  og: Media | null;
  canonical_url: string | null;
}

async function newsFrom(rows: Record<string, any>[]): Promise<NewsItem[]> {
  const media = await mediaMap(rows.flatMap((r) => [r.image, r.og_image]));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    body: r.body ?? '',
    category: r.category,
    category_slug: r.category_slug,
    image: media[r.image] ?? null,
    image_alt: r.image_alt || media[r.image]?.alt || '',
    featured: r.featured,
    status: r.status,
    date: toDate(r.published_at ?? r.created_at)!,
    updated_at: r.updated_at,
    seo_title: r.seo_title,
    seo_description: r.seo_description,
    og: media[r.og_image] ?? null,
    canonical_url: r.canonical_url,
  }));
}

const NEWS_SELECT = `SELECT n.*, c.name AS category, c.slug AS category_slug FROM news n LEFT JOIN news_categories c ON c.id = n.category_id`;

export async function listNews(preview: boolean, limit = 500) {
  return newsFrom(await query(`${NEWS_SELECT} WHERE ${live(preview, 'n')} ORDER BY coalesce(n.published_at, n.created_at) DESC LIMIT $1`, [limit]));
}

export async function getNews(slug: string, preview: boolean) {
  return (await newsFrom(await query(`${NEWS_SELECT} WHERE n.slug = $1 AND ${live(preview, 'n')}`, [slug])))[0] ?? null;
}

// ------------------------------------------------------------------ events

export interface EventItem {
  id: string;
  slug: string;
  kind: string;
  title: string;
  short_title: string | null;
  tagline: string | null;
  summary: string;
  body: string;
  image: Media | null;
  image_alt: string;
  since: string | null;
  edition_name: string | null;
  start: Date | null;
  end: Date | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  registration_url: string | null;
  website_url: string | null;
  upcoming: boolean;
  highlights: string[];
  stats: { value: number; suffix?: string; label: string }[];
  stats_source: string | null;
  gallery: Media[];
  seo_title: string | null;
  seo_description: string | null;
  og: Media | null;
  canonical_url: string | null;
  status: string;
}

async function eventsFrom(rows: Record<string, any>[], withGallery = false): Promise<EventItem[]> {
  const gallery = withGallery && rows.length
    ? await query<{ event_id: string; media_id: string }>('SELECT event_id, media_id FROM event_gallery WHERE event_id = ANY($1::uuid[]) ORDER BY sort_order', [rows.map((r) => r.id)])
    : [];
  const media = await mediaMap([...rows.flatMap((r) => [r.image, r.og_image]), ...gallery.map((g) => g.media_id)]);
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    short_title: r.short_title,
    tagline: r.tagline,
    summary: r.summary,
    body: r.body ?? '',
    image: media[r.image] ?? null,
    image_alt: r.image_alt || media[r.image]?.alt || '',
    since: r.since,
    edition_name: r.edition_name,
    start: toDate(r.start_date),
    end: toDate(r.end_date),
    venue: r.venue,
    address: r.address,
    city: r.city,
    registration_url: r.registration_url,
    website_url: r.website_url,
    upcoming: r.timing === 'upcoming' || (r.timing === 'auto' && Boolean(r.end_date ?? r.start_date) && (r.end_date ?? r.start_date) >= today),
    highlights: r.highlights ?? [],
    stats: r.stats ?? [],
    stats_source: r.stats_source,
    gallery: gallery.filter((g) => g.event_id === r.id).map((g) => media[g.media_id]).filter(Boolean),
    seo_title: r.seo_title,
    seo_description: r.seo_description,
    og: media[r.og_image] ?? null,
    canonical_url: r.canonical_url,
    status: r.status,
  }));
}

export async function listEvents(preview: boolean) {
  return eventsFrom(await query(`SELECT * FROM events WHERE ${live(preview)} ORDER BY sort_order, start_date DESC NULLS LAST, title`));
}

export async function getEvent(slug: string, preview: boolean) {
  return (await eventsFrom(await query(`SELECT * FROM events WHERE slug = $1 AND ${live(preview)}`, [slug]), true))[0] ?? null;
}

export async function eventsByIds(ids: string[], preview: boolean) {
  if (!ids.length) return [];
  return eventsFrom(await query(`SELECT * FROM events WHERE id = ANY($1::uuid[]) AND ${live(preview)}`, [ids]));
}

// ------------------------------------------------------------------ team

export interface Person {
  id: string;
  slug: string;
  name: string;
  role: string;
  photo: Media | null;
  summary: string | null;
  bio: string;
  linkedin: string | null;
  website: string | null;
  group_slug: string;
  group_title: string;
  sort_order: number;
}

export interface TeamGroup {
  id: string;
  slug: string;
  title: string;
  nav_label: string | null;
  description: string | null;
  people: Person[];
}

async function peopleFrom(rows: Record<string, any>[]): Promise<Person[]> {
  const media = await mediaMap(rows.map((r) => r.photo));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    role: r.role,
    photo: media[r.photo] ?? null,
    summary: r.summary,
    bio: r.bio ?? '',
    linkedin: r.linkedin,
    website: r.website,
    group_slug: r.group_slug,
    group_title: r.group_title,
    sort_order: r.sort_order,
  }));
}

const PEOPLE_SELECT = `SELECT m.*, g.slug AS group_slug, g.title AS group_title FROM team_members m JOIN team_groups g ON g.id = m.group_id`;

export async function listTeam(preview: boolean): Promise<TeamGroup[]> {
  const [groups, people] = await Promise.all([
    query('SELECT * FROM team_groups ORDER BY sort_order, title'),
    query(`${PEOPLE_SELECT} WHERE ${live(preview, 'm')} ORDER BY m.sort_order, m.name`).then(peopleFrom),
  ]);
  return groups
    .map((g) => ({ id: g.id, slug: g.slug, title: g.title, nav_label: g.nav_label, description: g.description, people: people.filter((p) => p.group_slug === g.slug) }))
    .filter((g) => g.people.length);
}

export async function homeTeam(preview: boolean) {
  return peopleFrom(await query(`${PEOPLE_SELECT} WHERE m.show_on_home AND ${live(preview, 'm')} ORDER BY g.sort_order, m.sort_order, m.name LIMIT 12`));
}

export async function getPerson(slug: string, preview: boolean) {
  return (await peopleFrom(await query(`${PEOPLE_SELECT} WHERE m.slug = $1 AND ${live(preview, 'm')}`, [slug])))[0] ?? null;
}

// ------------------------------------------------------------------ programmes

export interface Programme {
  id: string;
  type: 'area' | 'membership' | 'programme';
  slug: string;
  title: string;
  full_name: string | null;
  audience: string | null;
  headline: string | null;
  summary: string;
  details: string | null;
  body: string;
  icon: string | null;
  image: Media | null;
  image_alt: string;
  benefits: string[];
  categories: { name: string; fee: string }[];
  fees_note: string | null;
  link_url: string | null;
  link_label: string | null;
  secondary_link_url: string | null;
  secondary_link_label: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og: Media | null;
  canonical_url: string | null;
  path: string;
}

export const programmePath = (type: string, slug: string) => (type === 'area' ? `/what-we-do/${slug}/` : type === 'membership' ? `/membership/${slug}/` : `/programmes/${slug}/`);

async function programmesFrom(rows: Record<string, any>[]): Promise<Programme[]> {
  const media = await mediaMap(rows.flatMap((r) => [r.image, r.og_image]));
  return rows.map((r) => ({
    ...(r as any),
    body: r.body ?? '',
    image: media[r.image] ?? null,
    image_alt: r.image_alt || media[r.image]?.alt || '',
    benefits: r.benefits ?? [],
    categories: r.categories ?? [],
    og: media[r.og_image] ?? null,
    path: programmePath(r.type, r.slug),
  }));
}

export async function listProgrammes(type: Programme['type'], preview: boolean) {
  return programmesFrom(await query(`SELECT * FROM programmes WHERE type = $1 AND ${live(preview)} ORDER BY sort_order, title`, [type]));
}

export async function getProgramme(type: Programme['type'], slug: string, preview: boolean) {
  return (await programmesFrom(await query(`SELECT * FROM programmes WHERE type = $1 AND slug = $2 AND ${live(preview)}`, [type, slug])))[0] ?? null;
}

/** Map from the area icon names used in content to the public icon set. */
export const AREA_ICONS: Record<string, string> = { diaspora: 'globe', support: 'users', investment: 'trending-up', training: 'graduation', bilateral: 'landmark' };
export const iconName = (icon: string | null | undefined, fallback = 'globe') => (icon ? (AREA_ICONS[icon] ?? icon) : fallback);

// ------------------------------------------------------------------ albums

export interface Album {
  id: string;
  slug: string;
  title: string;
  date: Date;
  year_only: boolean;
  type: string;
  summary: string | null;
  cover: Media | null;
  photo_count: number | null;
  photos: Media[];
  photo_total: number;
}

async function albumsFrom(rows: Record<string, any>[], withPhotos: boolean): Promise<Album[]> {
  const ids = rows.map((r) => r.id);
  const photos = withPhotos && ids.length ? await query<{ album_id: string; media_id: string }>('SELECT album_id, media_id FROM album_photos WHERE album_id = ANY($1::uuid[]) ORDER BY sort_order', [ids]) : [];
  const media = await mediaMap([...rows.map((r) => r.cover), ...photos.map((p) => p.media_id)]);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    date: toDate(r.date)!,
    year_only: r.year_only,
    type: r.type,
    summary: r.summary,
    cover: media[r.cover] ?? null,
    photo_count: r.photo_count,
    photos: photos.filter((p) => p.album_id === r.id).map((p) => media[p.media_id]).filter(Boolean),
    photo_total: Number(r.photo_total ?? 0),
  }));
}

const ALBUM_SELECT = `SELECT a.*, (SELECT count(*) FROM album_photos p WHERE p.album_id = a.id) AS photo_total FROM albums a`;

export async function listAlbums(preview: boolean) {
  return albumsFrom(await query(`${ALBUM_SELECT} WHERE ${live(preview, 'a')} ORDER BY a.date DESC, a.title`), false);
}

export async function getAlbum(slug: string, preview: boolean) {
  return (await albumsFrom(await query(`${ALBUM_SELECT} WHERE a.slug = $1 AND ${live(preview, 'a')}`, [slug]), true))[0] ?? null;
}

// ------------------------------------------------------------------ partners

export interface Partner {
  id: string;
  name: string;
  url: string | null;
  logo: Media | null;
}

export async function listPartners(preview: boolean): Promise<Partner[]> {
  const rows = await query(`SELECT * FROM partners WHERE ${live(preview)} ORDER BY sort_order, name`);
  const media = await mediaMap(rows.map((r) => r.logo));
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url, logo: media[r.logo] ?? null }));
}

// ------------------------------------------------------------------ counts

export async function contentCounts() {
  return (await one<{ albums: number; partners: number; team: number; news: number; photos: number }>(`
    SELECT (SELECT count(*) FROM albums WHERE ${live(false)})::int AS albums,
           (SELECT count(*) FROM partners WHERE ${live(false)})::int AS partners,
           (SELECT count(*) FROM team_members WHERE ${live(false)})::int AS team,
           (SELECT count(*) FROM news WHERE ${live(false)})::int AS news,
           (SELECT count(*) FROM album_photos p JOIN albums a ON a.id = p.album_id WHERE ${live(false, 'a')})::int AS photos`))!;
}

// ------------------------------------------------------------------ helpers

export const readingTime = (html = '') => Math.max(1, Math.round(html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length / 220));
export const isExternal = (url: string | null | undefined) => Boolean(url && /^https?:\/\//.test(url));
export const telHref = (display: string) => `tel:${String(display ?? '').replace(/[^\d+]/g, '')}`;

/** BaseLayout props for a page record. */
export const pageSeo = (p: PageData) => ({
  title: p.seo_title || p.title,
  description: p.seo_description || p.lead,
  image: p.og ?? p.hero,
  imageAlt: p.og ? p.og.alt : p.hero_alt,
  canonical: p.canonical_url,
  noindex: p.noindex,
});
