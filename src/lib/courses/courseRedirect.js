/**
 * THE ONE DECISION: does this request render, or redirect to the canonical URL?
 *
 * ══ WHAT THIS ROUND ADDS, AND WHY IT IS THE LAST PIECE ══════════════════════
 * U2 gave every consumer one answer to "what is this course's canonical URL?"
 * (`courseCanonicalPath`). U3 pointed every internal link at it. Both were
 * DECLARATIONS: the canonical tag, the og:url, the JSON-LD and the sitemap all
 * named the alias, while the derived /<code>-training-course kept serving a
 * full 200. A crawler was told which URL to prefer and both URLs answered.
 *
 * This is where the second URL stops answering. The old URL now redirects to
 * the canonical one.
 *
 * ══ ORDERING — U3 BEFORE U4, DELIBERATELY ══════════════════════════════════
 * Because U3 already moved every internal link onto `courseCanonicalPath`,
 * essentially NO internal navigation passes through the redirect this file
 * introduces. It exists for links that are already out in the world — a
 * bookmark, a quotation, an email, a search result — not for the site's own
 * traffic. Doing it in the other order would have made every internal click
 * pay for a round trip.
 *
 * ══ WHY NOT THE REDIRECT PANEL ═════════════════════════════════════════════
 * That panel is exact-match only and fires at the 404 boundary, AFTER
 * everything else has missed. A URL that currently returns 200 never reaches
 * it, so it cannot express this rule at all. Nothing here touches it.
 *
 * PURE: no I/O, no database, no env, no React, no next/navigation. The raising
 * of the redirect belongs to the route (see `courseRedirectFn`); the DECISION
 * lives here so it can be run in a test beside `resolveCourse` rather than
 * inferred from the source of a route no test tier compiles.
 */

import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * ══ THE SWITCH (D2) — TEMPORARY UNTIL CUTOVER ══════════════════════════════
 *
 * `false` → 307 Temporary. `true` → 308 Permanent. One constant, read by every
 * redirect this round adds, so the two cannot drift apart.
 *
 * IT SHIPS TEMPORARY, AND THAT IS NOT TIMIDITY. A permanent redirect is cached
 * by the browser — often indefinitely, and not reliably clearable from our
 * side. Publish a wrong 308 and the people who hit it keep being sent to the
 * wrong page after the code is fixed, with no way to reach them. A wrong 307
 * costs a round trip and is over the moment the deploy lands. The asymmetry is
 * the whole argument: one mistake is recoverable and the other effectively is
 * not, so the recoverable one is the default and permanence is a decision made
 * on purpose, once, when the destination has been watched in production.
 *
 * FLIPPING IT IS A ONE-LINE COMMIT at cutover. Nothing else changes.
 *
 * ══ 307/308, NOT 301/302 (D1) — READ THIS BEFORE "CORRECTING" IT ═══════════
 *
 * An earlier plan said 301. This uses Next's own `redirect()` and
 * `permanentRedirect()`, which emit 307 and 308, and that is deliberate:
 *
 *   · For canonicalisation, 308 and 301 are treated equivalently. Search
 *     engines consolidate signals on both; there is no ranking difference to
 *     buy here.
 *   · 307/308 PRESERVE THE METHOD AND BODY. 301/302 historically let clients
 *     rewrite a POST into a GET, which is the one behavioural difference
 *     between the pairs — and it is a difference in 307/308's favour.
 *   · Emitting a literal 301 from an App Router page means bypassing
 *     `redirect()` for a hand-rolled Response, i.e. a second, custom response
 *     path that exists only to satisfy the wording of a plan. It would have to
 *     be maintained, and it would be the only place in this route that does
 *     not go through the framework.
 *
 * So: fighting the framework for a literal 301 buys nothing and costs a custom
 * response path. If a future round genuinely needs 301, the reason will be
 * something other than the number.
 */
export const COURSE_REDIRECTS_ARE_PERMANENT = false;

/** The status each side of the switch actually emits, for tests and for prose. */
export const COURSE_REDIRECT_STATUS = Object.freeze({ temporary: 307, permanent: 308 });

/**
 * Which of Next's two redirect functions this round's redirects go through.
 *
 * The route passes the real pair in; the switch decides. It is a parameter
 * rather than an import so this module stays pure and so a test can flip the
 * switch AND observe the consequence, instead of reading the constant off the
 * source and believing the route uses it.
 *
 * @param {{redirect: Function, permanentRedirect: Function}} fns
 * @param {boolean} [permanent] defaults to the switch above
 */
export function courseRedirectFn({ redirect, permanentRedirect } = {}, permanent = COURSE_REDIRECTS_ARE_PERMANENT) {
  return permanent ? permanentRedirect : redirect;
}

/**
 * The canonical path to redirect this request to, or null to RENDER IT.
 *
 * @param {object} input
 * @param {string} input.requestedPath  the path as asked for, leading slash included
 * @param {object|null} input.course    the resolved upstream course row
 * @param {object|null} input.extension the resolved CourseExtension row, or null
 * @returns {string|null}
 *
 * ── THE DESTINATION IS `courseCanonicalPath`, NEVER A BUILT STRING ──────────
 * Assembling `/${alias}` here would be a fourth copy of the canonical rule and
 * would eventually disagree with the canonical tag — which is the exact defect
 * U2 existed to remove. The destination of a redirect and the content of the
 * canonical tag must be the same string by construction, not by coincidence.
 *
 * ── THE LOOP GUARD ─────────────────────────────────────────────────────────
 * If the computed destination EQUALS the requested path, this returns null and
 * the page renders. That single equality is what makes every rule in this round
 * safe: the alias URL is already canonical, so it renders; a course with no
 * alias is already at its canonical derived path, so it renders. Without it the
 * canonical URL would redirect to itself and the browser would give up.
 *
 * It also guarantees ONE HOP for every redirect that IS returned. The
 * destination is always the CURRENT canonical path, and a request for that path
 * hits the equality and renders — so no redirect this function issues can point
 * at something that redirects again.
 *
 * ── U4.1: ANY DIFFERENCE, NOT ONLY A CASING ONE ────────────────────────────
 * The predicate is now the whole rule: if the request is not already the
 * canonical path, it redirects there. That one comparison covers every case
 * this round is about, which is why it is a comparison and not a switch on
 * `mode`:
 *
 *   · the CODE url of a course that has an alias  → redirects to the alias
 *   · a request whose CASING differs               → redirects to the stored form
 *   · a FORMER alias (once resolution finds one)   → redirects to the current one
 *   · the canonical url itself                     → renders (the loop guard)
 *   · a course with NO alias, at its derived path  → renders, exactly as before
 *
 * A rule written per-mode would need a new branch for each of those and would
 * eventually grow one that disagrees with the canonical tag. This cannot: the
 * destination IS the canonical tag's own answer.
 */
export function courseRedirectTarget({ requestedPath, course, extension } = {}) {
  const canonical = courseCanonicalPath(course, extension);
  if (!canonical) return null;

  const requested = String(requestedPath ?? '');
  if (!requested.startsWith('/')) return null;

  // THE LOOP GUARD. Already canonical → render, never redirect.
  if (requested === canonical) return null;

  return canonical;
}
