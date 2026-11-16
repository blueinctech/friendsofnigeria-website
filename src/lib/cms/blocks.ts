/**
 * Editable content of the homepage, the general/SEO settings and the fixed
 * sections of each built-in page. Defaults reproduce the website as it was
 * before the CMS; image defaults ("asset:...") point at files imported by
 * the seed script.
 */
import type { BlockSchema, Field } from './fields.ts';

const text = (name: string, label: string, def?: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'text', default: def, max: 300, ...extra });
const area = (name: string, label: string, def?: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'textarea', default: def, max: 2000, ...extra });
const image = (name: string, label: string, def?: string, extra: Partial<Field> = {}): Field => ({ name, label, type: 'image', default: def, ...extra });
const link = (prefix: string, label: string, defLabel: string, defUrl: string): Field[] => [
  text(`${prefix}_label`, `${label} label`, defLabel, { width: 'half', max: 60 }),
  { name: `${prefix}_url`, label: `${label} link`, type: 'url', default: defUrl, width: 'half', help: 'A page on this site such as /contact/, or a full https:// address.' },
];

// ------------------------------------------------------------------ Homepage

export const HOME_SCHEMA: BlockSchema = {
  key: 'home',
  label: 'Homepage',
  sections: [
    {
      title: 'Hero',
      description: 'The first screen visitors see.',
      fields: [
        text('title_line1', 'Headline, first line', 'Connecting Nigeria and Europe.', { required: true, max: 80 }),
        text('title_line2', 'Headline, second line (green)', 'Building lasting partnerships.', { max: 80 }),
        area('lead', 'Description', 'We bring together businesses, investors and professionals across Nigeria and Europe to create partnerships and unlock opportunities.', { required: true, max: 400 }),
        ...link('primary_cta', 'Main button', 'Discover Friends of Nigeria', '/about/'),
        ...link('secondary_cta', 'Second button', 'Become a Member', '/membership/'),
        { name: 'chapters', label: 'Locations under the buttons', type: 'strings', default: ['France', 'Germany', 'Belgium & Luxembourg', 'Nigeria liaison office'], max: 8 },
        image('background_image', 'Background image (cityscape)', 'asset:site/hero-city.jpg', { help: 'Shown faintly behind the headline. A wide photo works best.' }),
      ],
    },
    {
      title: 'Hero slideshow',
      description: 'The large photo on the right. The first photo loads first; the others crossfade every few seconds. Drag to reorder.',
      fields: [
        {
          name: 'slides',
          label: 'Slides',
          type: 'list',
          itemLabel: 'Slide',
          max: 10,
          fields: [
            image('image', 'Photo', undefined, { required: true }),
            text('alt', 'Description for screen readers (alt text)', '', { required: true, max: 200 }),
            text('position', 'Focus point', '50% 40%', { help: 'Horizontal and vertical position to keep in view, e.g. "50% 40%".', max: 20 }),
          ],
          default: [
            { image: 'asset:site/area-investment.jpg', alt: 'Nigerian and European business leaders in conversation at the Spotlight Nigeria forum in Paris', position: '48% 40%' },
            { image: 'asset:site/hero-conversation.jpg', alt: 'Two women in conversation during a networking break at Spotlight Nigeria in Paris', position: '62% 32%' },
            { image: 'asset:activities/extra-2.jpg', alt: 'A speaker addresses delegates from the podium at a Friends of Nigeria event in Paris', position: '50% 30%' },
            { image: 'asset:activities/extra-1.jpg', alt: 'Guests networking over refreshments at a Friends of Nigeria event in Paris', position: '50% 45%' },
            { image: 'asset:site/audience-2022.jpg', alt: 'Nigerian and European delegates listening to a session at Spotlight Nigeria in Paris', position: '45% 50%' },
            { image: 'asset:activities/extra-4.jpg', alt: 'Professionals exchanging ideas at a Friends of Nigeria networking evening', position: '50% 40%' },
          ],
        },
      ],
    },
    {
      title: 'Floating image cards',
      description: 'The two smaller photos and the Nigeria–Europe card that float over the slideshow.',
      fields: [
        image('card_a_image', 'Upper card photo', 'asset:site/hero-panel.jpg', { width: 'half' }),
        text('card_a_alt', 'Upper card alt text', 'Panel discussion on stage at Spotlight Nigeria 2023 in Paris', { width: 'half' }),
        image('card_b_image', 'Lower card photo', 'asset:activities/extra-3.jpg', { width: 'half' }),
        text('card_b_alt', 'Lower card alt text', 'Nigerian and European professionals in conversation at a Friends of Nigeria networking evening', { width: 'half' }),
        text('link_left', 'Link card, left label', 'Nigeria', { width: 'half', max: 30 }),
        text('link_right', 'Link card, right label', 'Europe', { width: 'half', max: 30 }),
        text('link_middle', 'Link card, middle label', 'Business · Diaspora', { max: 40 }),
      ],
    },
    {
      title: 'About section',
      fields: [
        text('about_heading', 'Heading', 'A non-profit bridge between Nigeria and Europe', { required: true }),
        image('about_image', 'Photo', 'asset:site/team-spotlight-2022.jpg'),
        text('about_image_alt', 'Photo alt text', 'The Friends of Nigeria team with speakers and guests at Spotlight Nigeria 2022 in Paris'),
        area('about_intro', 'Introduction', "Friends of Nigeria (FON) is a non-profit involved in facilitating the access of Nigerian professionals in Europe to business and professional development opportunities and promoting Nigeria's attractiveness to European companies and investors."),
        area('about_vision', 'Our vision', 'To be at the forefront of promoting Nigeria in Europe and connecting professionals and businesses to opportunities in Nigeria.', { help: 'Shown after "Our vision is…".' }),
        {
          name: 'about_mission',
          label: 'Mission points',
          type: 'list',
          itemLabel: 'Point',
          max: 6,
          fields: [text('title', 'Title', '', { required: true, max: 80 }), area('text', 'Text', '', { required: true, max: 600 })],
          default: [
            { title: 'Building networks', text: 'We are building the largest network of Nigerian professionals in Europe and facilitating their access to entrepreneurship and career opportunities, so they can contribute their quota towards the economic development of Nigeria.' },
            { title: 'Mutual partnerships', text: 'We promote economic and commercial relations between France and Nigeria and facilitate mutual partnerships and collaborations between European enterprises and Nigerian enterprises.' },
          ],
        },
        text('about_link_label', 'Link label', 'More about Friends of Nigeria', { max: 60 }),
      ],
    },
    {
      title: 'Key figures',
      description: 'Numbers under the about section. Choose "Counted automatically" to keep a figure in step with the website content.',
      fields: [
        {
          name: 'stats',
          label: 'Figures',
          type: 'list',
          itemLabel: 'Figure',
          max: 6,
          fields: [
            {
              name: 'source',
              label: 'Value',
              type: 'select',
              default: 'manual',
              options: [
                { value: 'manual', label: 'Number entered below' },
                { value: 'albums', label: 'Counted automatically: published activities' },
                { value: 'partners', label: 'Counted automatically: published partners' },
                { value: 'team', label: 'Counted automatically: published team members' },
                { value: 'news', label: 'Counted automatically: published articles' },
              ],
            },
            { name: 'value', label: 'Number', type: 'number', min: 0, max: 1_000_000, showIf: { field: 'source', equals: ['manual'] } },
            text('label', 'Label', '', { required: true, max: 120 }),
          ],
          default: [
            { source: 'manual', value: 9, label: 'editions of Spotlight Nigeria in Paris since 2014' },
            { source: 'manual', value: 3, label: 'NIDA gala nights celebrating Nigerians abroad, 2023 to 2025' },
            { source: 'albums', label: 'documented engagements, missions and visits since 2017' },
            { source: 'partners', label: 'institutional partners and sponsors' },
          ],
        },
      ],
    },
    {
      title: 'What we do',
      description: 'The list shows the published areas of work from Activities & Programmes, in their order.',
      fields: [
        text('work_heading', 'Heading', 'What we do', { required: true }),
        area('work_lead', 'Introduction', 'Five areas of work that connect the Nigerian diaspora, European businesses and Nigerian institutions.'),
      ],
    },
    {
      title: 'Featured events',
      fields: [
        text('events_heading', 'Heading', 'Our flagship events', { required: true }),
        text('events_link_label', 'Link label', 'All events', { max: 60 }),
        {
          name: 'featured_events',
          label: 'Featured events',
          type: 'list',
          itemLabel: 'Event',
          max: 4,
          fields: [
            { name: 'event', label: 'Event', type: 'reference', ref: 'events', required: true },
            text('heading', 'Title', '', { max: 100, help: 'Leave empty to use the event short name.' }),
            text('kicker', 'Small label above the title', '', { max: 100 }),
            area('text', 'Description', '', { max: 600, help: 'Leave empty to use the event summary.' }),
            {
              name: 'facts',
              label: 'Key facts',
              type: 'list',
              itemLabel: 'Fact',
              max: 4,
              fields: [
                { name: 'icon', label: 'Icon', type: 'icon', default: 'calendar', options: [] },
                text('text', 'Text', '', { required: true, max: 120 }),
              ],
            },
            image('image', 'Photo (optional)', undefined, { help: 'Leave empty to use the event banner.' }),
            text('image_alt', 'Photo alt text', ''),
          ],
          default: [
            {
              event: 'event:spotlight-nigeria',
              heading: 'Spotlight Nigeria',
              kicker: 'Business and Investment Forum · Since 2014',
              text: 'An annual conference and exhibition that gives private sector companies and investors from France and Nigeria a platform to collaborate, exchange ideas, build business contacts and sign deals, with a focus each year on key sectors of the Nigerian economy and key state governments.',
              facts: [
                { icon: 'map-pin', text: "L'Hôtel de l'Industrie, Paris" },
                { icon: 'calendar', text: '9th edition held on 6 October 2026' },
              ],
              image: 'asset:site/spotlight-banner-2023.jpg',
              image_alt: 'Delegates in conversation in front of Spotlight Nigeria and Friends of Nigeria banners',
            },
            {
              event: 'event:nida',
              heading: 'Nigerians in Diaspora Awards',
              kicker: 'Gala and awards night · Since 2023',
              text: 'A first-of-its-kind gala celebrating trailblazing Nigerians who are rewriting the narrative of what it means to be a Nigerian abroad, with awards, music, performances and an evening of networking for professionals across the diaspora in Europe.',
              facts: [
                { icon: 'map-pin', text: 'Paris' },
                { icon: 'award', text: 'Editions in 2023, 2024 and 2025' },
              ],
              image: 'asset:events/nida-og.jpg',
              image_alt: 'Guests at the Nigerians in Diaspora Awards gala night in Paris',
            },
          ],
        },
      ],
    },
    {
      title: 'Management team highlights',
      description: 'Shows team members marked "Show on homepage" in Management Team.',
      fields: [
        text('team_heading', 'Heading', 'Management team', { required: true }),
        area('team_lead', 'Introduction', 'The executive board of Friends of Nigeria Europe, supported by an honorary board and chapter leads across Europe and Nigeria.'),
        text('team_link_label', 'Link label', 'Meet the full team', { max: 60 }),
      ],
    },
    {
      title: 'Membership',
      description: 'The two cards come from FONEN and FONPRO in Activities & Programmes.',
      fields: [
        text('membership_heading', 'Heading', 'Two ways to join the network', { required: true }),
        area('membership_lead', 'Introduction', 'Get involved with the Friends of Nigeria initiative and leverage business opportunities and ideas from international experts and professionals. The initiative also gives SMEs the opportunity to network with large businesses.'),
      ],
    },
    {
      title: 'Latest news',
      description: 'The newest published articles appear automatically.',
      fields: [
        text('news_heading', 'Heading', 'News and publications', { required: true }),
        text('news_link_label', 'Link label', 'All news', { max: 60 }),
        { name: 'news_count', label: 'Number of articles', type: 'number', default: 4, min: 1, max: 7 },
      ],
    },
    {
      title: 'Partner logos',
      description: 'Shows the published partners from Partners & Sponsors, in their order.',
      fields: [
        text('partners_heading', 'Heading', 'Partners and sponsors', { required: true }),
        area('partners_lead', 'Introduction', 'Institutions, chambers of commerce and organisations that have partnered with and supported our work.'),
        text('partners_link_label', 'Link label', 'Partner with us', { max: 60 }),
      ],
    },
  ],
};

