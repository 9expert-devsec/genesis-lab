/**
 * A COURSE KEEPS THE ALIASES IT USED TO HAVE.
 *
 * ══ WHY ═══════════════════════════════════════════════════════════════════
 * U4.1 made the derived /<code>-training-course redirect to the alias, so the
 * alias is now the one URL a course has. That raises the cost of changing it:
 * before this round an alias change broke one of two working URLs; after it,
 * the old alias is simply gone, and every link to it — a quotation, an email,
 * a bookmark, a search result, somebody else's blog post — dies.
 *
 * So the previous alias is recorded when it changes, and resolution falls back
 * to it. Nothing is backfilled: `course_versions` shows NO course has ever
 * changed its alias, so there is nothing to backfill. History starts here.
 *
 * ══ THE CAP, AND WHAT HAPPENS WHEN IT OVERFLOWS ═══════════════════════════
 * Ten. Oldest entries fall off the front.
 *
 * WHY TEN: an alias change is a rare, deliberate admin act — measured at zero
 * occurrences across the entire version history — so ten covers ten renames of
 * a single course, which at the observed rate is effectively unbounded. It also
 * keeps the document small and the `formerAliases` lookup a short multikey
 * index scan rather than an ever-growing array. An uncapped list is a document
 * that only ever grows, and the growth is driven by an admin holding a text
 * box.
 *
 * WHAT OVERFLOW COSTS, said plainly rather than left to be discovered: when a
 * course passes ten alias changes, its ELEVENTH-oldest URL stops redirecting.
 * It does not fall back to anything — it 404s, exactly as an unknown URL does,
 * unless it happens to also be a valid /<code>-training-course. That is a real
 * consequence of the cap and it is the reason the cap is generous rather than
 * tight.
 *
 * PURE: no database, no env, no I/O. The write path calls this and stores what
 * it returns, so the whole rule — including the revert cleanup, which is the
 * part with a loop hiding in it — is testable without a Mongo connection.
 */

import { normaliseAlias } from '@/lib/courses/aliasAvailability';

/** How many former aliases a course keeps. See the header for what overflow costs. */
export const FORMER_ALIAS_CAP = 10;

/**
 * The `formerAliases` array to store, given what is stored and what is being saved.
 *
 * @param {object} input
 * @param {string|null} [input.storedAlias]          the alias currently on the row
 * @param {string[]}    [input.storedFormerAliases]  the history currently on the row
 * @param {string|null} [input.nextAlias]            the alias being saved (already normalised is fine)
 * @param {number}      [input.cap]
 * @returns {string[]} most recent LAST, matching the `formerCodes` convention
 *
 * ══ THE REVERT LOOP — THE REASON THIS IS NOT THREE LINES INLINE ════════════
 * If an alias is changed BACK to a value it previously had (A → B → A), that
 * value must leave the history at the same moment it becomes current. If it did
 * not, `/a` would match BOTH the current alias and the history, and a resolver
 * that consulted the history would be looking at a course whose canonical path
 * is the very URL that was requested — an invitation to redirect a URL to
 * itself, which is the one shape the loop guard exists to refuse.
 *
 * The loop guard would in fact catch it, and the page would render. But relying
 * on that would mean storing a row that is internally contradictory — "the
 * current alias is also a former alias" — and trusting a downstream guard to
 * paper over it forever. So it is fixed HERE, in the write, where the
 * contradiction is created.
 *
 * Order matters and is not arbitrary: the outgoing alias is appended FIRST and
 * the incoming one removed SECOND. For A → B → A that gives [A, B] then [B],
 * which is right. Doing it the other way round on a no-op save (next === stored)
 * would remove the alias and then immediately re-append it.
 */
export function planFormerAliases({
  storedAlias = null,
  storedFormerAliases = [],
  nextAlias = null,
  cap = FORMER_ALIAS_CAP,
} = {}) {
  const current = normaliseAlias(storedAlias);
  const next = normaliseAlias(nextAlias);

  // Normalised and de-duplicated on the way in, so a row written before this
  // function existed — or by hand — cannot carry a shape the rest of the round
  // does not expect. Order is preserved: most recent last.
  const history = [];
  for (const raw of Array.isArray(storedFormerAliases) ? storedFormerAliases : []) {
    const a = normaliseAlias(raw);
    if (a && !history.includes(a)) history.push(a);
  }

  // The outgoing alias joins the history. Moved to the end rather than skipped
  // if it is already there, because "most recent last" is what the cap trims by.
  if (current && current !== next) {
    const at = history.indexOf(current);
    if (at > -1) history.splice(at, 1);
    history.push(current);
  }

  // THE REVERT CLEANUP. Whatever is becoming current leaves the history.
  if (next) {
    const at = history.indexOf(next);
    if (at > -1) history.splice(at, 1);
  }

  // Oldest fall off the front.
  //
  // The `cap > 0` guard is not defensive noise: `slice(-0)` is `slice(0)`, which
  // returns the WHOLE array, so a cap of zero would keep everything — the exact
  // opposite of what it asks for. Caught by the cap-of-zero test, which is why
  // that test exists.
  return cap > 0 ? history.slice(-cap) : [];
}
