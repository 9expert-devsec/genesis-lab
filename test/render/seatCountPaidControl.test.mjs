import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RegistrationDetailClient } from '@/app/admin/registrations/_components/RegistrationDetailClient';

/**
 * THE ขอเพิ่มจำนวนผู้เข้าอบรม CONTROL, AND THE COPY THE ADMIN CONSENTS TO.
 *
 * ══ WHY THE PANEL IS ALWAYS IN THE DOM ══════════════════════════════════════
 *
 * `renderToStaticMarkup` cannot click, so a conditionally-rendered panel would
 * put its copy behind a state this tier cannot reach — and the copy IS the
 * feature. The panel therefore ships hidden by the `hidden` ATTRIBUTE, the same
 * decision `OverflowMenu` made for the same reason, and every assertion about
 * the wording below is possible because of it.
 *
 * ══ WHAT THIS TIER CANNOT SEE, STATED ═══════════════════════════════════════
 *
 * The attendee card's EDIT form sits behind `editSection`, which a click sets.
 * So "the count input is absent on a paid record" is not assertable here and is
 * pinned at source in fs/attendeesCountPaidGate instead. Saying so rather than
 * quietly omitting it, because a reader looking for that claim should find where
 * it lives rather than conclude it is missing.
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

const PAID      = render(PAID_EXTRA);
const PENDING   = render({ status: 'pending' });
const CANCELLED = render({ ...PAID_EXTRA, status: 'cancelled' });

const textOf = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** The disclosure button, by its label — the control the brief names. */
const CONTROL = 'ขอเพิ่มจำนวนผู้เข้าอบรม';

// ════════════════════════════════════════════════════════════════════════════
// 1. THE CONTROL APPEARS ON EXACTLY ONE STATE
// ════════════════════════════════════════════════════════════════════════════

test('a paid record offers the control; an unpaid one does not', () => {
  /**
   * Both directions. "The control is on a paid record" alone would pass on a
   * screen that showed it always — which would be a control that refuses on
   * every click, since the server sends an unpaid record back to the ordinary
   * edit path.
   */
  assert.ok(PAID.includes(CONTROL), 'a paid record does not offer the seat-change control');
  assert.ok(!PENDING.includes(CONTROL),
    'an unpaid record offers the paid-only control — every click would be refused');
  // …and the unpaid record still edits its count the ordinary way, so this is
  // not passing because the card lost its edit affordance altogether.
  assert.ok(PENDING.includes('>แก้ไข<'), 'the unpaid record has no edit affordance at all');
});

