-- Friends of Nigeria CMS: initial schema.
-- Applied by scripts/db-migrate.ts, which records each file in schema_migrations.

-- ---------------------------------------------------------------- Administrators
CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'editor', 'content_manager')),
  -- Content managers only reach the modules listed here.
  modules text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_email_key ON admins (lower(email));

-- Only a SHA-256 hash of each session token is stored.
CREATE TABLE admin_sessions (
  id text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);

CREATE TABLE password_resets (
  id text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fixed-window counters shared by every serverless instance.
CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);

-- ---------------------------------------------------------------- Media library
CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('image', 'document')),
  filename text NOT NULL,
  original_name text,
  mime text NOT NULL,
  size integer NOT NULL,
  width integer,
  height integer,
  alt text NOT NULL DEFAULT '',
  storage text NOT NULL CHECK (storage IN ('db', 'blob')),
  url text NOT NULL,
  -- [{ "w": 480, "h": 320, "url": "...", "key": "...", "size": 12345 }]
  variants jsonb NOT NULL DEFAULT '[]',
  og_url text,
  -- Set for files imported from the original site, e.g. "site/hero-city.jpg".
  source_key text UNIQUE,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_created_idx ON media (created_at DESC);

-- File bytes, when files are stored in Postgres rather than Vercel Blob.
CREATE TABLE media_blobs (
  key text PRIMARY KEY,
  media_id uuid NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_blobs_media_idx ON media_blobs (media_id);

-- ---------------------------------------------------------------- Pages
CREATE TABLE pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- System pages (about, contact...) have a fixed key and template; custom pages have none.
  key text UNIQUE,
  kind text NOT NULL CHECK (kind IN ('system', 'custom')),
  slug text NOT NULL,
  path text NOT NULL UNIQUE,
  title text NOT NULL,
  lead text,
  hero_image uuid REFERENCES media (id) ON DELETE SET NULL,
  hero_image_alt text,
  body text,
  content jsonb NOT NULL DEFAULT '{}',
  seo_title text,
  seo_description text,
  og_image uuid REFERENCES media (id) ON DELETE SET NULL,
  canonical_url text,
  noindex boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- News
CREATE TABLE news_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  category_id uuid REFERENCES news_categories (id) ON DELETE SET NULL,
  image uuid REFERENCES media (id) ON DELETE SET NULL,
  image_alt text,
  featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- Publication date. A published article with a future date is scheduled.
  published_at timestamptz,
  seo_title text,
  seo_description text,
  og_image uuid REFERENCES media (id) ON DELETE SET NULL,
  canonical_url text,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_public_idx ON news (status, published_at DESC);

-- ---------------------------------------------------------------- Events
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'event' CHECK (kind IN ('flagship', 'event')),
  title text NOT NULL,
  short_title text,
  tagline text,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image uuid REFERENCES media (id) ON DELETE SET NULL,
  image_alt text,
  since text,
  edition_name text,
  start_date date,
  end_date date,
  venue text,
  address text,
  city text,
  registration_url text,
  website_url text,
  -- 'auto' decides upcoming/past from the dates.
  timing text NOT NULL DEFAULT 'auto' CHECK (timing IN ('auto', 'upcoming', 'past')),
  highlights jsonb NOT NULL DEFAULT '[]',
  stats jsonb NOT NULL DEFAULT '[]',
  stats_source text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  og_image uuid REFERENCES media (id) ON DELETE SET NULL,
  canonical_url text,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_gallery (
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, media_id)
);

-- ---------------------------------------------------------------- Team
CREATE TABLE team_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  nav_label text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  group_id uuid NOT NULL REFERENCES team_groups (id) ON DELETE RESTRICT,
  photo uuid REFERENCES media (id) ON DELETE SET NULL,
  summary text,
  bio text NOT NULL DEFAULT '',
  linkedin text,
  website text,
  show_on_home boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_members_group_idx ON team_members (group_id, sort_order);

-- ---------------------------------------------------------------- Activities and programmes
-- type: 'area' = "What we do" areas, 'membership' = FONEN/FONPRO, 'programme' = other programmes.
CREATE TABLE programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  type text NOT NULL CHECK (type IN ('area', 'membership', 'programme')),
  title text NOT NULL,
  full_name text,
  audience text,
  headline text,
  summary text NOT NULL DEFAULT '',
  details text,
  body text NOT NULL DEFAULT '',
  icon text,
  image uuid REFERENCES media (id) ON DELETE SET NULL,
  image_alt text,
  benefits jsonb NOT NULL DEFAULT '[]',
  categories jsonb NOT NULL DEFAULT '[]',
  fees_note text,
  link_url text,
  link_label text,
  secondary_link_url text,
  secondary_link_label text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  seo_title text,
  seo_description text,
  og_image uuid REFERENCES media (id) ON DELETE SET NULL,
  canonical_url text,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, slug)
);

-- "Our activities": dated engagements, each with a photo album.
CREATE TABLE albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  date date NOT NULL,
  year_only boolean NOT NULL DEFAULT false,
  type text NOT NULL,
  summary text,
  cover uuid REFERENCES media (id) ON DELETE SET NULL,
  photo_count integer,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE album_photos (
  album_id uuid NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media (id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, media_id)
);

-- ---------------------------------------------------------------- Partners
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo uuid REFERENCES media (id) ON DELETE SET NULL,
  url text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Enquiries
CREATE TABLE enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('contact', 'membership', 'fonen', 'newsletter')),
  name text,
  email text NOT NULL,
  phone text,
  organisation text,
  subject text,
  message text,
  data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved')),
  notes text,
  email_sent boolean NOT NULL DEFAULT false,
  handled_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiries_type_idx ON enquiries (type, created_at DESC);

-- ---------------------------------------------------------------- Navigation
CREATE TABLE nav_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu text NOT NULL CHECK (menu IN ('header', 'membership', 'footer')),
  parent_id uuid REFERENCES nav_items (id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL DEFAULT '',
  description text,
  icon text,
  new_tab boolean NOT NULL DEFAULT false,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nav_items_menu_idx ON nav_items (menu, parent_id, sort_order);

-- ---------------------------------------------------------------- Settings
-- One row per group: 'site', 'seo', 'home', 'newsletter'.
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES admins (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Audit log
CREATE TABLE activity_log (
  id bigserial PRIMARY KEY,
  admin_id uuid REFERENCES admins (id) ON DELETE SET NULL,
  admin_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  entity_label text,
  details jsonb,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_created_idx ON activity_log (created_at DESC);
