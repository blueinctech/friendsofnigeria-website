export interface NavChild {
  label: string;
  href: string;
  description?: string;
  icon?: string;
  external?: boolean;
}
export interface NavItem {
  label: string;
  href: string;
  children?: NavChild[];
}

export const mainNav: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'About Us',
    href: '/about/',
    children: [
      { label: 'Who we are', href: '/about/', description: 'Our mission, vision and values', icon: 'globe' },
      { label: 'Management team', href: '/team/', description: 'Boards and country chapters', icon: 'users' },
      { label: 'Partners & sponsors', href: '/partners/', description: 'Institutions we work with', icon: 'landmark' },
    ],
  },
  {
    label: 'What We Do',
    href: '/what-we-do/',
    children: [
      { label: 'Diaspora engagement', href: '/what-we-do/diaspora-engagement/', icon: 'globe' },
      { label: 'Social support and integration', href: '/what-we-do/social-support-and-integration/', icon: 'users' },
      { label: 'Investment promotion', href: '/what-we-do/investment-promotion/', icon: 'trending-up' },
      { label: 'Training and professional development', href: '/what-we-do/training-and-professional-development/', icon: 'graduation' },
      { label: 'Bilateral engagements', href: '/what-we-do/bilateral-engagements/', icon: 'landmark' },
    ],
  },
  {
    label: 'Our Activities',
    href: '/our-activities/',
    children: [
      { label: 'Engagements & missions', href: '/our-activities/', description: 'A record of our work since 2017', icon: 'calendar' },
      { label: 'Photo gallery', href: '/gallery/', description: 'Albums from forums, visits and missions', icon: 'images' },
    ],
  },
  {
    label: 'Events',
    href: '/events/',
    children: [
      { label: 'Spotlight Nigeria', href: '/events/spotlight-nigeria/', description: 'Business and Investment Forum, Paris', icon: 'trending-up' },
      { label: 'NIDA', href: '/events/nida/', description: 'Nigerians in Diaspora Awards', icon: 'award' },
    ],
  },
  { label: 'News', href: '/news/' },
  { label: 'Contact Us', href: '/contact/' },
];

export const membershipNav: NavChild[] = [
  { label: 'Membership overview', href: '/membership/' },
  { label: 'FONEN – corporate membership', href: '/membership/fonen/' },
  { label: 'FONPRO – professional membership', href: '/membership/fonpro/' },
];

export const footerNav = [
  {
    title: 'Organisation',
    links: [
      { label: 'About us', href: '/about/' },
      { label: 'Management team', href: '/team/' },
      { label: 'Partners & sponsors', href: '/partners/' },
      { label: 'News & publications', href: '/news/' },
      { label: 'Contact us', href: '/contact/' },
    ],
  },
  {
    title: 'Our work',
    links: [
      { label: 'What we do', href: '/what-we-do/' },
      { label: 'Our activities', href: '/our-activities/' },
      { label: 'Photo gallery', href: '/gallery/' },
      { label: 'Spotlight Nigeria', href: '/events/spotlight-nigeria/' },
      { label: 'NIDA', href: '/events/nida/' },
    ],
  },
  {
    title: 'Membership',
    links: [
      { label: 'Become a member', href: '/membership/' },
      { label: 'FONEN', href: '/membership/fonen/' },
      { label: 'FONPRO', href: '/membership/fonpro/' },
    ],
  },
];
