# Friends of Nigeria website

The website of Friends of Nigeria (FON Europe), [friendsofnigeria.net](https://friendsofnigeria.net).

It is an [Astro](https://astro.build) site on Vercel. All content lives in a Postgres database and is edited in the admin dashboard at `/admin/`; the public pages read the same database, so changes appear within about 30 seconds without a rebuild. Setup, environment variables, roles and security are described in [`docs/admin-cms.md`](docs/admin-cms.md).

## Run it locally

You need Node.js 22 (see `.nvmrc`).

```bash
cp .env.example .env   # set DATABASE_URL
npm install
npm run db:migrate     # create the tables
npm run db:seed        # import the site content
npm run admin:create   # create your administrator
npm run dev            # http://localhost:4321 (dashboard at /admin/)
npm test               # unit tests
npm run check          # type check
```

## Where things live

| What | Where |
| --- | --- |
| Public pages | `src/pages/` (one file per URL); content comes from `src/lib/server/public.ts` |
| Admin dashboard | `src/pages/admin/`, components in `src/components/admin/` |
| Admin API | `src/pages/api/admin/` |
| Content types and fields | `src/lib/cms/resources.ts`, homepage blocks in `src/lib/cms/blocks.ts` |
| Roles and permissions | `src/lib/cms/permissions.ts` |
| Database schema | `db/migrations/` |
| First content import | `scripts/db-seed.ts`, reading `src/content/`, `src/data/` and `src/assets/` |
| Colours, type, spacing | `src/styles/global.css` (tokens at the top), dashboard styles in `src/styles/admin.css` |
| Old URL redirects | `vercel.json` |

## Hosting on Vercel

The site is hosted on Vercel and deploys automatically from GitHub: every push to `main` updates the live site, and every pull request gets its own preview link. Build settings are in `vercel.json`. `npm run build` runs the database migrations, imports the content if the database is empty, then builds the site.

`vercel.json` also sends the old WordPress addresses (old article URLs at the site root, `/about-me/`, `/get-involved/`, `/fonen-registration/`, team pages and so on) to their new pages with permanent redirects, so existing links and search rankings carry over.

To use the real domain, add `friendsofnigeria.net` under **Project → Settings → Domains** in Vercel and follow the DNS instructions it shows.

## Environment variables

Set these in Vercel under **Project → Settings → Environment Variables**, then redeploy. Never put them in this repository. The full list, with defaults, is in [`docs/admin-cms.md`](docs/admin-cms.md) and `.env.example`.

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Everything (added by the Neon integration in Vercel) |
| `ADMIN_SETUP_TOKEN` | Creating the first administrator at `/admin/setup/` |
| `BLOB_READ_WRITE_TOKEN` | Optional: image storage in Vercel Blob |
| `RESEND_API_KEY`, `FORM_FROM_EMAIL`, `FORM_TO_EMAIL` | Optional: emailing enquiries and password links |
| `BREVO_API_KEY`, `BREVO_LIST_ID` | Optional: newsletter list in Brevo |

## Forms

All forms (contact, membership enquiry, FONEN registration and newsletter) post to `src/pages/api/submit.ts`.

- Each submission is saved in the database and appears under **Enquiries** in the dashboard, where it can be searched, filtered, marked as pending, contacted or resolved, and exported to CSV.
- When Resend is configured, it is also emailed to the notification address, with the visitor's address as reply-to.
- Validation and the success and error messages run in the browser (`src/scripts/forms.ts`). Without JavaScript the forms still post and the visitor lands on `/thank-you/`.
- Spam protection is a hidden honeypot field plus a rate limit per visitor.

Resend needs the sending domain verified once: in Resend go to **Domains → Add domain**, enter `friendsofnigeria.net` and add the DNS records it lists.

## Newsletter

Newsletter sign-ups are emailed to `FORM_TO_EMAIL` like any other form. When `BREVO_API_KEY` and `BREVO_LIST_ID` are set, each subscriber is also added to that Brevo list automatically, ready for newsletters to be sent from Brevo.

## Membership payments

FONPRO membership is paid through **HelloAsso**. The FONPRO page embeds the official HelloAsso form, and the links are edited in the dashboard (FONPRO page and **Settings**). No credentials are stored here; payments are handled entirely by HelloAsso.

FONEN registration arrives by email like the other forms. Invoicing for FONEN fees happens outside the website.

## Admin dashboard

Administrators sign in at **`/admin/`** to edit pages, the homepage, news, events, the team, programmes, the gallery, partners, menus, SEO and site settings, manage images and enquiries, and see the activity log. There is no public registration: the first administrator is created once with a secret setup token, and further administrators are invited from the dashboard. See [`docs/admin-cms.md`](docs/admin-cms.md).

## Content that needs review

Items found during the rebuild that need someone at FON to confirm (missing figures, inconsistent team roles, typos in the old site) are listed in [`docs/site-audit.md`](docs/site-audit.md). Nothing in that list was invented: where information was missing, it was left out and flagged.