// ------------------------------------------------------------------ General settings

export const SOCIAL_NETWORKS = ['LinkedIn', 'X', 'Facebook', 'Instagram', 'YouTube'];

export const SITE_SCHEMA: BlockSchema = {
  key: 'site',
  label: 'General settings',
  sections: [
    {
      title: 'Organisation',
      fields: [
        text('name', 'Organisation name', 'Friends of Nigeria', { required: true, max: 80 }),
        text('short_name', 'Short name', 'FON Europe', { max: 40 }),
        text('tagline', 'Tagline', 'Connecting cultures, creating opportunities', { max: 120 }),
        area('description', 'Short description', "Friends of Nigeria (FON) is a non-profit that facilitates access for Nigerian professionals in Europe to business and professional development opportunities, and promotes Nigeria's attractiveness to European companies and investors.", { required: true, max: 400, help: 'Used in the footer and as the default description for search engines.' }),
        image('logo', 'Website logo', 'asset:brand/logo.png', { required: true, width: 'half', help: 'Shown in the header on a light background.' }),
        image('footer_logo', 'Footer logo', 'asset:brand/logo-europe-light.png', { width: 'half', help: 'Shown on the dark footer. Use a light version.' }),
      ],
    },
    {
      title: 'Contact details',
      fields: [
        { name: 'email', label: 'Contact email', type: 'email', default: 'contact@friendsofnigeria.net', required: true },
        {
          name: 'phones',
          label: 'Phone numbers',
          type: 'list',
          itemLabel: 'Phone',
          max: 5,
          fields: [
            text('label', 'Label', '', { required: true, max: 40, width: 'half' }),
            text('display', 'Number as shown', '', { required: true, max: 40, width: 'half' }),
          ],
          default: [
            { label: 'France', display: '+33 7 58 68 37 71' },
            { label: 'Nigeria', display: '+234 809 754 3000' },
          ],
        },
        text('address', 'Street address', '229 rue Saint-Honoré', { required: true }),
        text('postcode', 'Postcode', '75001', { width: 'half', max: 20 }),
        text('city', 'City', 'Paris', { width: 'half', max: 80 }),
        text('country', 'Country', 'France', { max: 80 }),
        text('note', 'Note under the address', 'All meetings are strictly by appointment.'),
      ],
    },
    {
      title: 'Social media',
      fields: [
        {
          name: 'social',
          label: 'Profiles',
          type: 'list',
          itemLabel: 'Profile',
          max: 8,
          fields: [
            { name: 'name', label: 'Network', type: 'select', required: true, options: SOCIAL_NETWORKS.map((n) => ({ value: n, label: n })), width: 'half' },
            { name: 'url', label: 'Profile address', type: 'url', required: true, width: 'half' },
          ],
          default: [
            { name: 'LinkedIn', url: 'https://www.linkedin.com/company/11407971/' },
            { name: 'X', url: 'https://twitter.com/FON_EUROPE' },
            { name: 'Facebook', url: 'https://www.facebook.com/Friends-of-Nigeria-805717569606527/' },
            { name: 'Instagram', url: 'https://www.instagram.com/friendsofnigeria/' },
            { name: 'YouTube', url: 'https://www.youtube.com/@friendsofnigeriaeurope1497' },
          ],
        },
      ],
    },
    {
      title: 'Header and call to action',
      fields: [
        ...link('header_cta', 'Header button', 'Become a Member', '/membership/'),
        text('cta_title', 'Call-to-action band heading', 'Be part of a network creating opportunities between Nigeria and Europe.', { max: 160, help: 'The green band near the bottom of most pages.' }),
        area('cta_text', 'Call-to-action band text', 'Join Nigerian professionals and European companies building partnerships, sharing expertise and opening doors on both continents.', { max: 400 }),
      ],
    },
    {
      title: 'Footer',
      fields: [
        text('footer_newsletter_heading', 'Newsletter heading', 'Stay informed', { max: 80 }),
        area('footer_newsletter_text', 'Newsletter text', 'News, event invitations and opportunities between Nigeria and Europe, in your inbox.', { max: 300 }),
        text('copyright', 'Copyright line', 'Friends of Nigeria Europe. All rights reserved.', { help: 'The current year is added in front automatically.' }),
        text('credit_label', 'Website credit', 'Blueinc Technologies', { width: 'half', max: 80 }),
        { name: 'credit_url', label: 'Website credit link', type: 'url', default: 'https://blueinctech.com', width: 'half' },
      ],
    },
    {
      title: 'Membership payment links',
      fields: [
        { name: 'fonpro_url', label: 'FONPRO membership on HelloAsso', type: 'url', default: 'https://www.helloasso.com/associations/friends-of-nigeria/adhesions/professional-membership-fonpro' },
        { name: 'fon_france_url', label: 'FON France membership on HelloAsso', type: 'url', default: 'https://www.helloasso.com/associations/friends-of-nigeria/adhesions/fonfrancemembership' },
      ],
    },
    {
      title: 'Forms and newsletter',
      fields: [
        text('notify_email', 'Send form submissions to', '', { max: 500, help: 'Email addresses, separated by commas. Leave empty to use the FORM_TO_EMAIL server setting. Every submission is also saved in the dashboard.' }),
        { name: 'newsletter_enabled', label: 'Show newsletter sign-up forms', type: 'toggle', default: true },
        { name: 'newsletter_notify', label: 'Email the team about each newsletter sign-up', type: 'toggle', default: true },
      ],
    },
  ],
};

