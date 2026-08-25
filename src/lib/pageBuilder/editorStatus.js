/**
 * What the editor's top bar says, and what it offers — as pure functions.
 *
 * Extracted for the reason this repo already states for scheduleStatus: the
 * pure tier can prove the classification, and only a render test can prove a
 * surface CONSUMES it. Splitting them that way also lets the chip's condition
 * be tested against states a server render cannot construct — "the author is
 * typing but nothing is saved yet" needs a dispatch, and this suite mounts no
 * React roots.
 *
 * ── THE TWO FACTS ARE NOT ONE FACT ─────────────────────────────────────────
 * The status badge says what the PUBLIC currently sees (draft / published /
 * scheduled). The draft chip says whether the SERVER is holding content that
 * the public does not see yet. A published page can have a pending draft; a
 * draft-status page can have none. Neither implies the other, which is why they
 * render as two separate chips rather than one merged label.
 */

/** Rounded minutes since a timestamp; `now` is injected so tests are stable. */
function minutesSince(ts, now) {
  return Math.floor((now - ts) / 60000);
}

/**
 * Is the editor mid-write?
 *
 * The OR is the point. `saving` brackets one call; a publish is TWO — a flush
 * and then the promote-to-live — and the flush ends its own save on the way
 * through, so `saving` alone goes false for the whole duration of the second
 * one. `publishing` spans both (see runPublish in savePlan.js).
 *
 * Everything that asks "is the editor busy" must ask THIS, not `state.saving`:
 * the top bar's "กำลังบันทึก…", the save button's disabled state, and — the
 * one that made it matter — the leave guard, which was letting authors walk
 * away in the middle of a publish with no warning at all.
 */
export function isSaving(state) {
  return Boolean(state?.saving || state?.publishing);
}
/**
 * Does the SERVER hold unpublished content?
 *
 * Reads `hadDraft` — the round-4 boolean seeded from the stored document and
 * advanced by a successful content save — and deliberately NOT `contentDirty`,
 * which means only "there are keystrokes in this tab that have not been sent".
 * Keying the chip off contentDirty would make it appear the moment someone
 * typed a character and vanish on the next autosave, which is the opposite of
 * what it claims.
 */
export function hasPendingDraft(state) {
  return state?.hadDraft === true;
}

/**
 * May the author throw the draft away right now?
 *
 * Not while a save is in flight (the discard would race a write that is about
 * to land) and not after a conflict (the stored document has already moved, so
 * "go back to what is published" is no longer a thing this tab can promise).
 */
export function canDiscardDraft(state) {
  return hasPendingDraft(state) && !state?.saving && !state?.conflict;
}

/**
 * The one line under the page title.
 *
 * The precedence is UNCHANGED from before the split — conflict, then saving,
 * then dirty — because those three are about this tab and outrank any statement
 * about the server.
 *
 * ── WHY THE CLEAN CASE FORKED ──────────────────────────────────────────────
 * It used to read "บันทึกอัตโนมัติเมื่อ N นาทีที่แล้ว" for every save, and after
 * the draft/published split that is false for most of them: a content autosave
 * writes a draft and NOTHING becomes public. Saying the same sentence for both
 * would train the author to read every save as harmless — and then an identity
 * save, which renames a slug and busts caches the instant it lands, would be
 * announced in the words used for the harmless one.
 *
 * So the fork is not cosmetic. "(มีผลทันที)" marks exactly the writes the public
 * sees at once: an identity flush, and a publish.
 */
export function statusLine(state, now = Date.now()) {
  const { conflict, saving, contentDirty, identityDirty, lastSavedAt, lastSavedDomains } = state ?? {};

  if (conflict) return '';                       // the conflict banner owns this state
  // isSaving, not `saving`: a publish's promote call runs with `saving` false.
  if (isSaving(state)) return 'กำลังบันทึก…';
  if (contentDirty || identityDirty) return 'ยังไม่ได้บันทึก';
  if (!lastSavedAt) return '';

  const domains = Array.isArray(lastSavedDomains) ? lastSavedDomains : [];
  // 'publish' is its own marker rather than being folded into 'identity': a
  // publish clears no dirty flag (the flush before it already did), so it must
  // not be spelled as a domain that SAVE_OK would clear.
  const immediate = domains.includes('identity') || domains.includes('publish');
  const mins = minutesSince(lastSavedAt, now);

  if (immediate) {
    return mins < 1
      ? 'บันทึกแล้ว (มีผลทันที) เมื่อสักครู่'
      : `บันทึกแล้ว (มีผลทันที) เมื่อ ${mins} นาทีที่แล้ว`;
  }
  return mins < 1
    ? 'บันทึกฉบับร่างอัตโนมัติเมื่อสักครู่'
    : `บันทึกฉบับร่างอัตโนมัติเมื่อ ${mins} นาทีที่แล้ว`;
}
