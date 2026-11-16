/**
 * Imports the website's existing content (the Markdown and JSON files and the
 * images in src/assets) into the database, so the dashboard starts with the
 * real site rather than an empty one. Nothing here is invented: every record
 * comes from a file that was already published on the website.
 *
 *   npm run db:seed              import (skips records that already exist)
 *   npm run db:seed -- --if-empty only when the database has no content yet
 *                                 (this is what the build runs)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import { closePool, databaseUrl, one, query } from '../src/lib/server/db.ts';
import { storeUpload } from '../src/lib/server/media.ts';
import { cleanRichText } from '../src/lib/server/sanitize.ts';
import { blockDefaults, slugify } from '../src/lib/cms/fields.ts';
import { HOME_SCHEMA, PAGE_SCHEMAS, SEO_SCHEMA, SITE_SCHEMA, SYSTEM_PAGES } from '../src/lib/cms/blocks.ts';
import { footerNav, mainNav, membershipNav } from '../src/data/navigation.ts';
import { groupLabels, groupOrder } from '../src/lib/format.ts';

const root = join(import.meta.dirname, '..');
const assetsDir = join(root, 'src', 'assets');
const contentDir = join(root, 'src', 'content');
const ifEmpty = process.argv.includes('--if-empty');

const mediaByKey = new Map<string, { id: string; url: string }>();
const eventBySlug = new Map<string, string>();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** "../../assets/site/x.jpg" or "asset:site/x.jpg" -> "site/x.jpg" */
const assetKey = (ref: string) => ref.replace(/^asset:/, '').replace(/^(\.\.\/)+assets\//, '');

function mediaId(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  const m = mediaByKey.get(assetKey(ref));
  if (!m) console.warn(`  ⚠ image not found: ${ref}`);
  return m?.id ?? null;
}

/** Replaces "asset:" and "event:" references inside default content with database ids. */
function resolveRefs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_k, v) => {
    if (typeof v !== 'string') return v;
    if (v.startsWith('asset:')) return mediaId(v);
    if (v.startsWith('event:')) return eventBySlug.get(v.slice(6)) ?? null;
    return v;
  });
}

async function setAlt(id: string | null, alt: string | undefined | null) {
  if (id && alt) await query(`UPDATE media SET alt = $2 WHERE id = $1 AND coalesce(alt, '') = ''`, [id, alt.slice(0, 500)]);
}

/** Markdown to safe HTML, with image paths pointing at the media library. */
function markdownToHtml(md: string) {
  const html = marked.parse(md.trim(), { async: false, gfm: true, breaks: false }) as string;
  const withImages = html.replace(/src="([^"]+)"/g, (all, src: string) => {
    if (!/assets\//.test(src)) return all;
    const m = mediaByKey.get(assetKey(src.replace(/^.*?assets\//, '../assets/')));
    return m ? `src="${m.url}"` : all;
  });
  return cleanRichText(withImages);
}

function readCollection(name: string) {
  const dir = join(contentDir, name);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const { data, content } = matter(readFileSync(join(dir, f), 'utf8'));
      return { slug: (data.slug as string) || f.replace(/\.md$/, ''), data: data as Record<string, any>, body: content };
    });
}

const toDate = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const toDay = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);

// ------------------------------------------------------------------ steps

async function importMedia() {
  const existing = await query<{ id: string; url: string; source_key: string }>('SELECT id, url, source_key FROM media WHERE source_key IS NOT NULL');
  for (const m of existing) mediaByKey.set(m.source_key, { id: m.id, url: m.url });
  const files = walk(assetsDir).filter((f) => /\.(jpe?g|png|webp|gif|svg)$/i.test(f));
  let added = 0;
  for (const file of files) {
    const key = relative(assetsDir, file).split('\\').join('/');
    if (mediaByKey.has(key)) continue;
    const record = await storeUpload({ buffer: readFileSync(file), filename: basename(file), sourceKey: key });
    mediaByKey.set(key, { id: record.id, url: record.url });
    added++;
    if (added % 25 === 0) console.log(`  … ${added} images imported`);
  }
  console.log(`✔ media: ${added} imported, ${files.length - added} already present`);
}