export const SEO_SCHEMA: BlockSchema = {
  key: 'seo',
  label: 'SEO settings',
  sections: [
    {
      title: 'Search engines and social sharing',
      fields: [
        text('home_title', 'Homepage title', 'Friends of Nigeria | Connecting Nigeria and Europe', { required: true, max: 70, seoEssential: true, help: 'Shown in search results and browser tabs. Keep under 60 characters.' }),
        text('title_suffix', 'Added after other page titles', ' | Friends of Nigeria', { max: 40 }),
        area('default_description', 'Default meta description', "Friends of Nigeria (FON) is a non-profit that facilitates access for Nigerian professionals in Europe to business and professional development opportunities, and promotes Nigeria's attractiveness to European companies and investors.", { required: true, max: 300, seoEssential: true, help: 'Used when a page has no description of its own. Search engines show about 160 characters.' }),
        image('default_og_image', 'Default sharing image', 'asset:site/spotlight-banner-2023.jpg', { required: true, help: 'Shown when a link is shared on social media and the page has no image. Best at 1200 × 630.' }),
        text('default_og_alt', 'Sharing image description', 'Friends of Nigeria members and guests at Spotlight Nigeria in Paris'),
        text('twitter_handle', 'X (Twitter) handle', '@FON_EUROPE', { max: 30 }),
        { name: 'indexing', label: 'Allow search engines to index the website', type: 'toggle', default: true, help: 'Turn off only for a private test site.' },
      ],
    },
  ],
};

