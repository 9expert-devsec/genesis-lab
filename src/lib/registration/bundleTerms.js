/**
 * THE BUNDLE QUOTATION'S TERMS — the eleven clauses behind เงื่อนไขการสมัคร on
 * the review step.
 *
 * ══ THIS IS LEGAL COPY. IT IS NOT EDITED HERE. ═════════════════════════════
 *
 * Supplied by the product owner and reproduced VERBATIM: same wording, same
 * order, no clause split, merged, reordered or reworded. Nothing in this file
 * may "tidy" it, and `test/pure/bundleTerms.test.mjs` pins all eleven strings
 * character for character so a well-meaning edit fails loudly instead of
 * shipping.
 *
 * ── THREE THINGS A READER WILL NOTICE, ALL RULED ON AND ALL DELIBERATE ────
 * They are written down because otherwise each one gets rediscovered as a bug
 * and "fixed" by someone acting in good faith:
 *
 *   1. REFUNDS ARE STATED TWICE, nearly. [2] reserves rights over repeat study,
 *      rescheduling and cancellation; [4] reserves rights over refunding
 *      payment. Cancelling and refunding are different acts, and both clauses
 *      stay.
 *   2. NOT-COMBINABLE AND NOT-TRANSFERABLE EACH APPEAR TWICE. [0] says a
 *      promotion cannot be combined with another; [5] says that again AND adds
 *      that rounds cannot be moved. [0] is wholly contained in [5]. Both stay.
 *      [8] — the institute reserving the right to change training dates — is a
 *      THIRD, different statement and not a duplicate of either.
 *   3. CLAUSE [10] RESERVES THE RIGHT TO GIVE ADVANCE NOTICE, which is an
 *      unusual thing to reserve; the common formulation is
 *      `โดยไม่ต้องแจ้งให้ทราบล่วงหน้า` — WITHOUT notice. It was raised as a
 *      possible missing `ไม่` and the owner confirmed the copy is as intended.
 *      DO NOT ADD THE NEGATION.
 *
 * ── WHY A MODULE AND NOT INLINE JSX ───────────────────────────────────────
 * The public payment TermsModal writes its four clauses inline, each with its
 * own numbered heading. These eleven are flat bullets with no headings, so they
 * are a list; and legal copy belongs somewhere greppable, diffable and
 * assertable without a DOM. Pure — no React, no `next/*` — so the `pure` tier
 * can hold the strings to account directly, which is the whole point.
 *
 * Frozen so a consumer cannot sort, push to, or splice the shared array and
 * change what every future reader is shown.
 */
export const BUNDLE_TERMS = Object.freeze([
  'ไม่สามารถใช้ร่วมกับโปรโมชันอื่นได้',
  'ราคานี้เป็นราคาก่อนภาษีมูลค่าเพิ่ม',
  'สงวนสิทธิ์การเรียนซ้ำ เลื่อนรอบอบรม หรือยกเลิก ในทุกกรณี',
  'หากผู้อบรมไม่สามารถอบรมได้ในวันดังกล่าว ถือว่าสละสิทธิ์',
  'ทางสถาบันขอสงวนสิทธิ์คืนค่าชำระในทุกกรณี',
  'โปรโมชันดังกล่าว เฉพาะในรอบอบรมที่กำหนด ไม่สามารถย้ายรอบได้ในทุกกรณี และไม่สามารถใช้ร่วมกับโปรโมชันอื่นได้',
  'ไม่สามารถแยกเอกสารการชำระได้ในทุกกรณี เช่น ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จรับเงิน และใบกำกับภาษี',
  'สิทธิ์นี้ไม่สามารถแลกหรือเปลี่ยนเป็นเงินสดได้',
  'สงวนสิทธิ์ในการเปลี่ยนแปลงวันที่การอบรม',
  'สงวนสิทธิ์สำหรับผู้ที่ชำระเงินภายในระยะเวลาที่กำหนดเท่านั้น',
  'หากมีการเปลี่ยนแปลงสิทธิพิเศษเป็นแบบอื่น ทางสถาบันฯ ขอสงวนสิทธิ์ในการแจ้งให้ท่านทราบล่วงหน้า',
]);

/**
 * The modal's heading, and the text of the link that opens it.
 *
 * ONE constant for both, because they must not drift: the customer clicks
 * เงื่อนไขการสมัคร and the panel that opens is titled เงื่อนไขการสมัคร, which is
 * how they know the click did what they asked.
 *
 * DELIBERATELY NOT the public modal's `เงื่อนไขการสมัครและการชำระเงิน`. That
 * title's second half is about payment, and a bundle is a QUOTATION — it takes
 * no payment, `bundleRegistrationSchema` carries no `paymentMethod` and no
 * `omiseToken`, and pointing a customer at payment terms they have not entered
 * into is the class of false statement this work keeps removing.
 */
export const BUNDLE_TERMS_TITLE = 'เงื่อนไขการสมัคร';

/**
 * The dismiss button. Same words as the public modal's, and that is the point:
 * it is the same gesture in the same product, and a second wording for "I have
 * read this, close it" would be drift for its own sake. Nothing about it names
 * payment, so the ruling that separated the two modals does not reach it.
 */
export const BUNDLE_TERMS_DISMISS = 'รับทราบและปิด';
