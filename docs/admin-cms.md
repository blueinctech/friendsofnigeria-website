# Admin dashboard (CMS): setup and operation

The website and its admin dashboard are one Astro application on Vercel. Every
page is rendered from a Postgres database, and the dashboard at `/admin/` edits
that same database, so a change saved in the dashboard appears on the public
site within about 30 seconds (the CDN cache time), without a rebuild.

```
Visitor ──> Vercel CDN (30 s cache) ──> Astro server ──> Postgres (Neon)
Admin   ──> /admin/ (never cached)  ──> Astro server ──┘   + images: Postgres or Vercel Blob
```

## Why this backend

- **Postgres on Neon**, added through the Vercel Marketplace. It is a real
  relational database with migrations, a free tier that is large enough for
  this site, and Vercel injects the connection string automatically.
- **Astro server rendering** on Vercel functions, so the public site and the
  dashboard share one codebase, one database and one set of permission rules.
  There is no second service to host or keep in sync.
- **Images** are stored in the database by default (nothing else to set up), or
  in **Vercel Blob** once `BLOB_READ_WRITE_TOKEN` is set. Uploads are resized
  to WebP in several widths, plus a JPEG for social sharing previews.

## One-time setup on Vercel

1. **Add the database.** In the Vercel project, open **Storage → Create
   Database → Neon (Postgres)** and connect it to the project for Production,
   Preview and Development. Vercel adds `DATABASE_URL` (and `POSTGRES_URL`)
   for you.
2. **Add the setup token.** Under **Settings → Environment Variables**, add
   `ADMIN_SETUP_TOKEN` with a long random value, for example the output of
   `openssl rand -base64 32`. Keep it private.
3. **Optional: email.** Add `RESEND_API_KEY`, `FORM_FROM_EMAIL` and
   `FORM_TO_EMAIL` so enquiries are also emailed and password reset links are
   sent by email (see the table below).
4. **Optional: Blob storage for images.** Under **Storage → Create → Blob**,
   connect a Blob store. Vercel adds `BLOB_READ_WRITE_TOKEN`; new uploads then
   go to Blob instead of the database.
5. **Deploy.** The build command (`npm run build`) first runs the database
   migrations, then imports the current site content (pages, news, events,
   team, programmes, albums, partners, menus, settings and all 342 images)
   **only if the database is empty**, then builds the site. A later deploy never
   overwrites content edited in the dashboard. The first import takes about two
   minutes.
6. **Create the first administrator.** Open `https://<your-domain>/admin/` (the
   sign-in page shows the setup form while no administrator exists; `/admin/setup/` shows the same form),
   enter the setup token, your name, email and a password. This page works only
   while no administrator exists, and is switched off for good afterwards.
   You can then remove `ADMIN_SETUP_TOKEN` from Vercel.

   Alternatively, from a computer with the production `DATABASE_URL` in `.env`:
   `npm run admin:create -- --email you@example.org --name "Your Name"`
   (the password is asked for and never shown or stored in plain text).

Further administrators are invited from **Administrators** in the dashboard.
There is no public registration.

## Environment variables

