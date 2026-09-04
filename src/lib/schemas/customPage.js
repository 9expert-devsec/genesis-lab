import { z } from 'zod';

/**
 * CUSTOM_PAGE_TYPES — the Advanced HTML page-type vocabulary. TWO values, where
 * the Page Builder's PAGE_TYPES has eight, and the difference is measured
 * rather than stylistic.
 *
 * ── WHY NOT z.enum(PAGE_TYPES) ────────────────────────────────────────────
 * Every `pageType` reference in src/ was swept before this list was written.
 * Outside `'promotion'`, NOTHING anywhere reads a specific pageType value. The
 * only other reader is the builder admin list's generic facet
 * (`if (pageType) filter.pageType = …` in lib/actions/pageBuilder.js), and
 * getCustomPages has no such filter. So `landing`, `course_landing`, `bundle`,
 * `masterclass`, `event` and `thank_you` would be, on a CustomPage, values that
 * literally nothing reads — and a type nothing reads is a type that does not
 * ship. They are also section-composition vocabularies: `bundle` and
 * `course_landing` name a LAYOUT OF SECTIONS, and an Advanced HTML page is one
 * raw body with no sections to arrange.
 *
 * Sharing PAGE_TYPES would also let the model store a value the UI never offers
 * — reachable by a hand-crafted submission — which is the same
 * claim-with-no-source this editor refuses elsewhere.
 *
 * ── NO promotionId, AND THIS IS THE REASON ────────────────────────────────
 * An Advanced HTML promotion is ALWAYS standalone (Genesis-owned): it has its
 * own card and its own /promotions/<slug>, and it can never be the authored
 * detail for an MSDB Promotion.
 *
 * The reason is not "nothing would read it". It is that
 * `setPromotionPageLink` (lib/actions/promotions.js) enforces one-page-per-
 * promotion with a collection-wide `PageBuilder.updateMany` that clears any
 * other page pointing at the same promotion_id. Adding `promotionId` to
 * CustomPage WITHOUT rewriting that enforcement would silently downgrade the
 * invariant to one-page-per-promotion-PER-COLLECTION: a single MSDB promotion
 * could hold a builder page and an Advanced HTML page at once, with nothing
 * anywhere able to detect it. A box nobody reads is inert; a uniqueness
 * invariant that has quietly stopped holding is not.
 *
 * WHAT WOULD HAVE TO CHANGE FIRST, so the reader after this one finds the door
 * and not just the wall: `setPromotionPageLink` would have to clear the link
 * across BOTH collections in one operation, `getLinkablePromotionPages` and
 * `getPageBuilderPagesByPromotionIds` would have to return a union carrying
 * which collection each row came from, and PromotionsAdminClient's page lookup
 * would have to key on that pair rather than on an id alone. That is a design
 * change to the MSDB linking surface, not a field addition — do it there, then
 * come back here.
 */
export const CUSTOM_PAGE_TYPES = ['general', 'promotion'];

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

  // ── Promotion mode ────────────────────────────────────────────────
  // `pageType: 'promotion'` moves this page's public home to
  // /promotions/<slug>, puts a card on the /promotions grid, and turns the bare
  // slug into a 308 to the new home. The other two are only meaningful while it
  // is set; they are stored unconditionally rather than cleared on the way out,
  // so flipping a page to โปรโมชัน and back does not silently destroy an order
  // and a cover the author picked.
  pageType:       z.enum(CUSTOM_PAGE_TYPES).default('general'),
  promotionOrder: z.coerce.number().int().default(0),
  promotionCover: z.string().url().optional().or(z.literal('')).default(''),
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
 * FOURTEEN, where the builder has nine. The two shapes differ — this page type
 * has no sections, theme or chrome toggles, and it has six OG/Twitter fields the
 * builder does not — so the LIST is not shared even though the SEMANTICS are.
 * lib/pages/draftState.js takes the list as a parameter for exactly this reason.
 *
 * ── promotionCover IS CONTENT, AND IT DRAFTS ──────────────────────────────
 * The fourteenth, added with promotion mode, and it takes the same side as the
 * builder's `promotionCover` for the same reason: it is the card's image, which
 * is published material. Drafting it means the live /promotions grid keeps
 * showing the published cover until เผยแพร่ — which is what "a published page
 * must not change when the author edits it" means for a page whose most visible
 * surface is a card somebody else's page renders.
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
  'promotionCover',
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
 *   - pageType is ROUTING, and here it is routing three times over. See below.
 *   - promotionOrder is an ARRANGEMENT of the grid, not content of this page. An
 *     admin who reorders expects the order to move; a drafted order would need a
 *     publish on this page before another page's position changed. Same side as
 *     the builder's, for the same reason.
 *
 * ── WHY pageType IS LIVE-ONLY, AND WHY THE REDIRECT MAKES THAT STRONGER ───
 * The builder calls pageType routing. On a CustomPage it has three readers and
 * every one of them reads the STORED LIVE value:
 *
 *   1. getActiveCustomPagePromotions queries `pageType: 'promotion'` in Mongo.
 *      A Mongo filter cannot see inside a Mixed `draft` blob at all, so a
 *      drafted pageType would be UNQUERYABLE, not merely delayed.
 *   2. The catch-all's redirect arm reads the STRIPPED public page, so a drafted
 *      pageType would have been removed before it was read. Drafting it could
 *      not change what the route does — only what the editor implies about when
 *      it takes effect.
 *   3. THE DECISIVE ONE — the slug guard. checkPromotionSlugAvailable is GATED
 *      on `pageType === 'promotion'`. Drafted, the guard would run against the
 *      draft value while the stored value stayed `general`, and at publish the
 *      type would flip onto live with NO re-check — the exact window in which a
 *      Genesis promotion and an MSDB url_slug both claim one /promotions/<slug>.
 *      Live-only closes it structurally: the guard runs on every save that
 *      submits `promotion`, including the save that flips it.
 *
 * THE CONSEQUENCE AN AUTHOR WILL MEET, stated here so they meet it in a comment
 * first: flipping a PUBLISHED page to โปรโมชัน takes effect IMMEDIATELY. Its
 * bare URL starts redirecting and its card appears on /promotions, while the
 * body edits in the same save stay in the draft and the public keeps reading the
 * published body. That is what live-only means, and it is exactly what the
 * builder does (updatePageIdentity writes pageType live).
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
