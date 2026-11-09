export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatMonth = (d: Date, yearOnly = false) =>
  yearOnly
    ? String(d.getUTCFullYear())
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const readingTime = (text = '') => Math.max(1, Math.round(text.split(/\s+/).length / 220));

export const groupLabels: Record<string, { title: string; description: string }> = {
  'executive-board-europe': {
    title: 'Executive Board, FON Europe',
    description: 'The executive leadership of Friends of Nigeria Europe.',
  },
  'honorary-board': {
    title: 'Honorary Board',
    description:
      'Our honorary board guides the management team in executing the Spotlight Nigeria annual event, a prominent initiative of FON, and in achieving the organisation’s mission, vision and objectives.',
  },
  germany: { title: 'FON Germany Executive Board', description: 'Leading the Friends of Nigeria chapter in Germany.' },
  belux: { title: 'FON Belgium & Luxembourg Executive Board', description: 'Leading the Friends of Nigeria chapter in Belgium and Luxembourg.' },
  france: { title: 'FON France Sub-committee Leads', description: 'Heads of the business, professional and governance committees in France.' },
  nigeria: { title: 'FON Nigeria Liaison Office', description: 'Coordinating operations and communications in Nigeria.' },
};
export const groupOrder = ['executive-board-europe', 'honorary-board', 'germany', 'belux', 'france', 'nigeria'];
