import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
/**
 * IS THIS BUNDLE ACCEPTING REGISTRATIONS? One definition, two readers.
 *
 * ── WHY A MODULE FOR ONE EXPRESSION ───────────────────────────────────────
 * The same argument `bundlePricing.js` makes for `isInvertedPrice`: the value
 * of the function is not the arithmetic, it is that the readers CANNOT
 * DISAGREE. There are two of them and they sit on opposite sides of the
 * network:
 *
 *   the RENDERER   (components/pageBuilder/sections/promotion_bundle.jsx)
 *                  draws the register button, or the closed message instead.
 *   the FORM       (the bundle quotation request) decides whether to accept a
 *                  submission at all.
 *
 * A page that shows the closed message while the form still takes a quotation
 * is the exact failure the round brief names: a closed bundle registerable
 * through a stale link. The link is user input and a person can keep one in a
 * bookmark long after the promotion ended, so the two answers are not merely
 * expected to agree — the form's answer is the only one that is load-bearing,
 * and the renderer's is what a visitor was told.
 *
 * ── `!== false`, NEVER TRUTHINESS. READ BEFORE "SIMPLIFYING". ─────────────
 * This field can only ever REMOVE the button, so anything other than a literal
 * `false` an author wrote has to leave the bundle OPEN.
 *
 * A `.lean()` read applies no Mongoose defaults and JSON drops `undefined`, so
 * the key arrives ABSENT from every section stored before it existed — and
 * absent must mean open, or a switch nobody touched would close every stored
 * bundle at once. Rounds 39, 50, 57 and 69 each paid for a version of this;
 * `chooseRounds` carries the same warning about `source !== 'manual'`.
 *
 * `content?.registrationOpen` alone would also close a bundle whose key is
 * `0`, `''` or `null` — three values an author cannot type but a bad write
 * could store, and each of them would silently retire a live promotion.
 *
 * Pure and dependency-free — no React, no db, no clock — so the server
 * renderer and the form's guard can both import it, and so it can be exercised
 * in the `pure` tier.
 *
 * @param {object|null|undefined} content a `promotion_bundle` section's content
 * @returns {boolean} true unless the author explicitly closed it
 */
export function isBundleRegistrationOpen(content) {
  return content?.registrationOpen !== false;
}

/**
 * ── THE TWO REFUSALS A VISITOR CAN BE SHOWN, AND WHY THEY ARE DIFFERENT ───
 *
 * They live here, beside the predicate, because the same two readers need
 * them: the section renders the closed one in place of its button, and the
 * quotation form renders one or the other in place of its whole self. A string
 * spelled twice is a page and a form telling one visitor two things.
 *
 * `BUNDLE_CLOSED_MESSAGE` moved here from promotion_bundle.jsx, where it was a
 * module-private const with a note explaining that it is fixed rather than an
 * author field. That note stays at the renderer; this is the same string with
 * a second reader.
 *
 * ── THEY ARE NOT INTERCHANGEABLE ──────────────────────────────────────────
 *
 *   CLOSED       an author has turned this bundle's registration OFF. A
 *                DECISION WAS MADE — and that is the whole of what it means.
 *
 *                It does NOT mean the promotion has ended, and neither this
 *                string nor the sub-line beneath it may say so. The switch gets
 *                flipped for ordinary reasons: the rounds are full, the offer is
 *                paused, the terms are being revised, the page is mid-edit. The
 *                site cannot tell which, so it states the observable and points
 *                at the people who know. (The sub-line on the refusal page used
 *                to read 'โปรโมชันนี้สิ้นสุดแล้ว' and was wrong for exactly this
 *                reason.)
 *   UNAVAILABLE  the bundle is still open as far as its switch is concerned,
 *                but the site cannot presently assemble it — the page has been
 *                unpublished, the section is disabled, or one of its courses or
 *                rounds no longer resolves. That is a fault on our side and it
 *                may well be fixed within the hour, so the sentence says
 *                "ขณะนี้" and points at the sales team rather than telling the
 *                visitor the offer is over.
 *
 *   EXPIRED      the promotion's own publish window has PASSED. This one is not
 *                a fault and is not temporary: the offer had an end date and
 *                the date is behind us.
 *
 * Collapsing them would make an unpublished page read as a cancelled
 * promotion, which is a claim we have no business making, and would leave the
 * visitor with no reason to call.
 *
 * ── WHY EXPIRED IS ITS OWN STRING, AND WHAT IT WAS BEFORE ─────────────────
 * It used to be folded into UNAVAILABLE, and the paragraph above used to list
 * "or has expired" among that message's causes. That was wrong in the mirror
 * image of the way CLOSED was once wrong.
 *
 * UNAVAILABLE opens with "ขณะนี้ยังไม่สามารถ…" — AT THIS TIME we cannot YET —
 * which promises the visitor a fix and invites them to come back. For an
 * unpublished page or an unresolved round that is honest. For a promotion whose
 * `publishEndDate` has passed it is not: nothing is going to be fixed, the offer
 * ended on a date the business chose, and telling that customer to wait sends
 * them to keep checking a page that will never reopen.
 *
 * So EXPIRED states the ending plainly and still points at the sales team,
 * because "this offer ended" and "there is nothing for you" are different
 * sentences and only the first one is true — there may well be a current
 * promotion, and the person who knows is on the phone.
 *
 * It is NOT the CLOSED wording either. CLOSED is a DECISION someone took with
 * the switch and may reverse on Monday; EXPIRED is a DATE that has passed. An
 * admin reading "ปิดรับสมัคร" would go looking for a switch to flip and find it
 * already on, which is the confusion this third string exists to prevent.
 */
