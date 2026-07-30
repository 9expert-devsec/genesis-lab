import { z } from 'zod';

export const articleSchema = z.object({
  slug:            z.string().trim().min(1).max(200),
  title:           z.string().trim().min(1).max(200),
  excerpt:         z.string().trim().max(500).default(''),
  content:         z.string().min(1, 'กรุณาใส่เนื้อหา'),
  coverUrl:        z.string().url().optional().or(z.literal('')).default(''),
  coverPublicId:   z.string().default(''),
  // Tags keep the casing the admin typed (Thai/English mixed) — the
  // public surfaces compare them case-sensitively.
  tags:            z.array(z.string().trim()).default([]),
  programs:        z.array(z.string().trim()).default([]),
  skills:          z.array(z.string().trim()).default([]),
  relatedArticles: z.array(z.string()).default([]),   // ObjectId strings
  relatedCourses:  z.array(z.string().trim()).default([]),
  articleType:     z.enum(['article', 'video']).default('article'),
  seoTitle:        z.string().trim().max(60).default(''),
  seoDescription:  z.string().trim().max(160).default(''),
  focusKeyword:    z.string().trim().default(''),
  author:          z.string().trim().max(100).default(''),
  publishedAt:     z.string().datetime().optional().or(z.literal('')),
  active:          z.boolean().default(true),
  // Pin BADGE only — never positioning. `isPinnedOnArticlePage` and `pinOrder`
  // are deliberately NOT declared here: this schema is the form's write
  // contract, and the form does not own the block's numbering (see
  // src/lib/articleFormPayload.js). Adding either one hands the save button
  // ownership of cross-row state.
  //
  // `.default(true)` covers a DIFFERENT case from parseArticleFormData's
  // `=== 'true'`. There, absent means "checkbox unticked" → false. Here, absent
  // means "the caller does not know this field exists" → keep the badge, which
  // matches shouldShowPinBadge treating an absent value as ON. The form always
  // sends the key, so in practice this default never fires.
  showPinBadge:    z.boolean().default(true),

  jsonLd: z.object({
    enabled:    z.boolean().default(true),
    schemaType: z
      .enum(['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'])
      .default('Article'),
    overrides: z.object({
      headline:      z.string().default(''),
      description:   z.string().default(''),
      image:         z.string().default(''),
      authorName:    z.string().default(''),
      datePublished: z.string().default(''),
      dateModified:  z.string().default(''),
    }).default({}),
    rawOverride:        z.string().default(''),
    rawOverrideEnabled: z.boolean().default(false),
  }).default({}),
});