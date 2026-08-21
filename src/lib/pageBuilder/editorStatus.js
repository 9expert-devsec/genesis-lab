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
 * WHO last saved the pending draft — the one line under the draft chip.
 *
 * ── IT READS `draft.savedBy`, AND NOT `updatedBy`, BY MEASUREMENT ─────────
 * Round 33 measured `page.updatedBy` frozen at creation: publishPageStatus
 * never writes it, updatePageBuilderPage has had no live caller since round 3,
 * and the schema has no hooks. So the field that LOOKS like "last edited by"
 * names whoever created the page. Round 2's `draft.savedBy` is stamped on every
 * draft write and is the honest answer to this exact question. The freeze has
 * its own tripwire and is not fixed here.
 *
 * ── WHY IT IS NOT PART OF statusLine ──────────────────────────────────────
 * They are different facts about different subjects. statusLine reports what
 * THIS TAB just did — dirty, saving, saved N minutes ago — and its whole
 * vocabulary is about the local write. This reports an attribute of the STORED
 * draft, and it is true on a page this tab has never written. Folding it in
 * would make one sentence answer two questions, which is the merge round 27
 * refused for the settings dialog's save line.
 *
 * It is deliberately about WHO and not WHEN. "When" is statusLine's idiom, in
 * relative minutes, scoped to this session; reusing that phrasing for a server
 * fact is exactly the second-vocabulary drift to avoid.
 *
 * ── TWO EMPTY CASES, BOTH DELIBERATE ──────────────────────────────────────
 *   · NO PENDING DRAFT — nothing unpublished exists, so nobody last saved one.
 *     The chip this sits beside is absent for the same reason and on the same
 *     condition, so the pair cannot disagree.
 *   · A DRAFT WITH NO NAME — `savedBy` defaults to `{ id: '', name: '' }`, so a
 *     session with no name stamps an anonymous draft. Renders nothing rather
 *     than inventing a category like "unknown user": round 26 declined to draw
 *     the preview dialog's "created by" line for the same reason, and an
 *     invented placeholder is worse than an absent line because it looks like
 *     data.
 */
export function draftSaverLine(state) {
  if (!hasPendingDraft(state)) return '';
  const name = String(state?.draftSavedBy ?? '').trim();
  if (!name) return '';
  return `แก้ไขล่าสุดโดย ${name}`;
}

/**
 * May the author restore an old version into the draft right now?
 *
 * Deliberately NOT canDiscardDraft with a different name. That one requires a
 * pending draft, because there is nothing to discard without one; this one must
 * be available precisely when there is NO draft — restoring onto a clean page
 * is the harmless case and the common one.
 *
 * What it shares with discard is the two states where any write is wrong: not
 * mid-save (the restore would race a write about to land) and not after a
 * conflict (the stored document has already moved, so this tab's token is
 * dead and every write through it will be refused).
 *
 * And it needs an id. An unsaved page has no history to restore FROM, but the
 * check is on the id rather than on the history because the restore writes
 * through saveDraftContent, which requires one.
 */
export function canRestoreVersion(state) {
  return Boolean(state?.pageId) && !state?.saving && !state?.conflict;
}

/**
 * Does restoring a version destroy work that exists nowhere else?
 *
 * TWO different losses, and the restore confirmation has to speak to whichever
 * applies:
 *   · a STORED draft — unpublished content on the server. Overwritten by the
 *     restore, and until Draft Backup exists (round 33 step 6) it is gone.
 *   · LOCAL keystrokes — edits in this tab inside the 5s autosave debounce,
 *     which the reload after a successful restore throws away.
 *
 * Either is enough to make the restore irreversible, so they are OR'd rather
 * than reported separately. The confirmation is shown either way (a restore is
 * always consequential); this decides only whether it warns about loss.
 */
export function restoreWouldLoseWork(state) {
  return hasPendingDraft(state) || Boolean(state?.contentDirty) || Boolean(state?.identityDirty);
}

/**
 * Is there a STORED draft that a Draft Backup could actually preserve?
 *
 * ── WHY THIS IS NARROWER THAN restoreWouldLoseWork, AND MUST BE ────────────
 * That function ORs two losses because either makes a restore irreversible, and
 * the warning has to cover both. This one asks a different question: what can
 * round 37's backup actually SAVE?
 *
 * Only the stored draft. backupDraftBeforeRestore reads the page document on
 * the server; keystrokes sitting in this tab inside the 5s autosave debounce
 * have never been sent, so there is nothing on the server to copy. They are
 * still lost by the reload after a restore, exactly as they were before this
 * round.
 *
 * Keeping the two predicates separate is what lets the dialog offer the backup
 * only when it means something, and say plainly what it does not cover. Folding
 * them together would let the UI promise to preserve work it cannot reach.
 */
export function backupCanPreserve(state) {
  return hasPendingDraft(state);
}

/**
 * The caveat shown when a restore will lose work the backup cannot reach.
 *
 * Empty when there is nothing local pending — the same omit-rather-than-
 * placeholder rule rounds 33, 35 and 36 followed. Kept out of round 34's
 * restoreWarning, whose exact strings are asserted, so this is a SECOND line
 * beside it rather than a rewrite of a guarded sentence.
 */
export function unsavedNotBackedUpNote(state) {
  const localOnly = Boolean(state?.contentDirty) || Boolean(state?.identityDirty);
  if (!localOnly) return '';
  return 'การแก้ไขที่ยังไม่บันทึกในแท็บนี้จะไม่ถูกสำรอง เพราะยังไม่ได้ส่งไปที่เซิร์ฟเวอร์';
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