async function importNews() {
  const posts = readCollection('news');
  const categories = [...new Set(posts.map((p) => (p.data.category as string) || 'News'))].sort();
  const catId = new Map<string, string>();
  for (const [i, name] of categories.entries()) {
    const row = await one<{ id: string }>(
      `INSERT INTO news_categories (name, slug, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name, slugify(name), i],
    );
    catId.set(name, row!.id);
  }
  let added = 0;
  for (const p of posts) {
    const image = mediaId(p.data.image);
    await setAlt(image, p.data.imageAlt);
    const res = await query(
      `INSERT INTO news (slug, title, excerpt, body, category_id, image, image_alt, featured, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [p.slug, p.data.title, p.data.excerpt ?? '', markdownToHtml(p.body), catId.get(p.data.category || 'News'), image, p.data.imageAlt ?? null, Boolean(p.data.featured), p.data.draft ? 'draft' : 'published', toDate(p.data.date)],
    );
    added += res.length;
  }
  console.log(`✔ news: ${added} articles, ${categories.length} categories`);
}

async function importTeam() {
  const groupId = new Map<string, string>();
  for (const [i, slug] of groupOrder.entries()) {
    const g = groupLabels[slug];
    const navLabel = g.title.replace(', FON Europe', '').replace(' Executive Board', '').replace(' Sub-committee Leads', ' committees');
    const row = await one<{ id: string }>(
      `INSERT INTO team_groups (slug, title, nav_label, description, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [slug, g.title, navLabel, g.description, i],
    );
    groupId.set(slug, row!.id);
  }
  let added = 0;
  for (const p of readCollection('team')) {
    const photo = mediaId(p.data.photo);
    await setAlt(photo, p.data.name);
    const res = await query(
      `INSERT INTO team_members (slug, name, role, group_id, photo, summary, bio, linkedin, website, show_on_home, sort_order, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published', now()) ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [p.slug, p.data.name, p.data.role, groupId.get(p.data.group), photo, p.data.summary ?? null, p.body.trim() ? markdownToHtml(p.body) : '', p.data.linkedin ?? null, p.data.website ?? null, Boolean(p.data.showOnHome ?? p.data.group === 'executive-board-europe'), p.data.order ?? 99],
    );
    added += res.length;
  }
  console.log(`✔ team: ${added} members in ${groupOrder.length} boards`);
}

async function importEvents() {
  let added = 0;
  for (const e of readCollection('events')) {
    const image = mediaId(e.data.image);
    await setAlt(image, e.data.imageAlt);
    const le = e.data.lastEdition ?? {};
    const res = await query<{ id: string }>(
      `INSERT INTO events (slug, kind, title, short_title, tagline, summary, body, image, image_alt, since, edition_name, start_date, venue, address, city,
                           website_url, highlights, stats, stats_source, sort_order, status, published_at)
       VALUES ($1, 'flagship', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'published', now())
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [
        e.slug,
        e.data.title,
        e.data.shortTitle ?? null,
        e.data.tagline ?? null,
        e.data.summary ?? '',
        markdownToHtml(e.body),
        image,
        e.data.imageAlt ?? null,
        e.data.since ?? null,
        le.name ?? null,
        toDay(le.date),
        le.venue ?? null,
        le.address ?? null,
        le.city ?? null,
        e.data.website ?? null,
        JSON.stringify(e.data.highlights ?? []),
        JSON.stringify((e.data.stats ?? []).map((s: any) => ({ value: s.value, suffix: s.suffix ?? '', label: s.label }))),
        e.data.statsSource ?? null,
        e.data.order ?? 0,
      ],
    );
    const id = res[0]?.id ?? (await one<{ id: string }>('SELECT id FROM events WHERE slug = $1', [e.slug]))!.id;
    eventBySlug.set(e.slug, id);
    if (res.length) {
      added++;
      for (const [i, ref] of (e.data.gallery ?? []).entries()) {
        const mid = mediaId(ref);
        if (mid) await query('INSERT INTO event_gallery (event_id, media_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, mid, i]);
      }
    }
  }
  console.log(`✔ events: ${added} flagship events`);
}

async function importProgrammes() {
  let added = 0;
  const insert = async (row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    const res = await query(
      `INSERT INTO programmes (${cols.join(', ')}, status, published_at) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, 'published', now())
       ON CONFLICT (type, slug) DO NOTHING RETURNING id`,
      cols.map((c) => (Array.isArray(row[c]) ? JSON.stringify(row[c]) : row[c])),
    );
    added += res.length;
  };
  for (const a of readCollection('areas')) {
    const image = mediaId(a.data.image);
    await setAlt(image, a.data.imageAlt);
    await insert({ type: 'area', slug: a.slug, title: a.data.title, headline: a.data.headline, summary: a.data.summary, body: markdownToHtml(a.body), icon: a.data.icon, image, image_alt: a.data.imageAlt, sort_order: a.data.order ?? 0 });
  }
  // Membership programmes. The text and benefit lists are the ones already on the FONEN and FONPRO pages.
  const membership = JSON.parse(readFileSync(join(root, 'src', 'data', 'membership.json'), 'utf8'));
  const site = JSON.parse(readFileSync(join(root, 'src', 'data', 'site.json'), 'utf8'));
  await insert({
    type: 'membership',
    slug: 'fonen',
    title: membership.fonen.name,
    full_name: membership.fonen.fullName,
    audience: membership.fonen.audience,
    summary: membership.fonen.summary,
    details: membership.fonen.details,
    icon: 'investment',
    image: mediaId('site/hero-networking.jpg'),
    benefits: [
      'Business breakfast meetings and bespoke trade missions to understand the Nigerian business environment',
      'Matchmaking with the right advisory and market research to introduce your products and services in Nigeria',
      'In-house training on investing in Nigeria, its business culture and business environment',
      'Access to Spotlight Nigeria and its community of Nigerian and European business leaders and investors',
    ],
    categories: membership.fonen.categories,
    fees_note: 'Membership is paid. Once your registration is received, our team confirms your membership and sends payment details.',
    link_label: 'Register your company',
    link_url: '#register',
    sort_order: 1,
  });
  await insert({
    type: 'membership',
    slug: 'fonpro',
    title: membership.fonpro.name,
    full_name: membership.fonpro.fullName,
    audience: membership.fonpro.audience,
    summary: membership.fonpro.summary,
    details: membership.fonpro.details,
    icon: 'training',
    image: mediaId('site/hero-conversation.jpg'),
    benefits: [
      'Take part in projects and initiatives that contribute towards development in Nigeria',
      'Belong to a network of trailblazers and experts across France and Europe',
      'Training and capacity development sessions on business and professional subjects',
      'Access to career resources, networking events, Spotlight Nigeria and NIDA',
    ],
    categories: [],
    link_label: 'Join FONPRO',
    link_url: '#join',
    secondary_link_label: 'Open on HelloAsso',
    secondary_link_url: site.membershipLinks.fonproHelloAsso,
    sort_order: 2,
  });
  console.log(`✔ programmes: ${added} (areas of work and membership programmes)`);
}

async function importAlbums() {
  let added = 0;
  for (const a of readCollection('albums')) {
    const cover = mediaId(a.data.cover);
    await setAlt(cover, a.data.title);
    const res = await query<{ id: string }>(
      `INSERT INTO albums (slug, title, date, year_only, type, cover, photo_count, status, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', now()) ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [a.slug, a.data.title, toDay(a.data.date), Boolean(a.data.yearOnly), a.data.type, cover, a.data.photoCount ?? null],
    );
    if (!res.length) continue;
    added++;
    for (const [i, ref] of (a.data.photos ?? []).entries()) {
      const mid = mediaId(ref);
      await setAlt(mid, `${a.data.title}, photo ${i + 1}`);
      if (mid) await query('INSERT INTO album_photos (album_id, media_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [res[0].id, mid, i]);
    }
  }
  console.log(`✔ albums: ${added}`);
}

async function importPartners() {
  if ((await one<{ n: number }>('SELECT count(*)::int AS n FROM partners'))!.n > 0) return console.log('✔ partners: already present');
  const list = JSON.parse(readFileSync(join(contentDir, 'partners.json'), 'utf8')).partners as any[];
  for (const p of list) {
    const logo = mediaId(p.logo);
    await setAlt(logo, `${p.name} logo`);
    await query(`INSERT INTO partners (name, logo, url, sort_order, status, published_at) VALUES ($1, $2, $3, $4, 'published', now())`, [p.name, logo, p.url ?? null, p.order ?? 99]);
  }
  console.log(`✔ partners: ${list.length}`);
}

async function importPages() {
  let added = 0;
  for (const [i, p] of SYSTEM_PAGES.entries()) {
    const hero = p.hero ? mediaId(p.hero) : null;
    await setAlt(hero, p.hero_alt);
    const res = await query(
      `INSERT INTO pages (key, kind, slug, path, title, lead, hero_image, hero_image_alt, content, seo_title, seo_description, noindex, status, published_at, sort_order)
       VALUES ($1, 'system', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published', now(), $12) ON CONFLICT (key) DO NOTHING RETURNING id`,
      [p.key, p.key === 'home' ? '' : p.key, p.path, p.title, p.lead ?? null, hero, p.hero_alt ?? null, JSON.stringify(resolveRefs(blockDefaults(PAGE_SCHEMAS[p.key]))), p.seo_title ?? null, p.seo_description ?? null, Boolean(p.noindex), i],
    );
    added += res.length;
  }
  console.log(`✔ pages: ${added} built-in pages`);
}

async function importSettings() {
  const groups = { home: HOME_SCHEMA, site: SITE_SCHEMA, seo: SEO_SCHEMA };
  for (const [key, schema] of Object.entries(groups)) {
    await query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [key, JSON.stringify(resolveRefs(blockDefaults(schema)))]);
  }
  // Alt text for the homepage and site images, taken from the defaults.
  const home = blockDefaults(HOME_SCHEMA) as Record<string, any>;
  await setAlt(mediaId(home.card_a_image), home.card_a_alt);
  await setAlt(mediaId(home.card_b_image), home.card_b_alt);
  await setAlt(mediaId(home.about_image), home.about_image_alt);
  for (const s of home.slides ?? []) await setAlt(mediaId(s.image), s.alt);
  console.log('✔ settings: homepage, site and SEO');
}

async function importNavigation() {
  if ((await one<{ n: number }>('SELECT count(*)::int AS n FROM nav_items'))!.n > 0) return console.log('✔ navigation: already present');
  const add = async (menu: string, parent: string | null, item: { label: string; href?: string; description?: string; icon?: string; external?: boolean }, order: number) =>
    (await one<{ id: string }>(
      `INSERT INTO nav_items (menu, parent_id, label, url, description, icon, new_tab, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [menu, parent, item.label, item.href ?? '', item.description ?? null, item.icon ?? null, Boolean(item.external), order],
    ))!.id;
  for (const [i, item] of mainNav.entries()) {
    const id = await add('header', null, item, i);
    for (const [j, child] of (item.children ?? []).entries()) await add('header', id, child, j);
  }
  for (const [i, item] of membershipNav.entries()) await add('membership', null, item, i);
  for (const [i, col] of footerNav.entries()) {
    const id = await add('footer', null, { label: col.title }, i);
    for (const [j, link] of col.links.entries()) await add('footer', id, link, j);
  }
  console.log('✔ navigation: header, membership and footer menus');
}

async function main() {
  if (!databaseUrl()) {
    if (process.env.VERCEL) throw new Error('DATABASE_URL is not set. See docs/admin-cms.md.');
    console.warn('⚠ DATABASE_URL is not set: skipping the content import.');
    return;
  }
  if (ifEmpty) {
    // The marker is written only after a complete import, so an interrupted import is resumed.
    if (await one(`SELECT 1 FROM schema_migrations WHERE version = 'seed:initial-content'`)) {
      console.log('Content already imported: nothing to do.');
      return;
    }
  }
  console.log('Importing the existing website content…');
  await importMedia();
  await importEvents();
  await importNews();
  await importTeam(); // the homepage has always shown the executive board
  await importProgrammes();
  await importAlbums();
  await importPartners();
  await importPages();
  await importSettings();
  await importNavigation();
  await query(`INSERT INTO schema_migrations (version) VALUES ('seed:initial-content') ON CONFLICT DO NOTHING`);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('✖ Import failed:', err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
