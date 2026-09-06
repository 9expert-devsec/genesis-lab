/**
 * ONE BUNDLE REQUEST → ONE STATUS. Pure.
 *
 * ══ THE PROBLEM THIS SOLVES ════════════════════════════════════════════════
 *
 * The registrations list now shows one row per REQUEST, and the summary cards
 * count requests. A bundle request is N legs, each carrying its own `status`,
 * and an admin may legitimately cancel one leg without cancelling the others —
 * see the `bundle` note on models/RegisterPublic, which rules that the legs are
 * genuinely separate registrations and that no edit may fan out silently.
 *
 * So a request can hold several statuses at once, and the screen has to answer
 * "what state is this request in" with ONE word.
 *
 * ── COUNTING IT ONCE IS THE WHOLE REQUIREMENT ─────────────────────────────
 * A request must land in EXACTLY ONE card. Counting it once per distinct status
 * would make the cards sum to more than the list below them, which is the
 * silent-wrong-number class lib/registrations/listFilter.js exists to prevent
 * and which this screen has already shipped twice. `Σ cards === total` is the
 * invariant, and this function is what makes it expressible.
 *
 * ══ THE PRECEDENCE, AND WHY `cancelled` IS NOT AT THE TOP ══════════════════
 *
 * The obvious order is "cancelled beats everything". It was proposed and it is
 * rejected here for two reasons that are both about what the words MEAN in this
 * system rather than about taste:
 *
 *   1. `cancelled` IS A LOCK, NOT A STAGE. In `updateRegistration` a cancelled
 *      record is frozen — the update filter excludes it, every field is
 *      read-only, and the detail screen withholds every แก้ไข. Filing a request
 *      under ยกเลิก because ONE of its three legs was cancelled would assert
 *      that lock over two legs that are still fully editable. The card would be
 *      making a claim about the record that the record does not honour.
 *
 *   2. IT HIDES LIVE WORK. A three-course request where one course was
 *      cancelled and two are still awaiting a quotation is, to the team that
 *      has to produce that quotation, an OUTSTANDING REQUEST. Filing it under
 *      ยกเลิก moves it out of รอดำเนินการ — the card they work from — and the
 *      work disappears from the screen while still existing.
 *
 * So the rule is:
 *
 *     EVERY leg cancelled  → the request is cancelled
 *     otherwise            → the most advanced status among the LIVE legs,
 *                            by REQUEST_STATUS_PRECEDENCE
 *
 * A request is only cancelled when there is nothing left of it. That is also
 * the only reading under which the ยกเลิก card means what an admin thinks it
 * means: click it and you get requests that are over.
 *
 * ── AND AMONG THE LIVE LEGS, THE MOST ADVANCED WINS ───────────────────────
 * `paid` over `confirmed` over `pending`. Money first: a request with a paid
 * leg has had money change hands, `paid` is system-assigned by the Omise
 * webhook rather than chosen (see `isSystemSet`), and it is the state whose
 * misfiling costs the most. Then `confirmed` — the quotation has gone out —
 * over `pending`, which is the state nothing has happened in yet.
 *
 * ── THE ORDER IS ONE ARRAY AND CHANGING IT IS A ONE-LINE CHANGE ───────────
 * If this ruling is ever revisited, edit `REQUEST_STATUS_PRECEDENCE` and
 * `TERMINAL_STATUSES` and nothing else. The Mongo expression below is BUILT
 * from the same two arrays rather than restating them, so the cards and the
 * rows cannot come to disagree about the order — which is the same
 * one-enumeration rule `SCOPE_PARAMS` and `PUBLIC_STATUSES` are held to.
 *
 * ══ DIVERGENCE IS NEVER HIDDEN ═════════════════════════════════════════════
 *
 * `mixed` comes back beside `status` precisely because a single word is lossy.
 * Every reader that shows the status of a request also has `mixed` available
 * and the list row and the detail page both draw a marker from it. A request
 * filed under one status whose other legs are elsewhere MUST say so — see
 * PublicTable's status cell and the request detail header.
 *
 * Dependency-free apart from the status vocabulary (itself import-free), so the
 * `pure` tier exercises this with nothing stubbed.
 */