test('a CANCELLED record offers neither door, even though it is also paid', () => {
  /**
   * Cancelled-and-paid is a real combination and it is the one where a
   * second gate would be forgotten. The control is gated on
   * `attendeeEdit.onEdit` — the SAME single producer every แก้ไข reads — rather
   * than on its own `readOnly` test, so this cannot drift from round 1's rule.
   */
  assert.ok(!CANCELLED.includes(CONTROL), 'a cancelled record still offers the seat-change control');
  assert.equal((CANCELLED.match(/>แก้ไข</g) ?? []).length, 0, 'a cancelled record kept a แก้ไข button');
  assert.ok(CANCELLED.includes('ลบใบสมัครนี้'), 'delete did not survive — the fixture is wrong');
  // The record still RENDERS; the absences above are not a blank page.
  assert.ok(CANCELLED.includes('Power BI Advanced'), 'the cancelled record lost its content');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE CONSENT COPY — THE WHOLE POINT OF THE CONTROL
// ════════════════════════════════════════════════════════════════════════════

/** The panel: the element the disclosure button controls. */
function panel(markup) {
  const at = markup.indexOf(CONTROL);
  assert.notEqual(at, -1, 'the control is not on this render');
  const start = markup.indexOf('<div hidden', at);
  assert.notEqual(start, -1, 'the panel is not in the DOM — it must ship hidden, not unrendered');
  return markup.slice(start, start + 3000);
}

test('the panel is in the DOM and hidden by the ATTRIBUTE, not by a class', () => {
  // A `hidden` CLASS reads as a styling accident and leaves the panel in the
  // accessibility tree. The attribute is state.
  const p = panel(PAID);
  assert.match(p, /^<div hidden/, 'the panel is not hidden by the attribute');
  assert.ok(!/class="[^"]*\bhidden\b/.test(p.slice(0, 200)), 'the panel is hidden by a class instead');

  /**
   * The trigger says so too — asserted by EXTRACTING THE BUTTON rather than by
   * proximity. The first draft matched `aria-expanded="false"` within 200
   * characters of the label and reddened on correct markup: the lucide icon
   * between them renders ~470 characters of inline `<svg>`, so the window was
   * never going to reach. A distance is not a relationship; the element is.
   */
  const trigger = [...PAID.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
    .find((m) => m[0].includes(CONTROL));
  assert.ok(trigger, 'the disclosure trigger is not a button');
  assert.match(trigger[0], /aria-expanded="false"/, 'the disclosure trigger does not report its state');
});

test('the copy states the consequence in words, not as "this affects billing"', () => {
  /**
   * ── WHAT THE ADMIN IS ACTUALLY CONSENTING TO ──────────────────────────────
   * Not "something to do with money". Specifically: the amount charged was
   * computed from `pricing.seats` and STAYS there, the registration and its
   * emails start saying something else, and nothing in this system reconciles
   * the two afterwards. Each clause is asserted because each is a separate
   * thing a reader could be surprised by later.
   */
  const t = textOf(panel(PAID));

  assert.ok(t.includes('ไม่คำนวณยอดเงินใหม่'), 'the copy does not say the total is not recalculated');
  assert.ok(t.includes('ไม่เรียกเก็บเพิ่ม'), 'the copy does not say nothing further is charged');
  assert.ok(t.includes('ไม่คืนเงินโดยอัตโนมัติ'), 'the copy does not say nothing is refunded');
  assert.ok(t.includes('จะไม่ตรงกัน'), 'the copy does not say the two numbers will disagree');
  assert.ok(t.includes('บันทึกในประวัติการดำเนินการ'), 'the copy does not say the change is traced');
});

test('the copy names the REAL charged seat count, read from pricing', () => {
  /**
   * The number is what makes the sentence a consent rather than a warning. It
   * comes from `pricing.seats` — what was actually charged for — and NOT from
   * `attendeesCount`, which is the thing about to change.
   *
   * The fixture below is the case that separates them: a record charged for 3
   * seats whose count has since been raised to 5 by some earlier route. A copy
   * reading `attendeesCount` would tell the admin the money was for 5.
   */
  const divergent = render({
    ...PAID_EXTRA,
    attendeesCount: 5,
    pricing: { ...PAID_EXTRA.pricing, seats: 3 },
  });
  const t = textOf(panel(divergent));
  assert.ok(t.includes('จาก 3 ที่นั่ง'), `the copy does not name the charged seat count: ${t.slice(0, 300)}`);
  assert.ok(t.includes('ปัจจุบัน 5 ท่าน'), 'the input label does not name the current count');
  assert.ok(!t.includes('จาก 5 ที่นั่ง'), 'the copy sourced the charged count from attendeesCount');
});

test('CONTROL: the charged-seat probe would read the wrong field if it were wired that way', () => {
  // Proves the assertion above discriminates rather than passing on any number.
  // Where the two agree, both readings produce the same string — so the
  // divergent fixture is the only one that can tell them apart, and this is the
  // check that the agreeing case is genuinely ambiguous.
  const t = textOf(panel(PAID));
  assert.ok(t.includes('จาก 3 ที่นั่ง') && t.includes('ปัจจุบัน 3 ท่าน'),
    'the agreeing fixture does not have both numbers at 3 — it cannot show the probe is ambiguous here');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE FORM INSIDE THE PANEL
// ════════════════════════════════════════════════════════════════════════════

test('the draft starts EMPTY and the confirm button starts disabled', () => {
  /**
   * A field pre-filled with the current count makes "confirm" a control whose
   * default action is a no-op the server will refuse — and the admin has to
   * notice the number is unchanged to know that. Empty states that a value is
   * required, and the disabled button says the same thing again.
   */
  const p = panel(PAID);
  assert.match(p, /<input[^>]*type="number"[^>]*value=""/,
    'the new-count field is pre-filled — confirm would default to a no-op');
  assert.match(p, /<button[^>]*disabled[^>]*>[\s\S]{0,120}ยืนยันเพิ่มจำนวน/,
    'the confirm button is enabled with no value typed');
});

test('the input floors at one above the current count — the control only adds', () => {
  // The server refuses a decrease outright; the input agrees rather than
  // inviting one and then explaining. `min` is the current count + 1.
  const p = panel(PAID);
  assert.match(p, /<input[^>]*min="4"/, 'the new-count input does not floor above the current 3');
  assert.match(p, /<input[^>]*max="50"/, 'the new-count input has no ceiling');
});
