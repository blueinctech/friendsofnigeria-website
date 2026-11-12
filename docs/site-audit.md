# Friends of Nigeria website: audit and items for review

This file records what was found on the old site (friendsofnigeria.net, WordPress/Elementor) during the rebuild, and lists everything that needs a decision or confirmation from FON before launch. Nothing in the new site was invented: where information was missing it was left out and is listed here.

## 1. What the old site contained

| Old page | New page |
| --- | --- |
| Home | `/` |
| About (`/about/`, `/about-me/`) | `/about/` |
| Team (`/team/` plus individual pages such as `/john-okoro/`) | `/team/` and `/team/<name>/` |
| What we do (sections on the home page) | `/what-we-do/` and one page per area |
| Our activities | `/our-activities/` |
| Gallery | `/gallery/` and one page per album |
| Event, Spotlight Nigeria business forum | `/events/`, `/events/spotlight-nigeria/`, `/events/nida/` |
| News, posts and articles | `/news/` and `/news/<article>/` (15 articles migrated) |
| Membership, Get involved, FONEN registration | `/membership/`, `/membership/fonen/`, `/membership/fonpro/` |
| Contact | `/contact/` |
| Shop, cart, checkout, donate, `wfp-*`, `home-2`, `home-3`, sample page | Not rebuilt (unused plugin or test pages). They redirect to the closest page. |

All old addresses redirect permanently to the new ones (`vercel.json`), including the 15 old article URLs that lived at the site root.

Content carried over: 23 team members with photos and bios, 15 news articles with their images, 22 photo albums (up to 24 photos each), 14 partner logos, the five areas of work, mission, vision and values, membership details and fees, and contact details.

Brand: the original FON logo (Europe and standard versions) and the brand green `#0B9444` are kept. The logo was cut out of the original artwork, so a **vector or high-resolution original logo file** would give a sharper result.

## 2. Problems found on the old site (fixed or removed)

- About page counters all showed **0** (members, events and so on). They were not carried over. See 3.1.
- Placeholder text left in some Elementor sections, a link pointing to `localhost`, and a broken phone (`tel:`) link. Not carried over.
- Several hidden duplicate team cards with different data. Only the visible cards were used.
- Typos in album titles corrected: "Banwo-Igahdolo" → "Banwo & Ighodalo", "Govenor" → "Governor", "Buahari" → "Buhari".
- Formatting in migrated articles cleaned up (headings, all-caps titles, missing spaces after bold text).

## 3. Needs confirmation from FON

### 3.1 Figures
- **Organisation figures.** The old About counters were broken (all 0). If FON wants headline numbers (members, companies, events held), please supply real figures. The homepage only shows figures that can be counted from the site itself: 9 Spotlight editions since 2014, 3 NIDA nights (2023 to 2025), 22 documented engagements, 14 partners.
- **NIDA figures** (150+ guests in 2023, 200+ in 2024, 3 editions) were taken from nida-awards.org. Please confirm.
- **Spotlight Nigeria**: 9th edition on 6 October 2026 at L'Hôtel de l'Industrie, Paris, taken from spotlightnigeria-france.com. Please confirm and send photos from the 2026 edition if available.

### 3.2 Team
- **Ifèdolapo Onikoyi**: the photo file on the old site was named "Crystal-Deroche", and the LinkedIn link pointed to a "crystal-deroche" profile (left out). Their card said "Director of Events" while the profile pop-up said "Social & Events Committee". Card role used. Please confirm photo, role and LinkedIn.
- **Ogenna Onwumere (née Onuoha)** and **Bukky Kadiri**: role on the card differs from the role in the profile pop-up. Card role used. Please confirm.
- **Nene Ananaba**: the old card displayed another person's photo. Please send the correct photo.
- **Olamide Olayiwola**: no bio on the old site, so no profile page. Please send a short bio if wanted.
- **Chisom Onwumere**: had a page on the old site, but was not on the team page and used the wrong photo and title. Left out; the old URL redirects to `/team/`. Please confirm whether they should be listed.
- **Oyindamola Olusunmade**: spelled both "Olusunmade" and "Olunsunmade" on the old site. "Olusunmade" used. Please confirm.
- **Abiodun Odunuga**: bio has missing words: "...as well as the in Rome Italy". Please supply the missing event name.
- Team order within each board follows the old site. Please confirm.

