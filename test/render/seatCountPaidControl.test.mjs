import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';

/**
 * THERE IS NO ขอเพิ่มจำนวนผู้เข้าอบรม CONTROL, ON ANY STATUS.
 *
 * ══ WHAT THIS FILE USED TO ASSERT ═══════════════════════════════════════════
 *
 * Round 8 shipped a disclosure below the attendee list on a PAID record: a
 * ขอเพิ่มจำนวนผู้เข้าอบรม button opening a panel whose copy stated, in words and
 * with both real numbers, that raising the count would NOT recalculate the
 * amount, NOT charge more and NOT refund — and that the receipt and the
 * registration would disagree until someone reissued paperwork outside the
 * system. The admin consented to that by pressing ยืนยันเพิ่มจำนวน.
 *
 * This file asserted every clause of that copy, because the copy WAS the
 * control: the panel existed to make a consequential act deliberate.
 *
 * ══ THE CONTROL IS GONE, AND THIS FILE NOW GUARDS ITS ABSENCE ═══════════════
 *
 * Raising the count on a paid registration is not something this team does in
 * this system. When a customer asks for more seats after paying, the whole
 * thing is handled outside; the system only records that the contact happened.
 * So the panel, its action and its audit row were removed, and a paid record's
 * count can no longer be changed by any path, in either direction.
 *
 * ── WHY THE FILE SURVIVES INSTEAD OF BEING DELETED ────────────────────────
 * A deleted UI leaves no trace of why it is not there, and this one is easy to
 * re-derive: an admin asks for it, the shape is obvious, and the copy above is
 * genuinely careful. WITHOUT THIS FILE the next person to rebuild it would find
 * nothing arguing against, and the argument is not in the code — it is that the
 * WORKFLOW does not run here and the panel bought us a receipt permanently
 * disagreeing with its own registration.
 *
 * So the assertions are inverted rather than removed. Re-adding the panel turns
 * this file red, and the header is what the red points at.
 *
 * ══ WHY THE RENDER TIER, FOR AN ABSENCE ═════════════════════════════════════
 *
 * fs/attendeesCountPaidGate already asserts the tokens are gone from the SOURCE.
 * This is the different claim: that nothing REACHES THE SCREEN on any status —
 * which catches a rebuild that uses different identifiers, different copy, or a
 * different component, and would be invisible to a token scan.
 *
 * ══ WHAT THIS TIER STILL CANNOT SEE, STATED ═════════════════════════════════
 *
 * The attendee card's EDIT form sits behind `editSection`, which a click sets.
 * So "the count input is absent on a paid record" and the ชำระเงินแล้ว lock line
 * that replaced it are not assertable here and are pinned at source in
 * fs/attendeesCountPaidGate instead. Saying so rather than quietly omitting it,
 * because a reader looking for those claims should find where they live rather
 * than conclude they are missing.
 *
 * ══ NO REACT ROOT ═══════════════════════════════════════════════════════════
 * renderToStaticMarkup only — `createRoot` over jsdom leaks globalThis.window
 * into every other render test in the run (isolation:'none').
 */

