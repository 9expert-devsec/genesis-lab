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
 *                unpublished or has expired, the section is disabled, or one
 *                of its courses or rounds no longer resolves. That is a fault
 *                on our side and it may well be fixed within the hour, so the
 *                sentence says "ขณะนี้" and points at the sales team rather
 *                than telling the visitor the offer is over.
 *
 * Collapsing them would make an unpublished page read as a cancelled
 * promotion, which is a claim we have no business making, and would leave the
 * visitor with no reason to call.
 */
export const BUNDLE_CLOSED_MESSAGE = 'โปรโมชันนี้ปิดรับสมัครแล้ว';

export const BUNDLE_UNAVAILABLE_MESSAGE =
  'ขณะนี้ยังไม่สามารถรับลงทะเบียนแพ็กเกจนี้ได้ กรุณาติดต่อทีมขายเพื่อสอบถามรายละเอียด';
