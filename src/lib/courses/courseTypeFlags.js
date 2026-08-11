/**
 * What a submitted course form MEANS by its รูปแบบคอร์ส checkboxes.
 *
 * ── THE DEFECT THIS EXISTS FOR ──────────────────────────────────────────────
 * Unchecking "Public (เผยแพร่บนเว็บ)" and saving left the course public. Traced
 * hop by hop, the value was already wrong the moment the payload was shaped —
 * MSDB stored faithfully what it was sent, which was `true`.
 *
 * The cause was a legacy-compatibility branch whose DISCRIMINATOR read the
 * wrong thing:
 *
 *     const isPublic = explicitPublic != null
 *       ? toBool(explicitPublic)          // new checkbox form
 *       : courseType !== 'inhouse';       // legacy single <select name=course_type>
 *
 * `explicitPublic != null` was meant to ask "did the NEW form post this?".
 * But an unchecked HTML checkbox contributes NOTHING to a form submission —
 * `formData.get('course_type_public')` is `null` for "unchecked" and for "this
 * dialect has no such field", and the two are indistinguishable by value. So
 * every uncheck fell through to the legacy branch, where the new form posts no
 * `course_type` at all, leaving `'' !== 'inhouse'` → **true**. The box could be
 * unchecked but never saved unchecked.
 *
 * `course_type_inhouse` shared the bug and was SAVED BY COINCIDENCE: its legacy
 * fallback is `courseType === 'inhouse'`, and `'' === 'inhouse'` is false — the
 * same answer "unchecked" wanted. One symptom, one lucky sibling, one shape.
 *
 * ── THE SEMANTICS CHOSEN: THE REQUEST DIALECT DECIDES ───────────────────────
 * The discriminator is now the PRESENCE OF THE LEGACY FIELD ITSELF, which is
 * the thing actually being asked about, rather than the value of a checkbox,
 * which cannot answer it:
 *
 *   `course_type` posted  → legacy caller; derive BOTH flags from it and ignore
 *                           the checkboxes (unchanged legacy behaviour).
 *   `course_type` absent  → the checkbox form posted; an absent checkbox key
 *                           means UNCHECKED, which is what HTML means by it.
 *
 * WHY NOT "ABSENT = LEAVE ALONE" for the checkboxes. That is the correct rule
 * for a genuinely partial update, and it is the WRONG rule here, because an
 * HTML checkbox has no way to say "absent": unchecked and omitted are the same
 * wire bytes. Treating absence as "leave alone" would make the five boxes
 * one-way switches that can be turned on and never off — the reported bug,
 * generalised to all five. The form always renders all five, so within this
 * dialect absence is unambiguous.
 *
 * "Leave alone" still exists and is still honoured — for the fields that CAN
 * express it. `program` and `previous_course` are emitted as `undefined`, which
 * `JSON.stringify` drops, so MSDB never sees the key and leaves its value in
 * place. Nothing here changes that, and a test pins it.
 */

/**
 * Is a checkbox's submitted value "on"?
 *
 * Single-sourced here rather than left as a private `toBool` in the server
 * action, because the flags below and the other three status checkboxes must
 * agree about what a checked box looks like, and the caller is a `'use server'`
 * module that cannot export a sync helper for a test to reach.
 */
export function checkboxBool(value) {
  if (typeof value === 'boolean') return value;
  return value === 'on' || value === 'true' || value === '1';
}

/**
 * The two course_type flags a submission means.
 *
 * @param {object} fields — RAW submitted values, `null`/`undefined` when the
 *        key was not submitted at all. Do not pre-coerce: the null-vs-'on'
 *        distinction is the entire input to the decision.
 * @param {string|null} [fields.courseType]   legacy `course_type` select
 * @param {string|null} [fields.publicField]  `course_type_public` checkbox
 * @param {string|null} [fields.inhouseField] `course_type_inhouse` checkbox
 * @returns {{ isPublic: boolean, isInhouse: boolean }}
 */
export function courseTypeFlags({ courseType, publicField, inhouseField } = {}) {
  if (courseType != null) {
    const type = String(courseType).trim();
    return { isPublic: type !== 'inhouse', isInhouse: type === 'inhouse' };
  }
  return {
    isPublic:  checkboxBool(publicField),
    isInhouse: checkboxBool(inhouseField),
  };
}