import { PUBLIC_STATUS_VALUES } from './statuses';

/**
 * Statuses that mean THE RECORD IS OVER. A request is one of these only when
 * every one of its legs is.
 *
 * An array rather than a scalar so the "all legs terminal" test does not have
 * to be rewritten if a second terminal value ever exists. There is one today.
 */
export const TERMINAL_STATUSES = Object.freeze(['cancelled']);

/**
 * The LIVE ladder, most consequential first. Read top-down; the first member
 * present among the non-terminal legs is the request's status.
 *
 * ══ IF YOU ARE HERE TO PUT `cancelled` AT THE TOP: IT WAS PROPOSED, AND IT
 *    WAS RULED AGAINST. READ THIS FIRST. ══════════════════════════════════════
 *
 * "A request with any cancelled leg is cancelled" is the obvious ordering and
 * it is the one that was asked for. It is wrong in THIS codebase for two
 * reasons that are about what the word already means here, not about taste:
 *
 *   1. `cancelled` IS A LOCK, NOT A STAGE. Look at `updateRegistration`: a
 *      cancelled record is excluded by the update filter, every field is
 *      frozen, and the detail screen withholds every แก้ไข. So filing a request
 *      under ยกเลิก because ONE of its three legs was cancelled makes the card
 *      assert that lock over two legs that are still fully editable. The screen
 *      would be claiming something about the record that the record does not
 *      honour — and an admin who clicked ยกเลิก expecting finished work would
 *      find live work behind it.
 *
 *   2. IT HIDES LIVE WORK. A three-course request with one course cancelled and
 *      two still awaiting a quotation is, to the team that has to produce that
 *      quotation, an OUTSTANDING REQUEST. Cancelled-wins moves it out of
 *      รอดำเนินการ — the card they work from — and the work disappears from the
 *      screen while still existing. That is the same class of defect as a count
 *      that silently excludes rows.
 *
 * A request is therefore cancelled only when there is NOTHING LEFT OF IT, which
 * is also the only reading under which the ยกเลิก card means what an admin
 * thinks it means: click it and you get requests that are over.
 *
 * Nothing is hidden by this either — `mixed` travels beside `status` and the
 * row draws a sub-line naming every status present, so a request filed under
 * รอดำเนินการ with a cancelled course says so.
 *
 * ── AND AMONG THE LIVE LEGS, THE MOST ADVANCED WINS ───────────────────────
 * `paid` over `confirmed` over `pending`. Money first: `paid` is
 * system-assigned by the Omise webhook rather than chosen (see `isSystemSet`),
 * and it is the state whose misfiling costs the most.
 *
 * ── NOT DERIVED FROM `PUBLIC_STATUS_VALUES` ───────────────────────────────
 * That array is in PIPELINE order (pending → confirmed → paid → cancelled),
 * which is the order work moves THROUGH, and this is the reverse question:
 * which state WINS. Deriving one from the other by reversing would be a clever
 * line that breaks silently the day a value is inserted in the middle.
 */
export const REQUEST_STATUS_PRECEDENCE = Object.freeze(['paid', 'confirmed', 'pending']);

/** Is this a terminal (record-is-over) status? */
export function isTerminalStatus(value) {
  return TERMINAL_STATUSES.includes(String(value ?? '').trim());
}

/**
 * The status of ONE request, from the statuses of its legs.
 *
 * @param {Array<string>} legStatuses one entry per leg, in any order. A single
 *   ordinary registration is the one-element case and returns its own status
 *   with `mixed: false` — which is what makes every row on the screen go
 *   through this function rather than only the bundles.
 * @returns {{status: string, mixed: boolean, statuses: string[]}}
 *   `statuses` is the distinct set, in vocabulary order then alphabetical, so a
 *   marker rendering it does not shuffle between reads.
 *
 * Non-array input, or a list with nothing usable in it, returns `status: ''`
 * rather than throwing: this renders inside an admin list, and a shape change
 * upstream must degrade to an unstyled chip rather than blanking the screen —
 * the same ruling `summariseRegistrationsByStatus` makes for the same reason.
 */
