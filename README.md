# Friends of Nigeria website

The website of Friends of Nigeria (FON Europe), [friendsofnigeria.net](https://friendsofnigeria.net).

It is a static site built with [Astro](https://astro.build), hosted on Vercel, with content edited through [Decap CMS](https://decapcms.org) at `/admin/`.

## Run it locally

You need Node.js 22 (see `.nvmrc`).

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # production build into dist/
npm run preview   # serve the production build
npm run check     # type and content checks
```

## Where things live

| What | Where |
| --- | --- |
| Pages | `src/pages/` (one file per URL) |
| News articles | `src/content/news/*.md` |
| Team members | `src/content/team/*.md` (the `group` field decides which board they appear in) |
| Areas of work | `src/content/areas/*.md` |
| Spotlight Nigeria and NIDA | `src/content/events/*.md` |
| Photo albums | `src/content/albums/*.md`, photos in `src/assets/albums/<album>/` |
| Partner logos | `src/content/partners.json`, logos in `src/assets/partners/` |
| Contact details, social links | `src/data/site.json` |
| About and membership text | `src/data/about.json`, `src/data/membership.json` |
| Menus | `src/data/navigation.ts` |
| Colours, type, spacing | `src/styles/global.css` (tokens at the top) |
| Old URL redirects | `vercel.json` |
| Form and sign-in functions | `api/` |

Images placed in `src/assets/` are resized and converted to WebP automatically at build time, and lazy loaded below the fold.

## Hosting on Vercel

The site is hosted on Vercel and deploys automatically from GitHub: every push to `main` updates the live site, and every pull request gets its own preview link. Build settings are in `vercel.json` (Astro, `npm run build`, output `dist`).

`vercel.json` also sends the old WordPress addresses (old article URLs at the site root, `/about-me/`, `/get-involved/`, `/fonen-registration/`, team pages and so on) to their new pages with permanent redirects, so existing links and search rankings carry over.

To use the real domain, add `friendsofnigeria.net` under **Project → Settings → Domains** in Vercel and follow the DNS instructions it shows.

## Environment variables

Set these in Vercel under **Project → Settings → Environment Variables**, then redeploy. Never put them in this repository.

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `RESEND_API_KEY` | All forms | [resend.com](https://resend.com) → API Keys (free plan: 3,000 emails a month) |
| `FORM_TO_EMAIL` | All forms | Who receives submissions, e.g. `contact@friendsofnigeria.net` (comma-separate several) |
| `FORM_FROM_EMAIL` | All forms | A sender on a domain verified in Resend, e.g. `website@friendsofnigeria.net` |
| `BREVO_API_KEY` | Newsletter list (optional) | Brevo → SMTP & API → API keys |
| `BREVO_LIST_ID` | Newsletter list (optional) | The number of the Brevo contact list |
| `GITHUB_CLIENT_ID` | Content manager sign-in | GitHub OAuth app (see below) |
| `GITHUB_CLIENT_SECRET` | Content manager sign-in | Same GitHub OAuth app |

## Forms

All forms (contact, membership enquiry, FONEN registration and newsletter) post to one small Vercel function, `api/submit.js`.

- Each submission is emailed to `FORM_TO_EMAIL` through Resend, with the visitor's address as reply-to.
- Validation and the success and error messages run in the browser (`src/scripts/forms.ts`). Without JavaScript the forms still post and the visitor lands on `/thank-you/`.
- Spam protection is a hidden honeypot field.
- Until the three Resend variables are set, forms show a friendly error that points visitors to contact@friendsofnigeria.net.

Resend needs the sending domain verified once: in Resend go to **Domains → Add domain**, enter `friendsofnigeria.net` and add the DNS records it lists.

## Newsletter

Newsletter sign-ups are emailed to `FORM_TO_EMAIL` like any other form. When `BREVO_API_KEY` and `BREVO_LIST_ID` are set, each subscriber is also added to that Brevo list automatically, ready for newsletters to be sent from Brevo.

## Membership payments

FONPRO membership is paid through **HelloAsso**. The FONPRO page embeds the official HelloAsso form, and the links are in `src/data/site.json`. No credentials are stored here; payments are handled entirely by HelloAsso.

FONEN registration arrives by email like the other forms. Invoicing for FONEN fees happens outside the website.

## Content manager (Decap CMS)

Editors can update news, team members, albums, events, partner logos, contact details and page text at **`/admin/`**, without touching code. Every save becomes a commit in this repository and Vercel rebuilds the site in about a minute. Drafts go through a "Draft → In review → Ready" workflow before they are published.

One-time setup:

1. On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Homepage URL: `https://friendsofnigeria.net` (or the `.vercel.app` address until the domain is connected)
   - Authorization callback URL: `https://friendsofnigeria.net/api/callback` (same domain as above)
2. Copy the **Client ID**, generate a **Client secret**, and add both to Vercel as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
3. Give each editor write access to the repository on GitHub. They then sign in at `/admin/` with "Login with GitHub".

Sign-in is handled by `api/auth.js` and `api/callback.js`. The CMS settings are in `public/admin/config.yml`.

## Content that needs review

Items found during the rebuild that need someone at FON to confirm (missing figures, inconsistent team roles, typos in the old site) are listed in [`docs/site-audit.md`](docs/site-audit.md). Nothing in that list was invented: where information was missing, it was left out and flagged.
