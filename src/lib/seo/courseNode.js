/**
 * THE thin `Course` node, for every listing that names a course in JSON-LD.
 *
 * ══ WHY THIS IS ITS OWN MODULE ══════════════════════════════════════════════
 * Two pages now list the same courses: /training-course (the catalog) and
 * /schedule (the same courses, by round). A crawler reading both and getting two
 * spellings of one course does not see one course described twice — it sees two
 * courses, and neither page's entry resolves to the other. The `@id` is the
 * identity, and an identity is only an identity if it is byte-identical
 * everywhere it appears.
 *
 * So the node is ONE function with ONE caller-visible shape, not a shape each
 * builder assembles from the same ingredients. That distinction is the whole
 * point: two builders composing `{'@type':'Course', '@id': url, …}` from the
 * same helper would agree today and drift the first time one of them gains a
 * field. It is the same argument, and the same failure, as lib/seo/siteUrl.js
 * for the origin and lib/articles/articleUrl.js for the article URL.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ─────────────────────────────────────────
 * No price, no offers, no hasCourseInstance, no image, no provider beyond the
 * `@id` reference. Those belong to the DETAIL page's Course node
 * (lib/courses/buildCourseJsonLd.js), which is the document that actually
 * describes the course in full. Duplicating them across 77 list entries is
 * payload on every listing page plus a second place for them to disagree with
 * the detail page.
 *
 * `hasCourseInstance` is the one thing a caller MAY add on top — /schedule does,
 * because rounds are what that page is about. It is added by the caller rather
 * than accepted as a parameter here so this module has no opinion about, and no
 * coupling to, the round shape.
 *
 * PURE: no I/O, no database, no env, no React.
 */

import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * The absolute canonical URL of one course row, or null when it cannot be named.
 *
 * ── WHY NOT courseLinkHref, WHICH IS THE BRIDGE FOR THIS EXACT ROW SHAPE ────
 * `courseLinkHref(row)` is the adapter that turns a list row's flat `urlAlias`
 * into the `{ urlAlias }` extension object `courseCanonicalPath` wants, and it is
 * what the cards link through. It is the right ADAPTER and the wrong FUNCTION
 * here, for one reason: it never returns null. A course with neither a code nor
 * an alias falls back to `/training-course`, which is correct for an `<a href>`
 * (a visible link to the catalog beats a dead link) and catastrophic in an
 * ItemList — the entry would claim the listing page is a Course.
 *
 * So this reproduces courseLinkHref's ADAPTER — the same one-line
 * `{ urlAlias: row.urlAlias }` object, nothing more — and delegates to the same
 * rule, keeping the null. The alias rule itself is NOT re-derived here; that
 * lives in courseCanonicalPath and this file has no opinion about it.
 *
 * The join cannot double-slash: courseCanonicalPath returns a path with exactly
 * one leading slash, and the base is trimmed. That defect has shipped three
 * times in this repo (the mega menu, the Course JSON-LD, the BreadcrumbList) and
 * is the reason neither side of this join is allowed to be hand-built.
 *
 * @param {object|null} row a course row carrying `course_id` and, optionally,
 *   the flat `urlAlias` that `listPublicCourses` attaches
 * @param {string} base origin, already trimmed of trailing slashes
 * @returns {string|null}
 */
export function courseNodeUrl(row, base) {
  const path = courseCanonicalPath(row, { urlAlias: row?.urlAlias });
  return path ? `${base}${path}` : null;
}

/**
 * The thin `Course` node for one row, or null when the row cannot be described.
 *
 * NULL, NOT A PARTIAL NODE, on either of two failures — no canonical path, or no
 * name. A caller that cannot name the entity must omit the claim rather than
 * emit a broken one, and every caller treats null as "skip this row". Same
 * contract as courseCanonicalPath itself.
 *
 * @param {object|null} row
 * @param {string} siteUrl origin, with or without a trailing slash
 * @returns {{'@type': 'Course', '@id': string, url: string, name: string,
 *   description?: string, provider: {'@id': string}}|null}
 */
export function courseListNode(row, siteUrl, organizationId) {
  if (!row || typeof row !== 'object') return null;

  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const url = courseNodeUrl(row, base);
  if (!url) return null;

  const name = row.course_name;
  if (!name) return null;

  const description =
    typeof row.course_teaser === 'string' ? row.course_teaser.trim() : '';

  return {
    '@type': 'Course',
    /**
     * THE COURSE'S IDENTITY — the canonical URL, and a KNOWN MISMATCH.
     *
     * lib/courses/buildCourseJsonLd.js, which emits the Course node on the
     * detail page, carries NO `@id` at all — it sets `url` (through the same
     * courseCanonicalPath rule) and stops. So a crawler reading a listing and
     * the detail page has an `@id` here and none there, and cannot merge the two
     * by identity; it has to fall back to matching on `url`, which both sides do
     * spell identically.
     *
     * Using the canonical URL as the `@id` is what makes that fallback work and
     * is what a later round would give the detail node too. Adding the `@id`
     * there is the actual fix and it is NOT taken here: the detail page's
     * structured data is out of scope, and changing what 77 course pages emit is
     * its own decision with its own verification. Recorded, not fixed —
     * deliberately the same posture, and the same wording, lib/seo/siteUrl.js
     * used for the origin it could not take.
     */
    '@id': url,
    url,
    name,
    // Omitted ENTIRELY when blank, never emitted as ''. An empty string is a
    // claim that the description is the empty text; a missing key is the
    // absence of a claim. Same rule buildListJsonLd applies to image.
    ...(description ? { description } : {}),
    provider: { '@id': organizationId },
  };
}
