/**
 * WHICH email to send, decided once, as a value.
 *
 * ── THE DEFECT THIS MODULE EXISTS FOR ───────────────────────────────────────
 * Each of the three registration senders used to carry a mutable boolean:
 *
 *     let sentViaTemplate = false;
 *     if (alias) { … if (!result?.error) sentViaTemplate = true; }
 *     if (!sentViaTemplate) { … await sendEmail(…); }
 *
 * Delete that last `if` — or forget to set the flag on one branch — and the
 * customer receives BOTH the Postmark template mail and the hard-coded HTML.
 * The fs-tier guard could not see it: it counts CALL SITES, and a double send
 * has exactly the same two call sites as a correct one. The invariant lived in
 * a boolean that any edit could desynchronise from the sends it governed.
 *
 * So the boolean is gone and the decision is a VALUE. `decideSendPlan` returns
 * exactly one tagged outcome and there is no shape in which it can say "both":
 *
 *     { via: 'template' }
 *     { via: 'html', reason: 'no_alias' }
 *     { via: 'html', reason: 'template_failed' }
 *
 * `via` is a single field. Two sends would require two plans, and each sender
 * calls this once. Same move as planMoveToPosition in src/lib/articlePositioning
 * — the planner decides, the caller applies, and the illegal state has no
 * spelling rather than being merely discouraged.
 *
 * ── WHAT THIS DOES AND DOES NOT ELIMINATE, PRECISELY ────────────────────────
 * It does not make a second `sendEmail` call physically impossible — nothing in
 * JavaScript can, and a caller that ignores the plan entirely is still a caller
 * that can send twice. What it removes is the class of defect that actually
 * occurred: a FLAG that has to be kept in agreement with the control flow. The
 * failure mode of getting it wrong is inverted. Forgetting to set the old
 * boolean sent TWO emails; forgetting to pass `templateOutcome` here yields
 * `template_failed`, which sends ONE — the fallback — because a customer with a
 * duplicate is a support ticket and a customer with nothing is a lost sale.
 *
 * PURE: no env, no I/O, no `new Date()`. The caller reads the alias and performs
 * the send; this only decides.
 */

/** The two delivery paths. `via` is the tag; there is deliberately no third. */
export const VIA_TEMPLATE = 'template';
export const VIA_HTML = 'html';

/** Why the HTML fallback was chosen. Only ever present when `via` is 'html'. */
export const REASON_NO_ALIAS = 'no_alias';
export const REASON_TEMPLATE_FAILED = 'template_failed';

/**
 * @param {object} p
 * @param {string|undefined} p.alias  the POSTMARK_TEMPLATE_ALIAS_* value, or
 *   falsy when unset. A blank alias is the per-template rollout switch, not a
 *   failure, and is reported as such so the caller can log at info.
 * @param {'sent'|'failed'|undefined} p.templateOutcome  the result of the
 *   attempt the caller makes when `alias` is set. Anything that is not the
 *   literal 'sent' — including `undefined` from a caller that never attempted —
 *   is treated as a failure, because that direction still delivers a mail.
 * @returns {{via:'template'}|{via:'html', reason:'no_alias'|'template_failed'}}
 */
export function decideSendPlan({ alias, templateOutcome } = {}) {
  if (!alias) return { via: VIA_HTML, reason: REASON_NO_ALIAS };
  if (templateOutcome !== 'sent') return { via: VIA_HTML, reason: REASON_TEMPLATE_FAILED };
  return { via: VIA_TEMPLATE };
}

/**
 * Is `value` one of the three canonical plans, and nothing else?
 *
 * Exported so the pure tier can assert that a plan permitting BOTH sends — a
 * `{ via: 'both' }`, a `{ template: true, html: true }`, a `{ via: 'template',
 * alsoSendHtml: true }` — is rejected rather than merely unusual. A guard that
 * only checks `via` would pass every one of those, because they all either
 * carry a valid `via` or none at all.
 *
 * The extra-key check is the load-bearing half: it is how a second delivery
 * instruction would be smuggled in alongside a valid tag.
 */
export function isSendPlan(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();

  if (value.via === VIA_TEMPLATE) {
    // A template plan carries NO reason — a reason here would mean the fallback
    // was also decided upon.
    return keys.length === 1 && keys[0] === 'via';
  }
  if (value.via === VIA_HTML) {
    return (
      keys.length === 2 &&
      keys[0] === 'reason' &&
      keys[1] === 'via' &&
      (value.reason === REASON_NO_ALIAS || value.reason === REASON_TEMPLATE_FAILED)
    );
  }
  return false;
}
