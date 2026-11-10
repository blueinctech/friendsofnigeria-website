import type { CollectionEntry } from 'astro:content';

/** Which album types illustrate each area of work. */
const areaAlbumTypes: Record<string, string[]> = {
  'diaspora-engagement': ['Diaspora engagement', 'Delegation'],
  'social-support-and-integration': [],
  'investment-promotion': ['Business & investment', 'Flagship event'],
  'training-and-professional-development': ['Flagship event'],
  'bilateral-engagements': ['Bilateral engagement', 'Delegation'],
};
const areaAlbumIds: Record<string, string[]> = {
  'social-support-and-integration': ['educational-partnership-between-nigeria-and-france'],
};

export function albumsForArea(areaId: string, albums: CollectionEntry<'albums'>[], limit = 3) {
  const ids = areaAlbumIds[areaId] ?? [];
  const types = areaAlbumTypes[areaId] ?? [];
  return albums
    .filter((a) => ids.includes(a.id) || types.includes(a.data.type))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, limit);
}

export const sortByDateDesc = <T extends { data: { date: Date } }>(items: T[]) =>
  [...items].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
