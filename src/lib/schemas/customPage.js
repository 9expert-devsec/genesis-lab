import { z } from 'zod';

export const customPageSchema = z.object({
  // ASCII kebab-case only — decided in spec.
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'slug ต้องเป็น a-z, 0-9 และ - เท่านั้น'),
  title:  z.string().trim().min(1).max(200),
  body:   z.string().min(1, 'กรุณาใส่เนื้อหา'),
  status: z.enum(['draft', 'published']).default('draft'),

  // Basic SEO
  metaTitle:       z.string().trim().max(60).default(''),
  metaDescription: z.string().trim().max(160).default(''),
  canonicalUrl:    z.string().url().optional().or(z.literal('')).default(''),
  noIndex:         z.boolean().default(false),

  // Open Graph
  ogTitle:         z.string().trim().max(100).default(''),
  ogDescription:   z.string().trim().max(200).default(''),
  ogImage:         z.string().url().optional().or(z.literal('')).default(''),
  ogImagePublicId: z.string().default(''),
  ogType:          z.enum(['website', 'article']).default('website'),

  // Twitter
  twitterCard:     z.enum(['summary', 'summary_large_image']).default('summary_large_image'),

  jsonLd: z.object({
    enabled:    z.boolean().default(true),
    schemaType: z
      .enum(['WebPage', 'FAQPage', 'Article', 'BreadcrumbList'])
      .default('WebPage'),
    overrides: z.object({
      name:          z.string().default(''),
      description:   z.string().default(''),
      image:         z.string().default(''),
      datePublished: z.string().default(''),
      dateModified:  z.string().default(''),
    }).default({}),
    rawOverride:        z.string().default(''),
    rawOverrideEnabled: z.boolean().default(false),
  }).default({}),

  slugHistory: z.array(z.string()).default([]),
});
