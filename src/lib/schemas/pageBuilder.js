import { z } from 'zod';

import {
  layoutSectionSchemas, LAYOUT_TYPES,
} from './sections/layout';
import {
  contentSectionSchemas, CONTENT_TYPES,
} from './sections/content';
import {
  cardSectionSchemas, CARD_TYPES,
} from './sections/cards';
import {
  dynamicSectionSchemas, DYNAMIC_TYPES,
} from './sections/dynamic';
import {
  advancedSectionSchemas, ADVANCED_TYPES,
} from './sections/advanced';
import { SECTION_REF } from './sections/base';

/**
 * pageBuilder.js — the SINGLE SOURCE OF TRUTH for PageBuilder validation
 * (MANIFESTO §4.6). Client forms, server actions, and route handlers all
 * import from here. This file assembles the per-type section schemas from
 * the sections/ directory into one discriminated union, and owns the
 * page-level shape + the model-level enum vocabularies.
 *
 * This module imports only `zod` (never the mongoose model), so it is safe
 * to import from client components — the admin UI pulls its dropdown
 * vocabularies from here, and the PageBuilder model imports its enums from
 * here, so mongoose never reaches the browser bundle.
 */

// ── Model-level enum vocabularies (single source) ────────────────────

export const PAGE_TYPES = [
  'promotion', 'landing', 'course_landing', 'bundle',
  'masterclass', 'event', 'general', 'thank_you',
];

export const PAGE_STATUSES = ['draft', 'scheduled', 'published', 'closed', 'archived'];

// §7 Page Theme. `default` = 9Expert Blue. Each maps to a CI token bundle.
export const PAGE_THEMES = [
  'default', 'promotion_blue', 'early_bird_orange', 'ai_purple',
  'corporate_navy', 'light_minimal', 'dark_premium',
];

// Supported JSON-LD @types. Review / AggregateRating are intentionally
// absent and must NEVER be emitted.
export const JSONLD_TYPES = [
  'WebPage', 'BreadcrumbList', 'Course', 'Offer',
  'FAQPage', 'Article', 'Event', 'Organization',
];

// ── Section type registry (re-exported from the category files) ──────

export {
  LAYOUT_TYPES, CONTENT_TYPES, CARD_TYPES, DYNAMIC_TYPES, ADVANCED_TYPES,
};

/** Every declared MVP section type, flat. */
export const ALL_SECTION_TYPES = [
  ...LAYOUT_TYPES, ...CONTENT_TYPES, ...CARD_TYPES, ...DYNAMIC_TYPES, ...ADVANCED_TYPES,
];

// Re-export the preset vocabularies + preview schema so callers have one
// import site (the admin UI and Tailwind class maps import from here).
export {
  CONTAINER_WIDTHS, SPACING, BACKGROUNDS, COLUMNS, RATIOS,
  MOBILE_BEHAVIORS, VISIBILITY, ACCENTS, CARD_STYLES, BUTTON_STYLES,
} from './sections/base';

// ── Section union ────────────────────────────────────────────────────

/**
 * The discriminated union over all 27 MVP section types. Discriminant is the
 * section `type`; each member validates its own `content` shape (see the
 * sections/ files). A section whose `type` is not a declared MVP type fails
 * validation here.
 */
export const sectionSchema = z.discriminatedUnion('type', [
  ...layoutSectionSchemas,
  ...contentSectionSchemas,
  ...cardSectionSchemas,
  ...dynamicSectionSchemas,
  ...advancedSectionSchemas,
]);

// Publish the assembled union to the lazy ref so container `content.children`
// (see sections/base.js childSections) can validate nested sections. Must run
// AFTER the union is built; resolves lazily at parse time.
SECTION_REF.schema = sectionSchema;

// ── Page-level sub-schemas ───────────────────────────────────────────

