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

// ── Draft / published split: the content partition ───────────────────

/**
 * DRAFT_CONTENT_KEYS — the CONTENT half of a page, and the single definition
 * of it. A published page must not change when the author edits it, so
 * autosave writes these keys into `draft` on the same document and pressing
 * เผยแพร่ promotes them onto the live fields.
 *
 * ONE definition, exported, because two things need it and they must not be
 * able to disagree: `draftContentSchema` below (what validates a draft) and
 * lib/pageBuilder/draftState.js (what BUILDS and reads one). Same rule as
 * PLACEHOLDER_SLUG and SECTION_STYLE_CAPS.
 */
export const DRAFT_CONTENT_KEYS = [
  'title',
  'sections',
  'theme',
  'showHeader',
  'showFooter',
  'showStickyCta',
  'seo',
  'jsonLd',
  'promotionCover',
];

/**
 * LIVE_ONLY_KEYS — everything else in the editable surface. DERIVED, not
 * typed out: it is exactly `pageBuilderSchema`'s keys minus the draft keys,
 * so the partition is structural. Add a field to pageBuilderSchema and it
 * lands here automatically — and the exact-set test in test/pure/draftState
 * goes red NAMING it, which is the point: a new field must be assigned a
 * side by a human, in the same commit, not defaulted into one silently.
 *
 * These keep taking effect IMMEDIATELY, draft or no draft:
 *   - slug is identity. It has a unique index, a slugHistory trail, a
 *     cross-collection guard and two public routes; a "draft slug" is a slug
 *     the unique index cannot protect. So renaming a published page's slug
 *     still applies at once — a KNOWN, ACCEPTED limit of this work.
 *   - pageType is routing. /promotions queries `pageType: 'promotion'`, and
 *     it gates both the cross-collection slug guard and promotionMode. It
 *     also gates promotionId/promotionOrder, which are live-only: a drafted
 *     pageType would let a draft say "not a promotion" while the live
 *     promotionId kept the page on the grid.
 *   - status and the publish window decide visibility; drafting them would
 *     mean a page could not be unpublished without publishing.
 *
 * NOT here, because they are not in the editable surface at all: `preview`,
 * `createdBy`, `updatedBy`, timestamps. They are server-managed — see the
 * previewSchema note above, which is the same precedent that keeps the
 * draft's own `savedAt`/`savedBy` stamps out of draftContentSchema.
 */
export const LIVE_ONLY_KEYS = Object.keys(pageBuilderSchema.shape)
  .filter((k) => !DRAFT_CONTENT_KEYS.includes(k));

/**
 * draftContentSchema — validates a draft's content. DERIVED from
 * pageBuilderSchema by .pick(), never retyped, so a rule change on a field
 * (a max length, an enum member, a regex) reaches the draft surface with no
 * second edit. A hand-written twin with the same keys would pass a
 * key-set test and drift on the rules — that is the failure this shape rules
 * out, and test/pure/draftState proves it behaviourally.
 *
 * WHAT IS DELIBERATELY ABSENT: the server-managed stamps `savedAt` and
 * `savedBy`. A stored draft carries them alongside the content, but they are
 * set in the action layer (round 2) and must never be part of an editable,
 * client-submitted surface — exactly the reasoning that keeps `preview` out
 * of pageBuilderSchema. effectiveContent() drops them for the same reason.
 */
export const draftContentSchema = pageBuilderSchema.pick(
  Object.fromEntries(DRAFT_CONTENT_KEYS.map((k) => [k, true]))
);
