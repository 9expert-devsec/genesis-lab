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

/**
 * What KIND of promotion a `pageType: 'promotion'` page is.
 *
 * Meaningless on every other page type, exactly as `promotionId` /
 * `promotionOrder` / `promotionCover` already are — the settings dialog gates
 * all of them behind one `pageType === 'promotion'` branch.
 *
 * `bundle` is declared and has NO UI. That is deliberate rather than an
 * oversight: the vocabulary is decided here in one place, and shipping the
 * value now means the day a bundle surface lands it does not also have to
 * migrate every stored page onto a widened enum. Nothing reads it, and
 * `promotionKind === 'bundle'` renders exactly what `'none'` renders.
 *
 * `none` is the default, so every page stored before this field existed reads
 * back as "not an Early Bird" and the write-through does nothing for it.
 */
export const PROMOTION_KINDS = ['none', 'early_bird', 'bundle'];

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
/**
 * ROUND 80 — types that still VALIDATE and RENDER but are no longer offered in
 * the picker. Re-exported here so callers keep one import site, and NOT
 * subtracted from ALL_SECTION_TYPES below: a retired type must keep parsing, or
 * every stored section of that type fails validation on the next save.
 */
export { RETIRED_SECTION_TYPES } from './sections/layout';

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

/**
 * The Early Bird binding a promotion PAGE owns — course, round, price, deadline
 * and label, at PAGE level rather than inside any section.
 *
 * ── WHY NOT A SECTION ─────────────────────────────────────────────────────
 * The course detail page has to find this, and it cannot scan page sections to
 * do it: it knows a course code and nothing about which page mentions it. So
 * the binding lives where a page-save can see it whole and write it through to
 * `EarlyBirdConfig`, which stays the read model. Sections are content; this is
 * configuration, and it is on the identity side of the draft split for that
 * reason (see IDENTITY_KEYS below).
 *
 * ── TWO IDENTIFIERS, NEITHER AUTHORITATIVE OVER THE OTHER ────────────────
 * CORRECTED. This block used to call `courseRef` "AUTHORITATIVE" and
 * `courseCode` a cache of it. That was the design as first drafted and it is
 * not what shipped: nothing recomputes the code from the ref, the WRITE PATH
 * reads the CODE (it addresses `EarlyBirdConfig.course_id`), and
 * `course-rename` maintains the code as a first-class store
 * (`pageBuilderEarlyBird` in RENAME_STORES). A comment calling the other field
 * authoritative would send the next reader looking for a resolver that does not
 * exist.
 *
 * What is actually true is that upstream is ASYMMETRIC and each identifier is
 * the only one accepted somewhere:
 *
 *   courseCode  addresses `EarlyBirdConfig.course_id`; read by the
 *               write-through; rewritten by `course-rename`.
 *   courseRef   the upstream course ObjectId; the ONLY thing `/schedules`
 *               accepts (`course=<_id>`) — lib/api/schedules.js records that
 *               the code is ignored there, and lib/api/public-courses.js
 *               records the mirror-image fact for `_id` on its own endpoint.
 *
 * So neither derives from the other on any path this code owns, and a binding
 * carrying one without the other is not a partial success: it is a row that
 * either cannot be written or can never show a round. They are written
 * TOGETHER by one setter (EarlyBirdBinding.pickCourse, off one catalogue row)
 * and the refinement below refuses the pair if anything else ever tries.
 *
 * ── EVERY FIELD DEFAULTS TO EMPTY, AND THE BLOCK DEFAULTS TO `{}` ─────────
 * Same shape as `seo` above. A page nobody has bound stores an empty binding
 * rather than a missing key, and `promotionKind` — not the emptiness of this
 * object — is what says whether the binding is meant to do anything. Two ways
 * to spell "no Early Bird" would be two things to keep in agreement.
 *
 * `specialPrice` is nullable rather than 0-defaulted: `0` is a real price (a
 * free course) and `null` is "not set", which is the same distinction
 * `EarlyBirdConfig.special_price` already makes.
 */