const BASE = {
  _id: 'aaaaaaaaaaaaaaaaaaaa0001',
  courseName: 'Power BI Advanced',
  courseCode: 'PBI-301',
  classId: 'class-9',
  classDate: '12 - 13 ส.ค. 2569',
  scheduleType: 'classroom',
  attendanceMode: 'classroom',
  coordinator: { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' },
  attendeesListProvided: true,
  attendeesCount: 3,
  attendees: [
    { firstName: 'สมชาย', lastName: 'ใจดี', email: 'a@b.c', phone: '0812345678' },
    { firstName: 'สมหญิง', lastName: 'ดีใจ', email: 'c@d.e', phone: '0899999999' },
  ],
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-02T03:00:00.000Z',
};

/** A settled charge for THREE seats — so `pricing.seats` and the count agree at rest. */
const PAID_EXTRA = {
  status: 'paid',
  pricing: { pricePerSeat: 10000, seats: 3, subtotal: 30000, vatAmount: 2100, total: 32100 },
  payment: { method: 'promptpay', omiseStatus: 'successful', omiseChargeId: 'chrg_1', paidAt: '2026-08-02T03:00:00.000Z' },
};

const render = (extra) => renderToStaticMarkup(
  createElement(RegistrationDetailClient, { doc: { ...BASE, ...extra }, history: null }));

const RENDERS = {
  paid:      render(PAID_EXTRA),
  pending:   render({ status: 'pending' }),
  confirmed: render({ status: 'confirmed' }),
  // Cancelled-and-paid is a real combination and was the one state round 8's
  // panel had to be gated twice to exclude. It is kept because a rebuild would
  // have to get it right again.
  cancelled: render({ ...PAID_EXTRA, status: 'cancelled' }),
};

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The disclosure button's label, and the confirm button's. */
const CONTROL = 'ขอเพิ่มจำนวนผู้เข้าอบรม';
const CONFIRM = 'ยืนยันเพิ่มจำนวน';

/**
 * Every clause of the consent copy. Asserted ABSENT one clause at a time rather
 * than as one blob: a rebuild that keeps the mechanism but rewords the copy is
 * still the mechanism, and a single-string check would miss it.
 */
const CONSENT_CLAUSES = [
  'ไม่คำนวณยอดเงินใหม่',
  'ไม่เรียกเก็บเพิ่ม',
  'ไม่คืนเงินโดยอัตโนมัติ',
  'จะไม่ตรงกันจนกว่าจะออกเอกสารใหม่นอกระบบ',
  'บันทึกในประวัติการดำเนินการ พร้อมจำนวนก่อนและหลัง',
];

// ════════════════════════════════════════════════════════════════════════════
// 1. THE CONTROL REACHES NO STATE
// ════════════════════════════════════════════════════════════════════════════

for (const [status, html] of Object.entries(RENDERS)) {
  test(`no ${status} record offers the seat-count control`, () => {
    const text = textOf(html);
    assert.equal(text.includes(CONTROL), false,
      `a ${status} record still renders the ขอเพิ่มจำนวนผู้เข้าอบรม disclosure`);
    assert.equal(text.includes(CONFIRM), false,
      `a ${status} record still renders the ยืนยันเพิ่มจำนวน confirm button`);
  });
}

test('the consent copy reaches no state either', () => {
  /**
   * The copy is checked separately from the buttons because the two can be
   * removed apart, and half a removal is the worse outcome: consent text with
   * no control is confusing, and a control with no consent text is the exact
   * thing the copy existed to prevent.
   */
  for (const [status, html] of Object.entries(RENDERS)) {
    const text = textOf(html);
    for (const clause of CONSENT_CLAUSES) {
      assert.equal(text.includes(clause), false,
        `a ${status} record still renders the consent clause "${clause}"`);
    }
  }
});

test('no state renders a second number input for the seat count', () => {
  /**
   * The panel's input was `min={attendeesCount + 1}` — the increase-only floor,
   * and the shape most likely to survive a partial rebuild because it looks
   * like an ordinary field. The unpaid count input lives behind `editSection`
   * and is not rendered at this tier at all, so the correct count here is ZERO
   * on every status.
   */
  for (const [status, html] of Object.entries(RENDERS)) {
    assert.equal((html.match(/<input[^>]*type="number"/g) ?? []).length, 0,
      `a ${status} record renders a number input outside the edit form`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. CONTROLS — an absence test passes on a render that produced nothing
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: every render is real and reached the attendee section', () => {
  /**
   * THE FAILURE MODE THIS FILE IS MOST EXPOSED TO. Sixteen `includes(...) ===
   * false` assertions all pass on an empty string, on a crashed render, and on
   * a render that stopped before the section the control used to sit in.
   *
   * So each render is checked to be substantial AND to contain the attendee
   * material the panel was rendered beside — the tab label and the roster the
   * fixture supplies. If a future change moves the attendee list behind a click,
   * this control goes red and tells the next reader that the absence assertions
   * above have stopped meaning anything, instead of letting them pass forever.
   */
  for (const [status, html] of Object.entries(RENDERS)) {
    assert.ok(html.length > 5000, `the ${status} render produced ${html.length} chars`);
    const text = textOf(html);
    assert.ok(text.includes('ผู้เข้าอบรม'),
      `the ${status} render never reached the attendee section — the absence checks are vacuous`);
    assert.ok(text.includes('สมหญิง'),
      `the ${status} render does not contain the fixture roster — it stopped early`);
  }
});

test('CONTROL: the probes DO fire on markup that contains the control', () => {
  // The matchers themselves, pointed at the shape they are meant to catch —
  // as the removed panel actually rendered it.
  const rebuilt = '<button type="button">' + CONTROL + '</button>'
    + '<p>การเพิ่มจำนวนผู้เข้าอบรมจะไม่คำนวณยอดเงินใหม่ ไม่เรียกเก็บเพิ่ม และไม่คืนเงินโดยอัตโนมัติ</p>'
    + '<input type="number" min="4" max="50" value="" />'
    + '<button type="button">' + CONFIRM + '</button>';

  const text = textOf(rebuilt);
  assert.ok(text.includes(CONTROL), 'the disclosure probe is blind');
  assert.ok(text.includes(CONFIRM), 'the confirm probe is blind');
  assert.ok(text.includes('ไม่คำนวณยอดเงินใหม่'), 'the consent-copy probe is blind');
  assert.equal((rebuilt.match(/<input[^>]*type="number"/g) ?? []).length, 1,
    'the number-input probe is blind');
});
