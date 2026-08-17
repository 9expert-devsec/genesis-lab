import { z } from 'zod';

/**
 * The excerpt cap. 2000, and the number is argued rather than picked.
 *
 * ── WHAT THIS CAP IS NOT FOR ───────────────────────────────────────────────
 * It is not an editorial length. Every rendering consumer clamps by LINES and
 * is indifferent to the character count: the listing card, the related-article
 * card and the search teaser are `line-clamp-2`, the home blog slider is
 * `line-clamp-3`, and the article-page lead is deliberately unclamped and stays
 * that way. Nothing downstream cares whether this is 300 characters or 900.
 *
 * The previous value — 500 — was not argued at all. It entered in the initial
 * scaffolding commit (57958b9) alongside `title max(200)`, `slug max(200)` and
 * `author max(100)`, a row of round numbers written before any surface existed
 * to constrain them. No comment, no doc and no test ever justified it, and it
 * blocked a team migrating articles whose old-site "คำโปรย" field was unbounded.
 *
 * ── WHAT IT IS FOR: ONE FAILURE MODE ───────────────────────────────────────
 * Catching a MIS-PASTE — an admin dropping an entire article body into the
 * excerpt field, which is easy to do when both are plain textareas stacked on
 * top of each other. That is the only accident a character cap can detect, and
 * an uncapped field has no failure mode anyone notices until it is in
 * production HTML.
 *
 * ── WHY 2000 ───────────────────────────────────────────────────────────────
 * It has to sit ABOVE any legitimate intro and BELOW a typical body. Measured
 * across all 488 articles:
 *   · legitimate excerpts: p95 367, max 497, median 186 (of the 118 non-empty)
 *   · article bodies, plain text with tags stripped: median 2333
 * 2000 clears the observed maximum four times over and still lands below the
 * median body.
 *
 * The four-times headroom is deliberate and is the reason this is not 800. The
 * excerpt sample is SURVIVORSHIP-BIASED: every stored excerpt is under 500
 * precisely because nothing longer could ever be saved. The articles that
 * provoked this change are not in the sample — they failed to save — so the
 * measured distribution systematically understates real demand, by an unknown
 * amount. A cap set snugly above the survivors would block the same team again
 * on the next paste, which is the failure this is meant to end.
 *
 * ── WHAT IT WILL NOT CATCH, STATED PLAINLY ─────────────────────────────────
 * A mis-paste of a SHORT article. 221 of 488 bodies (45.3%) are 2000 plain-text
 * characters or fewer, so pasting one of those in full would pass validation
 * silently. That is accepted: the alternative is a cap low enough to catch them,
 * which is a cap low enough to block real intros, and blocking real work to
 * prevent a recoverable typo is the wrong trade. This is a backstop against the
 * obvious accident, not a validator — the admin still has to look at what they
 * pasted.
 *
 * Raising this later is safe. LOWERING it is not: the same schema guards create
 * AND update (actions/articles.js:382 and :436), so any stored excerpt above a
 * new cap makes its article un-editable, and the admin who hits it will be
 * someone changing a paragraph of the body, blocked by a field they never
 * touched. Constrain DISPLAY instead — see lib/seo/metaDescription.js.
 */
export const ARTICLE_EXCERPT_MAX = 2000;

export const articleSchema = z.object({
  slug:            z.string().trim().min(1).max(200),
  title:           z.string().trim().min(1).max(200),
  excerpt:         z.string().trim().max(ARTICLE_EXCERPT_MAX).default(''),
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