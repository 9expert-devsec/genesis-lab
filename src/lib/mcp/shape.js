/**
 * Shared shaping for every MCP tool: the origin, the error type, and the two
 * course projections.
 *
 * ── WHY PROJECTIONS AND NOT PASS-THROUGH ───────────────────────────────────
 * Round 1 measured a `/public-course` row at ~11.9 KB average, most of it
 * nested `related_courses` objects, Cloudinary URLs, roadmap images and Mongo
 * bookkeeping. None of that helps a language model answer "what does this
 * course cost and who is it for", and all of it is billed to the caller's
 * context window. The projections below are the measured-useful subset; see
 * docs/mcp/round1-survey.md §5 for the per-field reasoning and the byte counts.
 *
 * ── FIELDS THAT ARE ALWAYS NULL UPSTREAM ARE NOT EMITTED ───────────────────
 * `course_netprice` (null on 77/77), `course_lab_paths` and
 * `course_case_study_paths` (empty on 77/77), `related_online_courses` on a
 * promotion (empty on 21/21). Emitting a key that is always null teaches the
 * model the field exists and invites it to reason about the absence.
 */

import { coursePriceLabel } from '@/lib/coursePriceLabel';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';
import { onlineCourseHref } from '@/lib/onlineCourseHref';

/**
 * The public origin every URL this server emits is rooted at.
 *
 * A LITERAL, not `process.env.NEXT_PUBLIC_SITE_URL`. The env var is what THIS
 * deployment is reachable at — on a preview build that is a vercel.app host,
 * and a preview handing a model a vercel.app course link would put a
 * non-canonical URL in front of a customer. The canonical origin is a fact
 * about the business, not about the deployment.
 */
export const SITE_ORIGIN = 'https://www.9experttraining.com';

/**
 * A tool-level refusal the model is meant to read and act on.
 *
 * Distinguished from a thrown `Error` so the registration layer can turn it
 * into an `isError` tool result with the text intact, rather than a generic
 * 500 that tells the model nothing. Everything a caller can get wrong — an
 * unknown skill, a course id that does not exist — surfaces through this.
 */
export class McpToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'McpToolError';
  }
}

/** Absolute URL for a public (classroom) course, alias-aware. */
export function publicCourseUrl(course) {
  // `listPublicCourses` attaches `urlAlias` to every row (see
  // lib/courses/hiddenCourses.js attachAliases), and courseCanonicalPath is
  // what decides whether the alias or the derived path wins. Passing the row's
  // own alias through keeps this server agreeing with the sitemap and the
  // canonical tag rather than re-deriving a second spelling of the same page.
  const path = courseCanonicalPath(course, course?.urlAlias ? { urlAlias: course.urlAlias } : null);
  return path ? `${SITE_ORIGIN}${path}` : null;
}

/** The program name, from either a populated object or a bare string. */
function programName(program) {
  if (!program) return null;
  if (typeof program === 'string') return program;
  return program.program_name ?? null;
}

/** Skill names, from the populated `skills` array. */
function skillNames(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.map((s) => (typeof s === 'string' ? s : s?.skill_name)).filter(Boolean);
}

/**
 * A public course as a SEARCH RESULT — the short card.
 *
 * `price_label` rather than a number, via the repo's own `coursePriceLabel`:
 * a course with no public seat price is inhouse-only, and that is a fact to
 * state, not a zero to print. Emitting `0` here would have the model tell a
 * customer the course is free.
 */
export function publicCourseCard(course) {
  return {
    course_id: course?.course_id ?? null,
    name: course?.course_name ?? null,
    type: 'public',
    teaser: course?.course_teaser ?? null,
    program: programName(course?.program),
    skills: skillNames(course?.skills),
    training_days: course?.course_trainingdays ?? null,
    training_hours: course?.course_traininghours ?? null,
    price_label: coursePriceLabel(course?.course_price),
    url: publicCourseUrl(course),
  };
}

/**
 * An online course as a SEARCH RESULT.
 *
 * ── `o_course_price`, AND `o_course_netprice` IS NOT EMITTED ANYWHERE ───────
 * TRACED, not assumed. `OnlineCourseCard`'s `PriceDisplay`
 * (src/app/_components/home/OnlineCourseCard.jsx:304-324) renders `netPrice`
 * with `line-through` and `price` in bold beside it: `o_course_price` is the
 * number a customer pays and `o_course_netprice` is the struck-through
 * before-price. The names read the other way round, which is exactly why this
 * is written down here — round 1 flagged it as an open question precisely
 * because a reader who trusts the field NAME quotes the wrong number.
 *
 * So this emits the payable price only. Shipping both would hand a model two
 * numbers, no labels, and a 50% chance of quoting the higher one.
 */
export function onlineCourseCard(course) {
  return {
    course_id: course?.o_course_id ?? null,
    name: course?.o_course_name ?? null,
    type: 'online',
    teaser: course?.o_course_teaser ?? null,
    program: programName(course?.program),
    skills: skillNames(course?.skills),
    lessons: course?.o_number_lessons ?? null,
    training_hours: course?.o_course_traininghours ?? null,
    price_label: coursePriceLabel(course?.o_course_price),
    url: onlineCourseHref(course),
  };
}

/** Drop null/empty entries so a trimmed payload has no dead keys. */
export function dropEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
