import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** News articles and publications. */
const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      category: z.string().default('News'),
      excerpt: z.string(),
      image: image().optional(),
      imageAlt: z.string().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

/** Board members and leadership. `group` decides which board a person appears in. */
const team = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/team' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      group: z.enum([
        'honorary-board',
        'executive-board-europe',
        'germany',
        'belux',
        'france',
        'nigeria',
      ]),
      order: z.number().default(99),
      photo: image(),
      summary: z.string().optional(),
      linkedin: z.string().url().optional(),
      website: z.string().url().optional(),
      showOnHome: z.boolean().optional(),
    }),
});

/** Areas of work shown under "What We Do". */
const areas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/areas' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      headline: z.string(),
      summary: z.string(),
      icon: z.enum(['diaspora', 'support', 'investment', 'training', 'bilateral']),
      image: image(),
      imageAlt: z.string(),
      order: z.number(),
    }),
});

/** Flagship events (Spotlight Nigeria, NIDA). */
const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      shortTitle: z.string(),
      tagline: z.string(),
      summary: z.string(),
      website: z.string().url(),
      since: z.string().optional(),
      image: image(),
      imageAlt: z.string(),
      gallery: z.array(image()).default([]),
      lastEdition: z
        .object({
          name: z.string(),
          date: z.coerce.date(),
          venue: z.string(),
          address: z.string(),
          city: z.string(),
        })
        .optional(),
      highlights: z.array(z.string()).default([]),
      stats: z
        .array(z.object({ value: z.number(), suffix: z.string().optional(), label: z.string() }))
        .default([]),
      statsSource: z.string().optional(),
      order: z.number(),
    }),
});

/** Photo albums documenting past engagements. */
const albums = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/albums' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      yearOnly: z.boolean().default(false),
      type: z.enum([
        'Flagship event',
        'Business & investment',
        'Bilateral engagement',
        'Diaspora engagement',
        'Delegation',
      ]),
      photoCount: z.number().optional(),
      cover: image(),
      photos: z.array(image()),
    }),
});

/** Partner and sponsor logos. */
const partners = defineCollection({
  // The file holds { "partners": [...] } so the CMS can edit it as one list.
  loader: file('./src/content/partners.json', { parser: (text) => JSON.parse(text).partners }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      logo: image(),
      url: z.string().url().nullable().optional(),
      order: z.number().default(99),
    }),
});

export const collections = { news, team, areas, events, albums, partners };
