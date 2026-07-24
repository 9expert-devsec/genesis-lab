/**
 * Canonical builders for a course's quotation / registration entry points.
 *
 * The formulas mirror the ones inlined in
 * `[...slug]/_components/CourseHero.jsx` (registrationHref / inhouseHref /
 * isInhouseOnly). They live here so other entry points — e.g. the sticky
 * bottom CTA bar — can share the exact same links instead of hand-writing a
 * URL that could drift. CourseHero still has its own inline copy; it was left
 * untouched deliberately, so keep these in sync if that ever changes.
 */

/** Public (open-enrolment) quotation flow. */
export function publicRegistrationHref(courseId) {
  return `/registration/public?course=${String(courseId).toLowerCase()}`;
}

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
