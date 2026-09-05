/**
 * WHAT A REQUEST-LEVEL STATUS CHANGE WILL ACTUALLY DO. Pure.
 *
 * ══ WHY THIS EXISTS SEPARATELY FROM THE ACTION ═════════════════════════════
 *
 * A quotation is issued for the PACKAGE, so its status is a fact about the
 * request rather than about one course — and the request-level control
 * therefore moves every leg. That is a FAN-OUT, and the standing ruling on
 * `bundle` in models/RegisterPublic forbids widening a per-document edit into
 * one silently. What it sanctions instead is
 *
 *     "a SEPARATE, EXPLICIT 'apply to every leg of this request' action that
 *      says what it is about to touch"
 *
 * — and "says what it is about to touch" is this module. The SCREEN renders the
 * plan into a confirmation before the click; the ACTION derives the ids it will
 * write from the same function. One rule, two readers, so the sentence the
 * admin agreed to and the write that follows cannot describe different sets.
 *
 * ══ A TERMINAL LEG IS SKIPPED, NEVER OVERWRITTEN ═══════════════════════════
 *
 * `cancelled` is terminal — it has no outgoing edge in the transition table, so
 * nothing can move a leg back out of it, INCLUDING this control. Setting every
 * leg from a mixed state would therefore destroy a cancellation that could not
 * be restored by the same screen.
 *
 * So the plan applies the SAME per-leg rule the single-document action applies:
 * a leg is moved only if the table permits its current status to reach the
 * target. A cancelled leg simply does not qualify, by construction rather than
 * by a special case naming `cancelled`.
 *
 * REFUSING THE WHOLE ACTION WHEN THE LEGS DIFFER WAS CONSIDERED AND REJECTED. A
 * request with one cancelled course is an ordinary state and the other two
 * still need quoting; refusing would rebuild the "frozen at รอดำเนินการ"
 * problem for the commonest divergent case, which is the defect this control
 * exists to fix.
 *
 * ══ THE SKIP REASONS ARE THREE, AND THEY ARE NOT INTERCHANGEABLE ═══════════
 *
 *   already      the leg is already in the target state. Not a refusal — there
 *                is simply nothing to do, and saying "cannot" about it would be
 *                a lie the admin would try to work around.
 *   terminal     the leg is in a state with no way out. Permanent.
 *   not-allowed  the table does not permit THIS move from THAT state — e.g.
 *                `confirmed → confirmed` is `already`, but a future
 *                `confirmed → pending` would land here. Temporary in principle:
 *                a different target may be permitted.
 *
 * `terminal` is strictly a subset of "the table permits nothing", but it is
 * reported separately because the SENTENCE differs: "this course is cancelled
 * and will not change" is a different thing to tell an admin than "this course
 * cannot make that particular move".
 *
 * Dependency-free apart from the status vocabulary and the transition table,
 * both of which are import-free, so the `pure` tier exercises this with nothing
 * stubbed — and the CLIENT can import it to render the confirmation.
 */

import { PUBLIC_STATUS_TRANSITIONS, allowedTransitions } from './statuses';
import { isTerminalStatus } from './requestStatus';

/** Why a leg is not being moved. The one enumeration. */
export const SKIP_REASONS = Object.freeze(['already', 'terminal', 'not-allowed']);

/**
 * @param {object} p
 * @param {Array<object>} p.legs every leg of the request — `_id`, `status` and
 *   `courseName` are read. The order is preserved into `changing`/`skipped`, so
 *   the confirmation lists courses in the order the page shows them.
 * @param {string} p.to the target status
 * @param {Record<string,string[]>} [p.table] the transition table; defaults to
 *   the public one because a bundle is a public-registration shape and there is
 *   no in-house equivalent.
 * @returns {{
 *   to: string,
 *   changing: Array<{_id: any, courseName: string, status: string}>,
 *   skipped:  Array<{_id: any, courseName: string, status: string, reason: string}>,
 *   ok: boolean,
 * }}
 *   `ok` is "there is at least one leg to move". A plan that changes nothing is
 *   NOT an error — it is a control the screen should not have offered — but the
 *   action refuses on it rather than performing a write of zero documents and
 *   filing audit rows for it.
 */
export function planBundleStatusChange({ legs, to, table = PUBLIC_STATUS_TRANSITIONS } = {}) {
  const target = String(to ?? '').trim();
  const list = Array.isArray(legs) ? legs : [];

  const changing = [];
  const skipped = [];

  for (const leg of list) {
    if (!leg || typeof leg !== 'object') continue;
    const status = String(leg.status ?? '').trim();
    const entry = {
      _id: leg._id,
      // The course is how an admin tells one leg from another: every leg of a
      // request shares a coordinator, a date and a package name.
      courseName: String(leg.courseName ?? '').trim() || String(leg.courseCode ?? '').trim(),
      status,
    };

    if (!target) { skipped.push({ ...entry, reason: 'not-allowed' }); continue; }
    if (status === target) { skipped.push({ ...entry, reason: 'already' }); continue; }
    if (isTerminalStatus(status)) { skipped.push({ ...entry, reason: 'terminal' }); continue; }

    // THE SAME QUESTION THE SINGLE-DOCUMENT ACTION ASKS, per leg. Not a
    // reimplementation: `allowedTransitions` is the one predicate both sides
    // read, so a move this plan promises is a move the write can make.
    if (!allowedTransitions(status, table).includes(target)) {
      skipped.push({ ...entry, reason: 'not-allowed' });
      continue;
    }

    changing.push(entry);
  }

  return { to: target, changing, skipped, ok: changing.length > 0 };
}