// ------------------------------------------------------------------ Built-in pages

/** Fixed sections of the built-in pages, keyed by page key. */
export const PAGE_SCHEMAS: Record<string, BlockSchema> = {
  about: {
    key: 'about',
    label: 'About page sections',
    sections: [
      {
        title: 'Buttons',
        fields: [...link('primary_cta', 'Main button', 'Meet the team', '/team/'), ...link('secondary_cta', 'Second button', 'Contact us', '/contact/')],
      },
      {
        title: 'Vision',
        fields: [
          text('vision_heading', 'Heading', 'Our vision', { required: true }),
          area('vision', 'Vision statement', 'To be at the forefront of promoting Nigeria in Europe and connecting professionals and businesses to opportunities in Nigeria.', { required: true }),
          image('vision_image', 'Photo', 'asset:site/hero-conversation.jpg'),
          text('vision_image_alt', 'Photo alt text', 'A Nigerian business leader in conversation with a European guest at Spotlight Nigeria'),
        ],
      },
      {
        title: 'Mission',
        fields: [
          text('mission_heading', 'Heading', 'Our mission, in two parts', { required: true }),
          text('mission_sub', 'Subheading', 'Our mission guides and inspires every decision we make.'),
          {
            name: 'mission',
            label: 'Mission points',
            type: 'list',
            itemLabel: 'Point',
            max: 6,
            fields: [text('title', 'Title', '', { required: true, max: 80 }), area('text', 'Text', '', { required: true, max: 600 })],
            default: [
              { title: 'Building networks', text: 'We are building the largest network of Nigerian professionals in Europe and facilitating their access to entrepreneurship and career opportunities, so they can contribute their quota towards the economic development of Nigeria.' },
              { title: 'Mutual partnerships', text: 'We promote economic and commercial relations between France and Nigeria and facilitate mutual partnerships and collaborations between European enterprises and Nigerian enterprises.' },
            ],
          },
          image('mission_image', 'Photo', 'asset:about/team-group-2.png'),
          text('mission_image_alt', 'Photo alt text', 'Friends of Nigeria members and volunteers at Spotlight Nigeria'),
        ],
      },
      {
        title: 'Values',
        fields: [
          text('values_heading', 'Heading', 'Our values', { required: true }),
          area('values_lead', 'Introduction', 'To achieve our goals and aspirations, we strive to abide by these core values and principles.'),
          {
            name: 'values',
            label: 'Values',
            type: 'list',
            itemLabel: 'Value',
            max: 8,
            fields: [text('title', 'Title', '', { required: true, max: 60 }), area('text', 'Text', '', { required: true, max: 600 })],
            default: [
              { title: 'Synergy', text: 'Our actions are deeply rooted in teamwork, and this runs across our activities and operations. We believe collaboration is the bedrock of every great achievement.' },
              { title: 'Equity', text: 'Our actions are governed by meritocracy and fairness. FON is not affiliated with any religious, political or tribal propaganda. We treat all our members equally.' },
              { title: 'Excellence', text: 'As a professional organisation, we work with individuals at the forefront of their careers and industries, and carry out our activities with a dedication to excellence.' },
              { title: 'Integrity', text: 'We operate at the highest level of transparency and openness with our members, partners and team. Integrity runs through our organisational culture.' },
            ],
          },
        ],
      },
      {
        title: 'Where we work',
        fields: [
          text('chapters_heading', 'Heading', 'Where we work', { required: true }),
          area('chapters_lead', 'Introduction', 'A network of chapters across Europe, with a liaison office in Nigeria.'),
          {
            name: 'chapters',
            label: 'Chapters',
            type: 'list',
            itemLabel: 'Chapter',
            max: 10,
            fields: [text('name', 'Name', '', { required: true, max: 60 }), area('text', 'Text', '', { required: true, max: 400 })],
            default: [
              { name: 'France', text: 'Our headquarters in Paris, home to Spotlight Nigeria and NIDA, with business, professional and governance committees.' },
              { name: 'Germany', text: 'A country chapter connecting Nigerian professionals and communities across Germany.' },
              { name: 'Belgium & Luxembourg', text: 'A chapter serving Nigerian professionals and partners in Belgium and Luxembourg.' },
              { name: 'Nigeria', text: 'A liaison office coordinating operations and communications with partners in Nigeria.' },
            ],
          },
        ],
      },
      {
        title: 'Executive board',
        description: 'Shows the members of the first board in Management Team.',
        fields: [text('board_heading', 'Heading', 'Executive board', { required: true }), text('board_lead', 'Introduction', 'The leadership of Friends of Nigeria Europe.'), text('board_link_label', 'Link label', 'All boards and chapters')],
      },
    ],
  },
  contact: {
    key: 'contact',
    label: 'Contact page sections',
    sections: [{ title: 'Form', fields: [text('form_title', 'Form heading', 'Send us a message', { required: true }), text('form_sub', 'Form note', 'All fields are required unless marked optional.')] }],
  },
  membership: {
    key: 'membership',
    label: 'Membership page sections',
    sections: [
      {
        title: 'How to join',
        fields: [
          text('steps_heading', 'Heading', 'How to join', { required: true }),
          {
            name: 'steps',
            label: 'Steps',
            type: 'list',
            itemLabel: 'Step',
            max: 6,
            fields: [text('title', 'Title', '', { required: true, max: 80 }), area('text', 'Text', '', { required: true, max: 300 })],
            default: [
              { title: 'Choose your platform', text: 'FONEN for companies, FONPRO for individual professionals.' },
              { title: 'Register', text: 'Complete the FONEN registration form, or join FONPRO securely through HelloAsso.' },
              { title: 'Get connected', text: 'Access our events, network, training sessions and opportunities in Nigeria and Europe.' },
            ],
          },
          image('steps_image', 'Photo', 'asset:site/audience-2022.jpg'),
          text('steps_image_alt', 'Photo alt text', 'Business leaders and members in the audience at Spotlight Nigeria 2022'),
        ],
      },
      {
        title: 'Enquiry form',
        fields: [
          text('enquire_heading', 'Heading', 'Not sure which is right for you?', { required: true }),
          area('enquire_lead', 'Text', 'Send us a short note and our membership team will help you choose and guide you through registration.'),
        ],
      },
    ],
  },
  events: {
    key: 'events',
    label: 'Events page sections',
    sections: [
      {
        title: 'Event lists',
        fields: [text('upcoming_heading', 'Upcoming events heading', 'Upcoming events'), text('past_heading', 'Past events heading', 'Past events')],
      },
      {
        title: 'Other activities band',
        fields: [
          text('more_heading', 'Heading', 'Business breakfasts, missions and community events'),
          area('more_text', 'Text', 'Throughout the year we also host Nigerian delegations in Paris, organise business breakfast meetings and trade missions, and take part in bilateral events between Europe and Nigeria.'),
          ...link('more_cta', 'Button', 'See our activities', '/our-activities/'),
        ],
      },
    ],
  },
  news: {
    key: 'news',
    label: 'News page sections',
    sections: [{ title: 'Newsletter band', fields: [text('newsletter_heading', 'Heading', 'Get our news by email'), area('newsletter_text', 'Text', 'Statements, event invitations and opportunities, a few times a year.')] }],
  },
  team: {
    key: 'team',
    label: 'Team page sections',
    sections: [
      {
        title: 'Call to action',
        fields: [
          text('cta_title', 'Heading', 'Want to contribute to the network?'),
          area('cta_text', 'Text', 'Friends of Nigeria is run by volunteers across Europe and Nigeria. Join as a member, or get in touch to find out how you can help.'),
        ],
      },
    ],
  },
  partners: {
    key: 'partners',
    label: 'Partners page sections',
    sections: [
      {
        title: 'Partner with us',
        fields: [
          text('cta_heading', 'Heading', 'Partner with Friends of Nigeria'),
          area('cta_text', 'Text', 'We work with public institutions, companies and organisations on events, trade missions, training and diaspora initiatives. Sponsoring Spotlight Nigeria gives your organisation direct access to business leaders, investors and decision-makers from Nigeria and Europe.'),
          ...link('cta_primary', 'Main button', 'Discuss a partnership', '/contact/?topic=Partnership%20or%20sponsorship'),
          ...link('cta_secondary', 'Second button', 'Spotlight Nigeria sponsorship', 'https://spotlightnigeria-france.com/'),
        ],
      },
    ],
  },
  'our-activities': {
    key: 'our-activities',
    label: 'Activities page sections',
    sections: [{ title: 'Buttons', fields: [text('gallery_link_label', 'Gallery button label', 'Browse the photo gallery')] }],
  },
  gallery: {
    key: 'gallery',
    label: 'Gallery page sections',
    sections: [
      {
        title: 'Groups',
        fields: [text('flagship_heading', 'First group heading (flagship events)', 'Spotlight Nigeria'), text('others_heading', 'Second group heading', 'Engagements, delegations and missions')],
      },
    ],
  },
  'not-found': {
    key: 'not-found',
    label: 'Page not found sections',
    sections: [],
  },
};