// SEO surface — mirrors CustomPage's constraints, grouped under one object.
export const seoSchema = z
  .object({
    metaTitle:       z.string().trim().max(60).default(''),
    metaDescription: z.string().trim().max(160).default(''),
    canonicalUrl:    z.string().url().optional().or(z.literal('')).default(''),
    noIndex:         z.boolean().default(false),
    ogTitle:         z.string().trim().max(100).default(''),
    ogDescription:   z.string().trim().max(200).default(''),
    ogImage:         z.string().url().optional().or(z.literal('')).default(''),
    ogImagePublicId: z.string().default(''),
    ogType:          z.enum(['website', 'article']).default('website'),
    twitterCard:     z.enum(['summary', 'summary_large_image']).default('summary_large_image'),
  })
  .default({});

/**
 * JSON-LD config. `rawOverride` is a developer-tier escape hatch — the
 * action layer strips it (and preserves the stored value) for lower tiers,
 * same as advanced.customHtml. Generation itself is a later phase.
 */
export const jsonLdSchema = z
  .object({
    mode:               z.enum(['auto', 'manual', 'off']).default('auto'),
    types:              z.array(z.enum(JSONLD_TYPES)).default([]),
    rawOverride:        z.string().default(''),        // developer-tier only
    rawOverrideEnabled: z.boolean().default(false),
    validationStatus:   z.enum(['valid', 'warning', 'error', 'disabled', 'unchecked']).default('unchecked'),
    validationMessage:  z.string().default(''),
  })
  .default({});

/**
 * Preview block. NOT part of pageBuilderSchema below — the preview link is
 * managed by dedicated actions (enablePreviewLink / setPreviewExpiry / …),
 * never by the main page form, and `passwordHash` is set server-side from a
 * bcrypt hash. Exported here so those actions validate against one shape.
 */
export const previewSchema = z.object({
  enabled:           z.boolean().default(false),
  passwordHash:      z.string().default(''),
  passwordUpdatedAt: z.date().nullable().default(null),
  expireDate:        z.date().nullable().default(null),
  status:            z.enum(['active', 'expired', 'disabled']).default('disabled'),
  failedAttempts:    z.number().int().min(0).default(0),
  lockedUntil:       z.date().nullable().default(null),
});

// Nullable date that treats '' / null / undefined as null and otherwise
// passes the value through (Mongoose casts ISO strings → Date on save).
const nullableDate = z
  .preprocess((v) => (v === '' || v == null ? null : v), z.union([z.string(), z.date(), z.null()]))
  .default(null);

// ── The page schema ──────────────────────────────────────────────────

/**
 * The editable page surface — what the create/update form submits and the
 * actions validate. Server-managed fields (createdBy/updatedBy, preview,
 * synced audit) are NOT here; they're set in the action layer.
 */
export const pageBuilderSchema = z.object({
  // ASCII kebab-case only — same rule as CustomPage.
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'slug ต้องเป็น a-z, 0-9 และ - เท่านั้น'),
  title:    z.string().trim().min(1).max(200),
  pageType: z.enum(PAGE_TYPES).default('general'),
  status:   z.enum(PAGE_STATUSES).default('draft'),

  theme:         z.enum(PAGE_THEMES).default('default'),
  showHeader:    z.boolean().default(true),
  showFooter:    z.boolean().default(true),
  showStickyCta: z.boolean().default(false),

  publishStartDate: nullableDate,
  publishEndDate:   nullableDate,

  // Links to an MSDB Promotion.promotion_id — only meaningful for
  // pageType === 'promotion'. Kept permissive (may be empty until linked): an
  // EMPTY promotionId on a promotion page = a standalone/Genesis promotion, a
  // NON-EMPTY one = the MSDB-anchored detail link (see promotionMode.js).
  promotionId: z.string().trim().default(''),

  // Promotion mode (Phase 1) — parity with the model. `promotionOrder` is the
  // shared grid sort key; `promotionCover` is an uploaded cover image's secure
  // URL ONLY (no publicId token — option B, see the model + PageSettingsDialog).
  promotionOrder: z.number().int().default(0),
  promotionCover: z.string().trim().default(''),

  sections: z.array(sectionSchema).default([]),

  seo:    seoSchema,
  jsonLd: jsonLdSchema,

  slugHistory: z.array(z.string()).default([]),
});
