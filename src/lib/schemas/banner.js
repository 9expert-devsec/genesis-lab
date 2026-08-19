import { z } from 'zod';
import { ALL_TYPE_IDS } from '@/lib/banners/bannerTypes';

// Allowed Lucide icon names for youtube banner feature tags
export const FEATURE_TAG_ICONS = [
  'Users',
  'TrendingUp',
  'Rocket',
  'Target',
  'Award',
  'Lightbulb',
  'BookOpen',
  'Briefcase',
  'Globe',
  'Cpu',
  'LineChart',
  'Sparkles',
  'GraduationCap',
  'ShieldCheck',
  'Zap',
  'Star',
];

export const bannerSchema = z.object({
  title:           z.string().trim().min(1).max(200),
  // Both the four new ids and the five legacy ones — see the note on the
  // mongoose enum in src/models/Banner.js for why neither set can be dropped
  // until the migration has run.
  //
  // z.enum needs a non-empty TUPLE, not a string[]; ALL_TYPE_IDS is a frozen
  // array, so it is spread into one. The spread also means a stale copy cannot
  // hide here — there is no literal to drift.
  type:            z.enum([...ALL_TYPE_IDS]),
  youtube_id:      z.string().trim().max(20).optional().default(''),
  slide_text:      z.string().max(2000).optional().default(''),
  feature_tags: z
    .array(
      z.object({
        icon:  z.enum(FEATURE_TAG_ICONS).or(z.literal('')).default(''),
        line1: z.string().trim().max(60).optional().default(''),
        line2: z.string().trim().max(60).optional().default(''),
      })
    )
    .max(3)
    .optional()
    .default([]),
  // ── ADDITIVE FIELDS FOR THE FOUR-TYPE REWORK ──────────────────────────────
  // `.optional()` with NO `.default()`, unlike every field around them. A
  // default would make the parsed object carry the key whether or not the form
  // sent it, and `createBanner`/`updateBanner` hand the parse result straight
  // to mongoose — so a default here WOULD start writing these keys onto every
  // saved document. Optional-and-absent keeps a save that does not mention them
  // from mentioning them.
  title_line2:     z.string().trim().max(200).optional(),
  title_highlight: z.string().trim().max(200).optional(),
  subtitle:        z.string().trim().max(300).optional(),
  description:     z.string().trim().max(2000).optional(),
  course_ref: z
    .object({
      upstreamId: z.string().trim().optional().default(''),
      courseId:   z.string().trim().optional().default(''),
      kind:       z.enum(['inclass', 'online']).optional().default('inclass'),
    })
    .optional(),
  article_slug:    z.string().trim().max(300).optional(),

  image_url:       z.string().url().optional().or(z.literal('')).default(''),
  image_public_id: z.string().optional().default(''),
  link_url:        z.string().trim().max(500).optional().default(''),
  link_text:       z.string().trim().max(100).optional().default(''),
  weight:          z.coerce.number().int().default(0),
  active:          z.boolean().default(true),
  starts_at:       z.string().datetime().optional().or(z.literal('')).nullable().default(null),
  ends_at:         z.string().datetime().optional().or(z.literal('')).nullable().default(null),
});