/** Built-in pages: key, address, and the title/introduction they start with. */
export const SYSTEM_PAGES: { key: string; path: string; title: string; lead?: string; seo_title?: string; seo_description?: string; hero?: string; hero_alt?: string; noindex?: boolean }[] = [
  { key: 'home', path: '/', title: 'Home', seo_description: 'Friends of Nigeria connects Nigerian professionals and businesses with European companies, investors and institutions to create partnerships and opportunities between Nigeria and Europe.' },
  { key: 'about', path: '/about/', title: 'About Friends of Nigeria', seo_title: 'About us', lead: "Friends of Nigeria (FON) is a non-profit involved in facilitating the access of Nigerian professionals in Europe to business and professional development opportunities and promoting Nigeria's attractiveness to European companies and investors.", hero: 'asset:site/team-spotlight-2022.jpg', hero_alt: 'The Friends of Nigeria team with speakers and guests at Spotlight Nigeria 2022 in Paris' },
  { key: 'what-we-do', path: '/what-we-do/', title: 'What we do', lead: 'Five areas of work, one purpose: helping Nigerian professionals in Europe thrive and connecting European companies and investors with opportunities in Nigeria.', seo_description: 'Diaspora engagement, social support and integration, investment promotion, training and professional development, and bilateral engagements between Nigeria and Europe.' },
  { key: 'our-activities', path: '/our-activities/', title: 'Our activities', lead: 'From hosting Nigerian delegations in Paris to trade missions, investment clubs and presidential visits, here is a record of the engagements our members have led and supported.', seo_description: "A record of Friends of Nigeria's forums, delegations, trade missions, diaspora engagements and bilateral meetings in Paris and beyond since 2017." },
  { key: 'gallery', path: '/gallery/', title: 'Photo gallery', lead: '{albums} albums and {photos} photographs from our forums, delegations, missions and community engagements.', seo_description: 'Photo albums from Spotlight Nigeria, NIDA, delegations, trade missions and diaspora engagements organised or supported by Friends of Nigeria.' },
  { key: 'events', path: '/events/', title: 'Flagship events', seo_title: 'Events', lead: 'Two annual gatherings in Paris that bring Nigerian and European business leaders, investors, institutions and the diaspora together.', seo_description: 'Spotlight Nigeria Business and Investment Forum and the Nigerians in Diaspora Awards (NIDA), the flagship events of Friends of Nigeria in Paris.' },
  { key: 'news', path: '/news/', title: 'News and publications', lead: 'Statements, press releases, event reports, interviews and career guides from Friends of Nigeria Europe.' },
  { key: 'team', path: '/team/', title: 'The people behind Friends of Nigeria', seo_title: 'Management team', lead: 'Our boards and chapter leads are professionals at the forefront of their careers, volunteering their time to connect Nigeria and Europe.', seo_description: 'Meet the honorary board, executive board and country chapter leads of Friends of Nigeria across France, Germany, Belgium, Luxembourg and Nigeria.', hero: 'asset:about/team-group.png', hero_alt: 'Members of the Friends of Nigeria team' },
  { key: 'partners', path: '/partners/', title: 'Partners and sponsors', lead: 'Our work is made possible by institutions in France, Europe and Nigeria that share our commitment to stronger economic and cultural ties.', seo_description: 'The institutions, chambers of commerce and organisations that have partnered with and supported Friends of Nigeria and Spotlight Nigeria.' },
  { key: 'membership', path: '/membership/', title: 'Become a member', lead: 'Get involved with the Friends of Nigeria initiative and leverage business opportunities and ideas from international experts and professionals. The initiative also gives SMEs the opportunity to network with large businesses.', seo_description: 'Join Friends of Nigeria through FONEN, our corporate network for European companies, or FONPRO, the largest network of Nigerian professionals in France.', hero: 'asset:site/audience-2022.jpg', hero_alt: 'Business leaders and members in the audience at Spotlight Nigeria 2022' },
  { key: 'contact', path: '/contact/', title: 'Contact us', lead: 'Questions about membership, partnerships, our events or the press? Write to us and the right person on our team will reply.', seo_description: 'Get in touch with Friends of Nigeria in Paris about membership, partnerships, Spotlight Nigeria, NIDA or press enquiries.' },
  { key: 'thank-you', path: '/thank-you/', title: 'Thank you', lead: 'Your submission has reached our team. If you asked a question, we will reply by email as soon as we can.', seo_description: 'Your submission has been received by Friends of Nigeria.', noindex: true },
  { key: 'not-found', path: '/404/', title: "We couldn't find that page", seo_title: 'Page not found', lead: 'It may have moved when we rebuilt our website. These pages are a good place to continue.', seo_description: 'The page you were looking for could not be found.', noindex: true },
];

export const RESERVED_PATHS = ['admin', 'api', 'media', 'news', 'events', 'team', 'gallery', 'what-we-do', 'programmes', 'membership', 'sitemap-index.xml', 'sitemap-0.xml', 'robots.txt', ...SYSTEM_PAGES.map((p) => p.path.replace(/\//g, ''))].filter(Boolean);

export const SETTINGS_SCHEMAS: Record<string, BlockSchema> = { home: HOME_SCHEMA, site: SITE_SCHEMA, seo: SEO_SCHEMA };
