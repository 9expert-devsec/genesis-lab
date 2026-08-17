/**
 * Make an unresolvable skill capsule LOUD — on the server, once per distinct
 * skill, and never at the cost of a render.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * `skillCapsuleHref` returns null on a miss and the capsule stays an inert
 * <span>. That is the right USER-facing behaviour — no dead link — and it is
 * also completely silent, which is how the `rpa` slug rot went unnoticed for
 * long enough to ship a soft-404. A capsule that cannot resolve means one of:
 *
 *   · an upstream skill with no SkillPageConfig row (a new skill nobody
 *     configured — the `Design` case on 2026-08-04);
 *   · a row whose `skillId` no longer matches any upstream code (the `RPA`
 *     rename — the row is still published and still orphaned today);
 *   · the slug maps failed to load at all, i.e. degraded mode.
 *
 * All three are worth a line in the server log and none is worth an exception.
 *
 * ── WHAT IT DELIBERATELY DOES NOT SAY ──────────────────────────────────────
 * THE ROUTE. Both capsule renderers are `'use client'` components; they render
 * during SSR (which is why `console.warn` reaches the server log at all) but
 * they have no access to `headers()` or the matched route, and threading a
 * second "where am I" prop through six routes to serve a log line is a worse
 * trade than not having it. `where` is the CARD, which is a constant at each
 * call site, and `courseId` is the locator that actually shortens the search —
 * it names the row carrying the bad reference, which the route does not.
 *
 * Stated rather than left to be discovered, because the round that asked for
 * this asked for the route by name.
 *
 * ── DEDUPE ─────────────────────────────────────────────────────────────────
 * Module-level, so it is per server process rather than per render. Without it
 * a degraded slug map turns every card on /training-course into its own log
 * line — 79 courses × up to 3 capsules — and a flood is read as noise and then
 * filtered, which is the same as having no warning.
 */

const seen = new Set();

/** Exported for the test only; a process-lifetime Set is otherwise untestable. */
export function __resetUnresolvedCapsuleLog() {
  seen.clear();
}

/**
 * @param {object}  args
 * @param {object}  args.skill     the `course.skills[]` subdoc that missed
 * @param {string}  args.where     the rendering component, e.g. 'CourseCard'
 * @param {string} [args.courseId] the course the capsule was drawn on
 */
export function logUnresolvedCapsule({ skill, where, courseId }) {
  // Server only. On the client this is a console line in a visitor's browser
  // saying nothing they can act on, repeated on every hydration.
  if (typeof window !== 'undefined') return;
  if (!skill) return;

  const id = skill.skill_id ?? skill._id ?? skill.skill_name ?? '(no id)';
  const key = `${where}|${id}`;
  if (seen.has(key)) return;
  seen.add(key);

  console.warn(
    `[skill-capsule] no catalog URL for skill ${JSON.stringify(String(id))}` +
      ` (${skill.skill_name ?? 'unnamed'})` +
      ` on ${where}${courseId ? ` course=${courseId}` : ''}` +
      ' — the capsule renders unlinked. Either no published SkillPageConfig row' +
      ' matches this id, or the slug map failed to load.'
  );
}