Set these in Vercel under **Project → Settings → Environment Variables**, then
redeploy. Never commit them. `.env.example` lists them for local development.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string. Added by the Neon integration. `POSTGRES_URL` is used if `DATABASE_URL` is missing. |
| `ADMIN_SETUP_TOKEN` | For first setup | Secret of at least 16 characters that unlocks `/admin/setup/` while no administrator exists. Remove after setup. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | No | Stores uploaded images in an S3 bucket. The bucket stays private; the site serves files from `/media/<key>`. `S3_ENDPOINT` is only for non-AWS S3-compatible storage. Takes priority over Blob. |
| `BLOB_READ_WRITE_TOKEN` | No | Stores uploaded images in Vercel Blob instead of the database. |
| `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION` | No | Sends enquiry notifications and password links through Amazon SES. The key needs `ses:SendEmail`. Used before Resend. |
| `RESEND_API_KEY` | No | Sends email through [resend.com](https://resend.com) when SES is not set. |
| `FORM_FROM_EMAIL` | With email | Sender on a domain verified in SES (or Resend), e.g. `website@friendsofnigeria.net`. |
| `CMS_ADAPTER`, `CMS_ALLOWED_HOSTS` | On a Node host | `CMS_ADAPTER=node` builds a standalone Node server (`node dist/server/entry.mjs`, reads `HOST`/`PORT`); `CMS_ALLOWED_HOSTS` lists the site's domains, comma-separated. |
| `FORM_TO_EMAIL` | No | Who receives enquiry emails. The "Notification email" in **Settings** takes priority. |
| `BREVO_API_KEY`, `BREVO_LIST_ID` | No | Also adds newsletter sign-ups to a Brevo list. |
| `ADMIN_SESSION_IDLE_MINUTES` | No | Sign out after this much inactivity. Default 120. |
| `ADMIN_SESSION_MAX_HOURS` | No | Maximum session length. Default 12. |
| `PUBLIC_CACHE_SECONDS` | No | CDN cache time for public pages. Default 30. |
| `MEDIA_MAX_UPLOAD_MB` | No | Largest image upload. Default 4 (Vercel's request limit is 4.5 MB). |
| `DATABASE_POOL_MAX` | No | Connections per function instance. Default 3. |

Without email configured, everything still works: enquiries are saved in the
dashboard, and password reset or invitation links are shown to the super
administrator who creates them, to pass on privately.

## Local development

```bash
cp .env.example .env          # then set DATABASE_URL to a local or Neon database
npm install
npm run db:migrate            # create the tables
npm run db:seed               # import the current site content
npm run admin:create          # create your administrator (asks for the details)
npm run dev                   # http://localhost:4321 and http://localhost:4321/admin/
```

A local Postgres works too, e.g. `postgres://user:password@localhost:5432/fon_cms`
(SSL is skipped for `localhost`).

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for password hashing, sanitising, validation, CSV export and roles. |
| `npm run check` | Type check. |
| `npm run build:node` then `PORT=4400 node --env-file=.env dist/server/entry.mjs` | Run the production build locally at http://localhost:4400. |
| `npm run admin:reset-password -- --email you@example.org` | Set a new password from the command line and sign the account out everywhere. |

## Roles

| | Super administrator | Editor | Content manager |
| --- | --- | --- | --- |
| Content (pages, homepage, news, events, team, programmes, gallery, partners, menus) | All | All | Only the modules assigned to them; can create, edit and publish, not delete |
| Media library | All | All | Upload and edit, not delete |
| Enquiries (membership, contact, newsletter) | Yes | Yes | No |
| Site settings and SEO settings | Yes | No | No |
| Administrators and full activity log | Yes | No | No |

## Security

- Passwords are hashed with scrypt and a random salt. Weak and common passwords
  are refused.
- Sessions are random tokens stored only as a hash, in an `HttpOnly`, `SameSite=Lax`
  cookie (also `Secure` on HTTPS), with an idle timeout and a maximum lifetime.
  Changing a password signs out every other session.
- Sign-in, password reset and setup are rate limited per IP address and per
  account. Error messages do not reveal whether an email has an account.
- Every change made through the dashboard API needs a per-session CSRF token and
  must come from the site itself.
- All database queries are parameterised. Rich text is sanitised on save
  against an allowlist, and other text is escaped when shown.
- Uploads are checked by their actual content, not their name: JPG, PNG, WebP
  and SVG only. SVGs with scripts, event handlers or external references are
  refused. CSV exports neutralise spreadsheet formulas.
- Every sign-in and every change is written to the activity log, with who did
  it, when and from which IP address.
- Credentials exist only in environment variables. Nothing secret is in this
  repository or sent to the browser.

## Content model

Database tables are defined in `db/migrations/`. Field definitions for each
content type (labels, validation, which fields are SEO fields) live in
`src/lib/cms/resources.ts`; the homepage blocks are in `src/lib/cms/blocks.ts`.
The public pages read content through `src/lib/server/public.ts`.

The Markdown and image files in `src/content/`, `src/data/` and `src/assets/`
are kept only as the source of the first import (`npm run db:seed`). After the
import, the database is the only source of truth: edit content in the dashboard,
not in those files.
