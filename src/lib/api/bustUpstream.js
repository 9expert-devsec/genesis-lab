/**
 * The tag vocabulary for every cached upstream read, plus one helper to
 * invalidate a named set. Server-only (`revalidateTag` needs a Next request
 * context).
 *
 * WHY A MODULE AND NOT `revalidateTag('faqs')` INLINE. A tag is a string that
 * has to match on both sides — the `tags:` option on the read in
 * `src/lib/api/*.js`, and the bust on the write. A typo matches nothing,
 * throws nothing, and logs nothing; the read simply keeps serving the cached
 * value until its hour is up. That silence is exactly how the staleness
 * documented in docs/admin-staleness-audit.md survived. Naming the tags once
 * makes a typo a module-resolution error instead of a cache miss, and gives
 * test/pure/upstreamTagBusters.test.mjs one place to compare against.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE, for the sync jobs: a function that
 * reads upstream IN ORDER TO WRITE LOCALLY must bust the source tag BEFORE it
 * reads, not after it writes. Busting afterwards only helps the NEXT run — the
 * current one has already written an up-to-an-hour-old snapshot into Mongo,
 * which is indistinguishable from the upstream row not existing.
 */

import { revalidateTag } from 'next/cache';

/**
 * Every FIXED tag passed to a cached read. Values must match the `tags:`
 * literals in src/lib/api/*.js exactly; the guard test asserts the two sets
 * are equal, so adding a tagged read without adding it here goes red.
 */
export const UPSTREAM_TAGS = Object.freeze({
  PUBLIC_COURSES: 'public-courses',
  PROGRAMS:       'programs',
  SKILLS:         'skills',
  FAQS:           'faqs',
  INSTRUCTORS:    'instructors',
  ONLINE_COURSES: 'online-courses',
  PROMOTIONS:     'promotions',
  CAREER_PATHS:   'career-paths',
  CONTACT_US:     'contact-us',
  SCHEDULES:      'schedules',
  // reviews.js does NOT go through aiFetch — it is a raw fetch against a
  // different host — but it sets a tag the same way, so it lives here too.
  REVIEWS:        'reviews',
});

// ── per-record tags ────────────────────────────────────────────────
// These are built by interpolation at runtime, so they are NOT a fixed
// vocabulary and a static scan can only see their SHAPE. Each read-side
// template has exactly one builder here, and the guard matches them by
// normalised pattern (`course:${x}` → `course:<id>`) rather than by value.

export const courseTag           = (courseId) => `course:${courseId}`;
export const publicCourseTag     = (idOrCode) => `public-course:${idOrCode}`;
export const careerPathTag       = (slug)     => `career-path:${slug}`;
export const courseSchedulesTag  = (objectId) => `schedules:course:${objectId}`;

/** Normalised pattern → builder. Consumed by the guard test. */
export const PER_RECORD_TAG_BUILDERS = Object.freeze({
  'course:<id>':           courseTag,
  'public-course:<id>':    publicCourseTag,
  'career-path:<id>':      careerPathTag,
  'schedules:course:<id>': courseSchedulesTag,
});

/**
 * Invalidate a named set of tags. Accepts strings and/or arrays.
 *
 * Never throws: `revalidateTag` fails outside a request context (a cron tick
 * that runs at module scope, a script), and a cache bust failing must not take
 * down the write that prompted it. Mirrors the try/catch already used in
 * src/lib/actions/schedules.js:35.
 *
 * @returns {string[]} the tags actually busted — so a caller (or a test) can
 *          tell "busted nothing" from "busted everything", which a void
 *          return cannot.
 */
export function bustUpstream(...tags) {
  const wanted = tags.flat().filter((t) => typeof t === 'string' && t.length > 0);
  const busted = [];
  for (const tag of wanted) {
    try {
      revalidateTag(tag);
      busted.push(tag);
    } catch (err) {
      console.warn(`[bustUpstream] revalidateTag(${tag}) failed:`, err?.message ?? err);
    }
  }
  return busted;
}