export function requestStatusOf(legStatuses) {
  const list = (Array.isArray(legStatuses) ? legStatuses : [])
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);

  const distinct = [...new Set(list)].sort((a, b) => {
    const ia = PUBLIC_STATUS_VALUES.indexOf(a);
    const ib = PUBLIC_STATUS_VALUES.indexOf(b);
    // Known values in vocabulary order; anything unknown after them, alphabetical.
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  if (!distinct.length) return { status: '', mixed: false, statuses: [] };

  const mixed = distinct.length > 1;
  const live = distinct.filter((s) => !isTerminalStatus(s));

  // Nothing live: every leg is over, so the request is.
  if (!live.length) return { status: distinct[0], mixed, statuses: distinct };

  for (const candidate of REQUEST_STATUS_PRECEDENCE) {
    if (live.includes(candidate)) return { status: candidate, mixed, statuses: distinct };
  }

  /**
   * Every live leg holds a value the vocabulary does not know. Report the first
   * one rather than inventing a bucket — the same ruling `summariseByStatus`
   * makes: an unrecognised value is kept LOUDER, never folded into a known one,
   * because a count that quietly reclassifies rows cannot be debugged from a
   * screenshot.
   */
  return { status: live[0], mixed, statuses: distinct };
}

/**
 * THE SAME RULE AS A MONGO EXPRESSION, built from the same two arrays.
 *
 * ══ WHY THIS IS GENERATED AND NOT WRITTEN OUT ══════════════════════════════
 *
 * The counts action cannot call `requestStatusOf` — it counts inside an
 * aggregation, on the server, over documents it never loads. So the rule exists
 * twice by necessity: once in JavaScript for the rows, once in the pipeline for
 * the cards. Two hand-written copies of a precedence order is exactly how the
 * cards and the table come to disagree, which is the defect this whole area of
 * the codebase has been repeatedly repaired for.
 *
 * Generating the `$switch` from `TERMINAL_STATUSES` and
 * `REQUEST_STATUS_PRECEDENCE` means there is still ONE enumeration. Reordering
 * the array reorders the branches; adding a value adds a branch. Neither
 * requires editing this function.
 *
 * ── WHAT THIS FILE CANNOT PROVE ───────────────────────────────────────────
 * The suite has no MongoDB (see test/fs/bundleWritePath for the standing note),
 * so nothing here can execute the expression and compare it to the JS. What IS
 * asserted is that the branch order equals the array — the property that would
 * actually drift. The equivalence of the two implementations on real data is
 * verified by the click-test, which is where it can be verified.
 *
 * @param {string} statusesField an aggregation field path holding the DISTINCT
 *   leg statuses of one request, e.g. `'$statuses'` after a `$addToSet`.
 * @returns {object} an expression evaluating to the request's status
 */
export function requestStatusExpr(statusesField) {
  return {
    $switch: {
      branches: [
        {
          // Every leg terminal ⇒ the request is over. `$setIsSubset` is the
          // "all of these are in that set" test, which is precisely "no live
          // leg remains" without needing a second pass over the array.
          case: { $setIsSubset: [statusesField, TERMINAL_STATUSES] },
          then: { $arrayElemAt: [statusesField, 0] },
        },
        ...REQUEST_STATUS_PRECEDENCE.map((value) => ({
          case: { $in: [value, statusesField] },
          then: value,
        })),
      ],
      // Live legs, none of them a known value. Report the first rather than
      // bucketing it — same ruling as the JS fallback above.
      default: { $arrayElemAt: [statusesField, 0] },
    },
  };
}
