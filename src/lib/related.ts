import type { Album } from './server/public';

/** Which album types illustrate each area of work. */
const areaAlbumTypes: Record<string, string[]> = {
  'diaspora-engagement': ['Diaspora engagement', 'Delegation'],
  'social-support-and-integration': [],
  'investment-promotion': ['Business & investment', 'Flagship event'],
  'training-and-professional-development': ['Flagship event'],
  'bilateral-engagements': ['Bilateral engagement', 'Delegation'],
};
const areaAlbumSlugs: Record<string, string[]> = {
  'social-support-and-integration': ['educational-partnership-between-nigeria-and-france'],
};

/** Albums (newest first) that illustrate an area of work. */
export function albumsForArea(areaSlug: string, albums: Album[], limit = 3) {
  const slugs = areaAlbumSlugs[areaSlug] ?? [];
  const types = areaAlbumTypes[areaSlug] ?? [];
  return albums
    .filter((a) => slugs.includes(a.slug) || types.includes(a.type))
    .sort((a, b) => b.date.valueOf() - a.date.valueOf())
    .slice(0, limit);
}
