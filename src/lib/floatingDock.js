// src/lib/floatingDock.js
//
// The path rules the bottom-right floating dock obeys. Pure, so they can be
// tested without a DOM and without a router — and, more importantly, so there is
// ONE place to read them. They used to live inline inside ScrollToTopButton.jsx,
// where the only way to find out what they were was to read a template literal
// in a className.
//
// ── TWO LISTS, AND THEY ARE NOT THE SAME LIST ───────────────────────────────
// DOCK_HIDDEN_PREFIXES   — the whole dock does not render.
// LAUNCHER_HIDDEN_ROUTES — the dock renders, but the chat launcher does not.
//
// They sit side by side deliberately: the difference is the entire point and is
// invisible if they live in different files. Back-to-top is welcome on a payment
// page; a chat panel that takes over the screen with a scroll lock is not.
//
// They are also INDEPENDENT. /admin is deliberately ABSENT from the launcher
// list even though no launcher appears there, because the launcher renders
// INSIDE the dock — when the dock returns null nothing inside it exists. Listing
// /admin twice would be one rule written in two places, which is the shape of
// defect that let the chat rate limiter release its window in two places and
// hid a broken guard behind the other copy. Composition does that job here, and
// a test pins it.

/**
 * Route prefixes the whole dock is absent from.
 *
 * /admin is internal, authenticated UI: it has its own chrome, and public
 * marketing furniture floating over it would be wrong in both directions.
 */
export const DOCK_HIDDEN_PREFIXES = ['/admin'];

/**
 * Routes where the dock renders but the chat launcher does not.
 *
 * THE RULE, so a future entry can be judged rather than guessed: hide the
 * launcher where the user has already committed to a specific enrolment or
 * purchase and is in the middle of completing it. Not "any form" — /contact-us
 * is a form where chat is a SUBSTITUTE for filling it in, and hiding the
 * launcher there would invert the intent.
 *
 * Why it matters on exactly these pages: the panel is a full-screen overlay
 * that locks body scroll, so opening it mid-form risks the user's progress; on
 * mobile the launcher sits within a thumb's reach of the submit control; and a
 * payment step must not offer a competing modal.
 *
 *   /registration           both wizards (public + in-house), step 1 form →
 *                           step 2 review/pay → step 3 confirmation. PII and
 *                           Omise card/PromptPay entry. Excluded as ONE task:
 *                           step boundaries are an implementation detail the
 *                           user does not perceive, and a per-step list would
 *                           drift the first time the steps are renumbered.
 *   /masterclass/⁎/register masterclass enrolment + payment. Also renders its
 *                           own fixed bottom bar, which the launcher would
 *                           land on top of.
 *   /masterclass/payment    the Omise 3DS return page — it polls and redirects.
 *                           Transient and machine-driven; a launcher there
 *                           invites a click that navigates away mid-settlement.
 *   /career-path-register   enrolment form for a named programme. PII, and a
 *                           choice the user has already made.
 *
 * DELIBERATELY NOT HERE: /preview/[slug]. A preview exists to show an editor
 * what the live page looks like, and one that hides chrome the live page has is
 * a preview that lies.
 */
export const LAUNCHER_HIDDEN_ROUTES = [
  '/registration',
  '/masterclass/*/register',
  '/masterclass/payment',
  '/career-path-register',
];

/**
 * THE ONE MATCHER. Both predicates below use it; do not write a second.
 *
 * Segment-aware prefix matching with `*` standing for exactly one segment.
 *
 *   '/admin'                 matches /admin and /admin/anything,
 *                            NOT /administrators or /admin-guide
 *   '/masterclass/*\/register' matches /masterclass/excel-101/register
 *                            NOT /masterclass/excel-101
 *
 * SEGMENTS, NOT CHARACTERS, and that is the whole reason it exists: a bare
 * `startsWith('/admin')` would also swallow `/administrators` — a URL nobody
 * has today, which is exactly why that bug would ship unnoticed.
 *
 * The wildcard is here because one real route cannot be written without it:
 * /masterclass/[slug]/register puts a dynamic segment in the MIDDLE, so no
 * prefix can express it. The alternative was a second matcher for "ends with
 * this segment", and two matchers for one question is the duplication this
 * module's header already warns about.
 */
export function matchesRoutePattern(pathname, pattern) {
  if (typeof pathname !== 'string' || typeof pattern !== 'string') return false;
  const parts = pathname.split('/');
  const wanted = pattern.split('/');
  if (wanted.length > parts.length) return false;
  for (let i = 0; i < wanted.length; i += 1) {
    if (wanted[i] === '*') continue;
    if (wanted[i] !== parts[i]) return false;
  }
  return true;
}

/**
 * Whether the dock renders at all on `pathname`.
 *
 * An unusable pathname RENDERS. `usePathname()` always returns a string inside
 * the App Router, so this branch is defensive rather than reachable, but the
 * direction matters: not knowing where we are is not evidence that we are in
 * the admin. Losing the dock across the whole public site is a real regression;
 * a back-to-top button flashing on an admin page is cosmetic.
 */
export function shouldRenderFloatingDock(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return true;
  return !DOCK_HIDDEN_PREFIXES.some((pattern) => matchesRoutePattern(pathname, pattern));
}

/**
 * Whether the chat launcher renders on `pathname`.
 *
 * Same fail-open direction as the dock, and for a stronger reason: an unknown
 * path is not evidence of a payment flow, and a missing launcher is invisible —
 * nobody files a bug about a button they never saw.
 */
export function shouldRenderChatLauncher(pathname) {
  if (typeof pathname !== 'string' || pathname === '') return true;
  return !LAUNCHER_HIDDEN_ROUTES.some((pattern) => matchesRoutePattern(pathname, pattern));
}

/**
 * Whether the dock lifts clear of a page's own mobile bottom bar.
 *
 * `includes`, not a prefix test, and that is inherited behaviour rather than a
 * fresh decision — it is why this one rule does NOT go through
 * matchesRoutePattern. Measured: it fires on /masterclass/[slug]/register and
 * on nothing else in the tree, because "registration" does not contain
 * "register" (regist-R-ation vs regist-E-r).
 *
 * THE STRING REASONING ABOVE IS RIGHT; THE CONCLUSION THAT USED TO FOLLOW IT
 * WAS WRONG. It said the registration wizards have no bottom bar, so missing
 * them was harmless. They do have one: ReviewAndPayStep renders
 * Step2MobileBar (fixed inset-x-0 bottom-0 z-30 lg:hidden) on step 2 of
 * /registration/*, and this predicate does not match there — so for every
 * mobile session on that step the dock sat on that bar's controls, unlifted.
 * That is now fixed by the bar PUBLISHING its occupied box to
 * viewportBottomInset, not by widening this predicate.
 *
 * Which leaves the two mechanisms side by side on purpose, for now: this
 * static lift serves /masterclass/[slug]/register, and the measured clearance
 * serves everything else. They must not both serve the same bar — the dock
 * would double-count and float roughly 200px up — which is why
 * Step2MobileBar's publishing is opt-in and the masterclass register call site
 * deliberately does not opt in. Retiring this predicate in favour of the
 * measured clearance is the end state, and is a separate call with its own
 * click-testing; rewriting it as a pattern would change which pages lift and
 * is likewise separate.
 */
export function dockLiftsForBottomBar(pathname) {
  return typeof pathname === 'string' && pathname.includes('/register');
}
