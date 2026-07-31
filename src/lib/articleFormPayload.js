/**
 * FormData → plain object for the article form.
 *
 * Extracted out of src/lib/actions/articles.js so it can be CALLED by the test
 * tier. It cannot be exported from there: that file is `'use server'`, and Next
 * requires every export of a server-actions module to be an async function — a
 * sync helper exported from it is a build error. Copying it into a test instead
 * would give a fixture that drifts from the real parser, which is exactly the
 * failure mode test/pure/articleFormFieldCoverage.test.mjs exists to catch.
 *
 * ── THE THREE-LAYER COUPLING ────────────────────────────────────────────────
 * A field reaches the database only if ALL THREE of these name it:
 *
 *   1. the form                     — fd.set('x', …) in ArticleForm's submit
 *   2. this parser                  — x: formData.get('x') …
 *   3. src/lib/schemas/article.js   — x: z.…
 *
 * `articleSchema` is a plain `z.object()`, which is in STRIP mode: a key it does
 * not declare is dropped SILENTLY between parse and `$set`. So a control wired
 * through 1 and 2 but not 3 saves nothing, reports success, and shows the old
 * value again after a refresh. No error is raised anywhere along that path.
 *
 * Dependency-free (no next/*, no db, no models) so the `pure` tier can run it.
 */

import { fromLocalInput } from '@/lib/articlePublishTime';

/**
 * @param {FormData} formData
 * @returns {object} the pre-validation payload; every key here must also be
 *   declared in articleSchema or it will be stripped.
 */
export function parseArticleFormData(formData) {
  function jsonArr(key) {
    try {
      const parsed = JSON.parse(String(formData.get(key) ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // datetime-local emits `YYYY-MM-DDTHH:mm`, which is NOT a valid ISO-8601
  // string for Zod's `.datetime()` check, and — worse — is a WALL-CLOCK time
  // with no offset, which ECMAScript reads in the RUNTIME's zone. This module
  // is `'use server'`: on Vercel that runtime is UTC, so 18:00 picked in
  // Bangkok used to be stored as 18:00Z, +7h off, with the calendar date
  // rolling forward for anything picked at 17:00 or later. `fromLocalInput`
  // pins the reading to the site timezone. `.toISOString()` stays because
  // `z.string().datetime()` rejects a value carrying an offset.
  const publishedAtRaw = String(formData.get('publishedAt') ?? '').trim();
  const publishedAt = fromLocalInput(publishedAtRaw);

  // jsonLd ships as a JSON blob — let Zod sanitize it on the way in.
  let jsonLd = {};
  try {
    const parsed = JSON.parse(String(formData.get('jsonLd') ?? '{}'));
    if (parsed && typeof parsed === 'object') jsonLd = parsed;
  } catch {
    jsonLd = {};
  }

  return {
    slug:            String(formData.get('slug') ?? '').trim(),
    title:           String(formData.get('title') ?? '').trim(),
    excerpt:         String(formData.get('excerpt') ?? '').trim(),
    content:         String(formData.get('content') ?? ''),
    coverUrl:        String(formData.get('coverUrl') ?? '').trim(),
    coverPublicId:   String(formData.get('coverPublicId') ?? '').trim(),
    tags:            jsonArr('tags'),
    programs:        jsonArr('programs'),
    skills:          jsonArr('skills'),
    relatedArticles: jsonArr('relatedArticles'),
    relatedCourses:  jsonArr('relatedCourses'),
    articleType:     String(formData.get('articleType') ?? 'article'),
    seoTitle:        String(formData.get('seoTitle') ?? ''),
    seoDescription:  String(formData.get('seoDescription') ?? ''),
    focusKeyword:    String(formData.get('focusKeyword') ?? ''),
    author:          String(formData.get('author') ?? '').trim(),
    publishedAt,
    // Booleans ride as the strings 'true'/'false'. `=== 'true'` makes an ABSENT
    // key read as false, which is the right answer for a checkbox: an unchecked
    // native checkbox posts nothing at all. ArticleForm sets both keys
    // explicitly on every save (as it already did for `active`), so the absent
    // case is only reachable by a caller that does not know the field — and
    // for such a caller the schema, not this line, decides. See the note on
    // showPinBadge's `.default(true)` in src/lib/schemas/article.js.
    active:          formData.get('active') === 'true',
    showPinBadge:    formData.get('showPinBadge') === 'true',
    jsonLd,
    // DELIBERATELY ABSENT: isPinnedOnArticlePage, pinOrder.
    // The form does not own positioning. Those two are cross-row state — the
    // block is numbered by planPromotion/planDemotion in
    // src/lib/articlePositioning.js, which need the WHOLE block to decide a
    // value. Putting them in this payload would let a stale form tab overwrite
    // a position set from the admin list: the classic lost update. Position
    // changes go through setArticlePinned() / moveArticleOneStep() instead,
    // which re-read the block
    // and reuses the same planners. Do not add them here.
  };
}
