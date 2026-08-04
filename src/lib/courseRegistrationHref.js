/**
 * Canonical builders for a course's quotation / registration entry points.
 *
 * The formulas mirror the ones inlined in
 * `[...slug]/_components/CourseHero.jsx` (inhouseHref / isInhouseOnly). They
 * live here so other entry points — e.g. the sticky bottom CTA bar — can share
 * the exact same links instead of hand-writing a URL that could drift.
 * CourseHero still has its own inline copy; it was left untouched deliberately,
 * so keep these in sync if that ever changes.
 *
 * There was a `publicRegistrationHref` here too. It had no callers and built
 * `/registration/public?course=<id>` with no `&class=`, which since the step-1
 * confirm-skip is a meaningful distinction: a round-specific CTA built on it
 * would silently hand the user back the extra confirm click. Deleted rather
 * than left lying around. Every live public entry point builds its own URL and
 * appends the chosen round — pinned by
 * test/fs/registrationEntryPointClassParam.
 */

/** In-house (private, quote-only) flow. */
export function inhouseRegistrationHref(courseId) {
  return `/registration/in-house?course=${String(courseId).toLowerCase()}`;
}

/**
 * course_price === 0 (or missing) means inhouse-only: no public price, no
 * public schedule. Matches CourseHero / CourseDetail exactly.
 */
export function isInhouseOnly(course) {
  return !course?.course_price || Number(course.course_price) === 0;
}