export const earlyBirdBindingSchema = z
  .object({
    courseRef:    z.string().trim().default(''), // upstream course ObjectId — AUTHORITATIVE
    courseCode:   z.string().trim().default(''), // display cache only; never the binding
    scheduleId:   z.string().trim().default(''), // the round's upstream _id
    specialPrice: z.number().nullable().default(null),
    deadline:     nullableDate,
    labelTh:      z.string().trim().max(60).default('Early Bird'),
  })
  /**
   * ── BOTH IDENTIFIERS, OR NEITHER ─────────────────────────────────────────
   * The server's half of the pairing. `pickCourse` makes the half-set state
   * unreachable from the panel; this makes it unstorable at all, including by
   * a hand-crafted payload or a directly seeded document that later passes
   * through a save.
   *
   * NEITHER set is the normal empty binding and must stay legal — that is what
   * every page that has no Early Bird stores, and what clearing the selection
   * produces. Only the MIXED pair is refused.
   *
   * `.superRefine` rather than two `.refine`s so ONE message can name which
   * half is missing; an author reading "the binding is invalid" learns nothing
   * they can act on.
   */
  .superRefine((v, ctx) => {
    const ref = String(v?.courseRef ?? '').trim();
    const code = String(v?.courseCode ?? '').trim();
    if (ref === '' && code === '') return; // no binding at all — legal
    if (ref !== '' && code !== '') return; // fully bound — legal
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [ref === '' ? 'courseRef' : 'courseCode'],
      message:
        ref === ''
          ? 'หลักสูตรนี้ยังไม่มีรหัสอ้างอิงสำหรับดึงรอบอบรม — เลือกหลักสูตรจากรายการอีกครั้ง'
          : 'การผูกหลักสูตรไม่สมบูรณ์ (ไม่มีรหัสหลักสูตร) — เลือกหลักสูตรจากรายการอีกครั้ง',
    });
  })
  .default({});

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

  // Promotion KIND + the Early Bird binding. Both are live-only (IDENTITY_KEYS
  // below says why), and both are inert for `pageType !== 'promotion'`.
  promotionKind: z.enum(PROMOTION_KINDS).default('none'),
  earlyBird:     earlyBirdBindingSchema,

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
 * The live-only half splits again, and the split is load-bearing because a
 * DIFFERENT action owns each part:
 *
 *   IDENTITY_KEYS -> updatePageIdentity (round 3)
 *   STATUS_KEYS   -> publishPageStatus  (round 2)
 *   slugHistory   -> nobody. It is SERVER-COMPUTED on a rename and is never
 *                    part of any client patch; listing it here would invite a
 *                    caller to send one.
 *
 * Written out rather than derived from each other because each is a
 * deliberate assignment, not a remainder — and the exact-set tests below the
 * line in test/pure/draftState pin all four groups against the schema, so a
 * new field cannot land in none of them. 9 + 4 + 3 + 1 = 17, asserted.
 *
 * The editor's reducer classifies a page patch by these sets to decide which
 * dirty flag to raise, so they must stay importable from a client component —
 * this module imports only zod, which is what makes that safe.
 */
/**
 * ── `promotionKind` AND `earlyBird` ARE IDENTITY, NOT CONTENT ─────────────
 * The same call `pageType` and `promotionId` above already take, and for a
 * sharper version of the same reason.
 *
 * A page SAVE writes the Early Bird through to `EarlyBirdConfig`, where it
 * reserves a claim on a course that no other page or promotion may then take.
 * If the binding were drafted, the draft and the live row would disagree about
 * something the author cannot see: the draft would say "this page has no Early
 * Bird" while the claim stayed reserved on the live half, and the course would
 * be unavailable to everyone else with nothing on screen explaining why. The
 * reverse is worse — a drafted binding that reserved nothing would let two
 * pages both appear to hold a course until whichever published second was
 * refused, long after the author had stopped looking.
 *
 * So the binding takes effect when it is saved, exactly as a slug does. What
 * the PUBLISH state still controls is `is_active` on the written row: the claim
 * is reserved on save, and the course page only ADVERTISES it once the page is
 * publicly visible. Reserved and advertised are different questions, and this
 * split is what lets them have different answers.
 */
export const IDENTITY_KEYS = [
  'slug', 'pageType', 'promotionId', 'promotionOrder', 'promotionKind', 'earlyBird',
];

export const STATUS_KEYS = ['status', 'publishStartDate', 'publishEndDate'];

/** Server-computed; in no client-facing patch. Named so the partition closes. */
export const SERVER_COMPUTED_KEYS = ['slugHistory'];

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