### 3.3 Text that was written or reworded
- Value "Integrity": the old wording "Moral perpendicularity..." was reworded to "Integrity runs through our organisational culture." Please approve or replace.
- Short page introductions, headlines and button labels were written for the new design, based on the old site's text.
- FONEN and FONPRO benefit lists were put together from the activities described on the old site (business breakfasts, trade missions, matchmaking, training, Spotlight Nigeria). Please check they match what members actually receive.
- "Where we work" descriptions for France, Germany, Belgium & Luxembourg and Nigeria are short summaries based on the team page. Please check.
- News categories (Statement, Press release, Diaspora, Events, Careers, Interview, Opinion) were assigned during migration.
- News summaries (the short text on news cards and in search results) were rewritten in November 2026 from each article's own opening, because the migrated WordPress summaries were cut mid-sentence or started with dates and all-caps headings. Please check they read well.
- Small spelling fixes in bios: "Sates Governments" → "State Governments" (Abiodun Odunuga), "Due Dilligence" → "Due Diligence" and "Société General" → "Société Générale" (Oyindamola Olusunmade).
- The NCAE 2018 article linked to the full speech as a PDF on the old site (`/wp-content/uploads/2018/06/FON-SPEECH-AT-NCAE-2018-1.pdf`). That file no longer exists on the old site either, so the link was removed. Please send the PDF if it should be offered again.

### 3.4 Dates and names
- Album dates are taken from the old gallery and article dates. Where only a year was known, the site shows the year only. Please correct any wrong dates.
- Partner names were read from the logo images. Please check the names, and send website links for partners that have none.

### 3.5 Forms
- The FONEN form's "annual turnover" ranges are new (the old form had a free-text field). Please confirm the ranges.
- The old site linked to a Google Form for FONPRO. The new FONPRO page uses the official HelloAsso membership form instead. Please confirm that the Google Form is no longer needed.

## 4. Integrations that need credentials or setup

| Integration | Status | What is needed |
| --- | --- | --- |
| Hosting | Vercel, deploying from GitHub (`vercel.json`) | DNS for friendsofnigeria.net pointed at Vercel |
| Forms (contact, membership, FONEN, newsletter) | Built (`api/submit.js`), email delivery through Resend | A Resend account and API key, the receiving address, and the sending domain verified in Resend |
| Newsletter mailing list | Sign-ups are emailed to FON; Brevo list sync is built but off | Brevo API key and list ID, if Brevo will be used |
| Content manager `/admin/` | Configured (Decap CMS with its own GitHub sign-in) | A GitHub OAuth app; client ID and secret added to Vercel |
| FONPRO payments | Live HelloAsso links and embedded form | None; payments stay on HelloAsso |
| Analytics | Not installed | Choose a tool (for example Vercel Analytics, Plausible or GA4). A cookie banner is needed for GA4 |

## 5. QA results

Checked on the production build, at 1440px desktop and 390px mobile, for all 78 pages:

- No JavaScript console errors and no failed requests.
- No horizontal scrolling on any page.
- Every page has exactly one `h1`, a unique title and a meta description.
- Every image has alt text. Images are resized, served as WebP, and lazy loaded below the fold.
- No broken internal links or in-page anchors; no empty or `#` links.
- Forms: required fields, email, phone and URL formats are validated with inline messages. Clear success and error messages, and they still submit without JavaScript.
- Keyboard: visible focus styles, a skip link, menus that open with the keyboard, and a mobile menu that can be closed with Escape.
- Motion: fade-in and counter animations are turned off for visitors who prefer reduced motion.
- SEO: Open Graph and Twitter tags with an image per page, structured data for the organisation, breadcrumbs and articles, `sitemap-index.xml` (77 URLs), `robots.txt`, and redirects from old URLs.
- `astro check` passes with no errors.

Not tested here: real form submissions (these need the Resend key on Vercel) and the embedded HelloAsso form, which could not load from the test environment.
