# Friends of Nigeria website

The website of Friends of Nigeria (FON Europe), [friendsofnigeria.net](https://friendsofnigeria.net).

It is a static site built with [Astro](https://astro.build), hosted on Netlify, with content edited through [Decap CMS](https://decapcms.org) at `/admin/`.

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
| Old URL redirects | `public/_redirects` |

Images placed in `src/assets/` are resized and converted to WebP automatically at build time, and lazy loaded below the fold.

## Deploying on Netlify

1. In Netlify, choose **Add new site → Import an existing project** and pick `blueinctech/friendsofnigeria-website`.
2. The build settings come from `netlify.toml` (`npm run build`, publish `dist`). Nothing else is needed to deploy.
3. Point the `friendsofnigeria.net` domain at the Netlify site under **Domain management**.

`public/_redirects` sends the old WordPress addresses (old article URLs at the site root, `/about-me/`, `/get-involved/`, `/fonen-registration/`, team pages and so on) to their new pages with permanent redirects, so existing links and search rankings carry over.

## Forms

All forms (contact, membership enquiry, FONEN registration and newsletter) use **Netlify Forms**. Netlify finds them automatically at build time because they carry `data-netlify="true"`.

- Validation and the success and error messages run in the browser (`src/scripts/forms.ts`). Without JavaScript the forms still post and land on `/thank-you/`.
- Spam protection is a hidden honeypot field. Netlify's own spam filter also applies.
- **To receive submissions by email:** in Netlify go to **Site configuration → Notifications → Emails and webhooks → Form submission notifications** and add `contact@friendsofnigeria.net` (one rule per form, or one for all).
- On the free Netlify plan the limit is 100 submissions a month.

The forms only work once the site is deployed on Netlify. Locally they will show the error message, which is expected.

## Newsletter

The newsletter signup is a Netlify form named `newsletter`, so sign-ups are collected in Netlify and can be exported as CSV. **It is not yet connected to a mailing tool.** To send newsletters automatically, choose one and provide:

- **Mailchimp:** an API key, the audience (list) ID and the server prefix (for example `us21`).
- **Brevo (Sendinblue):** an API key and the contact list ID.

With those, a small Netlify Function (or a Zapier/Make zap on the Netlify form) can add each new subscriber to the list. Keys must be stored as Netlify environment variables, never in this repository.

## Membership payments

FONPRO membership is paid through **HelloAsso**. The FONPRO page embeds the official HelloAsso form, and the links are in `src/data/site.json`. No credentials are stored here; payments are handled entirely by HelloAsso.

FONEN registration is a Netlify form. Invoicing for FONEN fees happens outside the website.

## Content manager (Decap CMS)

Editors can update news, team members, albums, events, partner logos, contact details and page text at **`https://friendsofnigeria.net/admin/`**, without touching code. Every save becomes a commit in this repository and Netlify rebuilds the site in about a minute. Drafts go through a "Draft → In review → Ready" workflow before they are published.

One-time setup (needs a GitHub account with access to this repository):

1. On GitHub, go to **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Homepage URL: `https://friendsofnigeria.net`
   - Authorization callback URL: `https://api.netlify.com/auth/done`
2. Copy the **Client ID** and generate a **Client secret**.
3. In Netlify, go to **Site configuration → Access & security → OAuth → Install provider**, choose **GitHub** and paste both values.
4. Give each editor write access to the repository on GitHub. They then sign in at `/admin/` with "Login with GitHub".

The CMS settings are in `public/admin/config.yml`.

## Content that needs review

Items found during the rebuild that need someone at FON to confirm (missing figures, inconsistent team roles, typos in the old site) are listed in [`docs/site-audit.md`](docs/site-audit.md). Nothing in that list was invented: where information was missing, it was left out and flagged.
