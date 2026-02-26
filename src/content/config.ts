import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    tags: z.array(z.string()),
    readTime: z.string(),
    featured: z.boolean().default(false),
    seoKeywords: z.array(z.string()).default([]),
    pillar: z.string().optional(),
    format: z.string().optional(),
    heroImage: z.string().optional(),
  }),
});

export const collections = { blog };
