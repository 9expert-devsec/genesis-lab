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

// ── Draft / published split: the content partition ───────────────────

/**
 * CUSTOM_PAGE_DRAFT_KEYS — the CONTENT half of an Advanced HTML page, and the
 * single definition of it. A published page must not change when the author
 * edits it, so บันทึกฉบับร่าง writes these keys into `draft` on the same
 * document and เผยแพร่ promotes them onto the live fields.
 *
 * ONE definition, exported, because two things need it and they must not be
 * able to disagree: `customPageDraftContentSchema` below (what validates a
 * draft) and lib/pages/customPageDraft.js (what BUILDS and reads one). Same
 * rule, and the same file layout, as DRAFT_CONTENT_KEYS in schemas/pageBuilder.
 *
 * THIRTEEN, where the builder has nine. The two shapes differ — this page type
 * has no sections, theme or chrome toggles, and it has six OG/Twitter fields the
 * builder does not — so the LIST is not shared even though the SEMANTICS are.
 * lib/pages/draftState.js takes the list as a parameter for exactly this reason.
 *
 * ── ogImage AND ogImagePublicId ARE ONE FIELD IN TWO SLOTS ─────────────────
 * They are written by a single control through one `onChange(url, publicId)`
 * call, and `ogImagePublicId` is the Cloudinary ownership token
 * deleteCustomPage destroys the asset with. SPLITTING THEM ACROSS THE PARTITION
 * WOULD ORPHAN AN ASSET: a publish that promoted the new URL while leaving the
 * old token behind would point the page at image B and the delete path at image
 * A, so deleting the page would destroy the wrong file and leak the right one.
 * They move together or not at all. Do not "tidy" one of them to the other side.
 */
export const CUSTOM_PAGE_DRAFT_KEYS = [
  'title',
  'body',
  'metaTitle',
  'metaDescription',
  'canonicalUrl',
  'noIndex',
  'ogTitle',
  'ogDescription',
  'ogImage',
  'ogImagePublicId',
  'ogType',
  'twitterCard',
  'jsonLd',
];

/**
 * CUSTOM_PAGE_LIVE_ONLY_KEYS — everything else in the editable surface.
 * DERIVED, not typed out: exactly `customPageSchema`'s keys minus the draft
 * keys, so the partition is structural. Add a field to customPageSchema and it
 * lands here automatically — and the exact-set test goes red NAMING it, which is
 * the point: a new field must be assigned a side by a human, in the same commit,
 * not defaulted into one silently.
 *
 * These keep taking effect IMMEDIATELY, draft or no draft:
 *   - slug is identity. It has a unique index, a slugHistory trail, a
 *     cross-collection guard (slugGuard checks PageBuilder too) and a public
 *     route; a "draft slug" is a slug the unique index cannot protect. So
 *     renaming a published page's slug still applies at once — a KNOWN,
 *     ACCEPTED limit, exactly as it is for the builder.
 *   - status decides visibility; drafting it would mean a page could not be
 *     unpublished without publishing.
 *   - slugHistory is SERVER-COMPUTED on a rename and is never part of any client
 *     patch. It is live-only for the same reason the builder's is: listing it
 *     anywhere a caller could write would invite one to send it.
 *
 * NOT here, because they are not in the editable surface at all: `previewToken`,
 * `createdBy`, `updatedBy`, timestamps. They are server-managed. previewToken in
 * particular is a CREDENTIAL — a drafted credential is one the preview gate
 * cannot check — and it is not in customPageSchema, so it cannot reach either
 * side of this partition.
 */
export const CUSTOM_PAGE_LIVE_ONLY_KEYS = Object.keys(customPageSchema.shape)
  .filter((k) => !CUSTOM_PAGE_DRAFT_KEYS.includes(k));

/**
 * What validates a draft — PICKED from customPageSchema rather than rebuilt, so
 * a rule change (title's max(200), body's min(1)) reaches the draft path
 * automatically and the two cannot drift.
 *
 * The server-set `savedAt`/`savedBy` stamps are deliberately NOT here: a client
 * must not be able to submit them, which is the same reasoning that keeps
 * previewToken out of customPageSchema entirely.
 */
export const customPageDraftContentSchema = customPageSchema.pick(
  Object.fromEntries(CUSTOM_PAGE_DRAFT_KEYS.map((k) => [k, true]))
);
