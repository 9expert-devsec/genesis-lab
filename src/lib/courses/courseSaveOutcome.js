/**
 * What ONE save button that writes TWO stores is allowed to claim.
 *
 * The course editor saves the MSDB course body and the genesis-side
 * CourseExtension (SEO, alias, gallery). They are separate services — an HTTP
 * call to another system and a local Mongo upsert — so "the save worked" is not
 * a single fact, and there is no transaction that could make it one.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * Success is the JOINT condition and nothing less. `allOk` is true only when
 * both halves returned ok, and it is the only thing the UI may treat as a
 * success: it gates navigating away, resetting, and any "บันทึกสำเร็จ".
 *
 * A half-landed save is reported as a half-landed save, naming WHICH half, and
 * the form stays exactly as the admin left it so the retry costs them nothing.
 * The failure this prevents is the quiet one: an editor that says "saved",
 * navigates away, and leaves the meta description behind.
 *
 * Extracted from the component because it is the one claim in this screen that
 * must never regress, and a `'use server'`-adjacent client component is not
 * something a test can call. `{ ok: true }` is the ONLY success shape — a
 * thrown error, a null, an `{ ok: false }` and an undefined are all failures,
 * because a server action that dies returns nothing and "not obviously broken"
 * must never read as "fine".
 */
export function courseSaveOutcome({ courseResult, extResult } = {}) {
  const courseOk = courseResult?.ok === true;
  const extOk = extResult?.ok === true;

  return {
    courseOk,
    extOk,
    /** The ONLY success signal. Never `courseOk || extOk`. */
    allOk: courseOk && extOk,
    /** True when exactly one half landed — the case that needs naming. */
    partial: courseOk !== extOk,
    courseError: courseOk ? null : courseResult?.error ?? null,
    extError: extOk ? null : extResult?.error ?? null,
  };
}