export const BUNDLE_CLOSED_MESSAGE = 'โปรโมชันนี้ปิดรับสมัครแล้ว';

export const BUNDLE_UNAVAILABLE_MESSAGE =
  'ขณะนี้ยังไม่สามารถรับลงทะเบียนแพ็กเกจนี้ได้ กรุณาติดต่อทีมขายเพื่อสอบถามรายละเอียด';

export const BUNDLE_EXPIRED_MESSAGE = 'โปรโมชันนี้สิ้นสุดแล้ว';

/**
 * Why a round cannot be picked, in Thai, for a visitor.
 *
 * ── ONE MAP, READ BY THE CARD AND THE WIZARD ──────────────────────────────
 * Exported rather than inlined because the wizard says the same six things
 * beside its disabled options, and a visitor told "เต็ม" on the card and
 * something else in the form has been told nothing. `PICK_REASONS` pins the
 * vocabulary, so a reason with no text here cannot ship silently.
 */
export const PICK_REASON_TEXT = Object.freeze({
  closed: 'ปิดรับ',
  full: 'เต็ม',
  started: 'เริ่มแล้ว',
  deadline_passed: 'หมดเวลาเลือก',
  previous_not_picked: 'ต้องเลือกรอบของหลักสูตรก่อนหน้าก่อน',
  before_previous: 'เริ่มก่อนหลักสูตรก่อนหน้าจบ',
});

/**
 * The state message when no complete set of picks exists (R5).
 *
 * Distinct from `BUNDLE_CLOSED_MESSAGE`, which is the author's switch. This one
 * is the schedule's answer: every course may have rounds and still no valid
 * combination, which is a different fact and a different sentence. It shares
 * the switch's SLOT and styling, because to a visitor both mean "not today".
 */
export const BUNDLE_NO_ROUNDS_MESSAGE = 'ยังไม่มีรอบที่เปิดรับครบทุกหลักสูตร';

/**
 * ── THE LABEL FOR ONE OFFERED ROUND, AND WHY IT IS SHARED ──────────────────
 *
 * Dates from whichever source has them — the LIVE row first, then the stored
 * snapshot — and a Thai sentence when neither does. It never returns an id.
 *
 * ── THE BUG THIS REPLACES, MEASURED ──────────────────────────────────────
 * The editor rendered `6a0578e52cf974910f88cdf8 (รอบเดิม)` for a real round.
 * Read off the stored document: that round's snapshot carries
 * `dates: ['2026-09-24', '2026-09-25']` — the dates were there all along. What
 * it did NOT have was a live row, because `listSchedulesByCourse` runs
 * `excludeStartedRounds` and those days are behind us (today 2026-10-09). The
 * label fell back to the id the moment the live row was missing, ignoring the
 * snapshot sitting right beside it.
 *
 * So the fallback order is the whole fix, and it is the same order
 * `chooseRounds` already uses to decide a round's STATE: live, then snapshot,
 * then nothing. A raw ObjectId is never a thing to show anybody — it tells an
 * author nothing about which round it is and nothing about what to do.
 *
 * ── ONE FUNCTION BECAUSE THERE ARE THREE SURFACES ────────────────────────
 * The editor row, the wizard's pick options and the public card all name the
 * same round. Two of the three had their own fallback and the third dropped
 * the round entirely; that is how an author comes to see an id while a visitor
 * sees a date. The card keeps its own rule for a round with NO dates at all —
 * it omits it rather than showing a visitor a sentence about our data — and
 * that difference is deliberate and recorded at the call site.
 *
 * @param {object} round one entry of `item.rounds` (or the normalised legacy one)
 * @param {object|null} live the matching MSDB row, when the fetch returned one
 * @returns {{text: string, hasDates: boolean}}
 */
export function bundleRoundLabel(round, live = null) {
  const liveDates = Array.isArray(live?.dates) ? live.dates : [];
  const snapDates = Array.isArray(round?.snapshot?.dates) ? round.snapshot.dates : [];
  const dates = liveDates.length ? liveDates : snapDates;
  const label = formatRoundDays(dates, { showMonth: true, showYear: true });
  if (label && label !== '-') return { text: label, hasDates: true };
  return { text: BUNDLE_ROUND_GONE_LABEL, hasDates: false };
}

/** Shown when neither the live row nor the snapshot can date a round. */
export const BUNDLE_ROUND_GONE_LABEL = 'รอบเดิม (ไม่พบในตารางแล้ว)';

/** Appended to a dated round the live fetch no longer returns. */
export const BUNDLE_ROUND_STALE_SUFFIX = 'ไม่พบในตารางแล้ว';
